/**
 * Rate limit for public Eve agent turns.
 *
 * Two layers:
 *  1. per-process Map — cheap short-circuit for obvious floods on one instance
 *  2. Postgres counter — the real ceiling, shared across serverless instances
 *
 * Fail-open on DB errors: a broken counter must not take the chat down.
 */
import { createAdminClient } from "@/lib/supabase/admin";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const VISITOR_WINDOW_SECONDS = 60 * 60;
const VISITOR_MAX_PER_WINDOW = 30;
const WORKSPACE_WINDOW_SECONDS = 24 * 60 * 60;
const WORKSPACE_MAX_PER_WINDOW = 2000;

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

/** Local map check. Returns false when this process alone already saw too many. */
function allowedLocally(keys: string[], windowMs: number, max: number): boolean {
  const now = Date.now();
  prune(now);

  for (const key of keys) {
    const bucket = buckets.get(key);
    if (bucket && bucket.resetAt > now && bucket.count >= max) return false;
  }
  for (const key of keys) {
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
    }
  }
  return true;
}

async function allowedInDb(
  key: string,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("bump_agent_rate_limit", {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) {
      console.error("[agent-rate-limit] rpc failed", error.message);
      return true; // fail open
    }
    return data !== false;
  } catch (error) {
    console.error("[agent-rate-limit] rpc threw", error);
    return true; // fail open
  }
}

export async function checkAgentRateLimit(input: {
  visitorId?: string | null;
  ip?: string | null;
  workspaceSlug?: string | null;
}): Promise<{ ok: true } | { ok: false; errorCode: "agent_rate_limited" }> {
  const visitorKeys = [
    input.visitorId?.trim() ? `v:${input.visitorId.trim()}` : null,
    input.ip?.trim() ? `ip:${input.ip.trim()}` : null,
  ].filter(Boolean) as string[];
  if (visitorKeys.length === 0) visitorKeys.push("anon");

  if (
    !allowedLocally(
      visitorKeys,
      VISITOR_WINDOW_SECONDS * 1000,
      VISITOR_MAX_PER_WINDOW,
    )
  ) {
    return { ok: false, errorCode: "agent_rate_limited" };
  }

  for (const key of visitorKeys) {
    const ok = await allowedInDb(
      key,
      VISITOR_WINDOW_SECONDS,
      VISITOR_MAX_PER_WINDOW,
    );
    if (!ok) return { ok: false, errorCode: "agent_rate_limited" };
  }

  const slug = input.workspaceSlug?.trim().toLowerCase();
  if (slug) {
    const ok = await allowedInDb(
      `w:${slug}`,
      WORKSPACE_WINDOW_SECONDS,
      WORKSPACE_MAX_PER_WINDOW,
    );
    if (!ok) return { ok: false, errorCode: "agent_rate_limited" };
  }

  return { ok: true };
}

export function clientIpFromRequest(request: Request): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || null;
}
