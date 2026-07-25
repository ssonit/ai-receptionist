/**
 * Simple in-memory rate limit for public Eve agent turns (S9).
 * Best-effort per process — enough to blunt casual spam on a single instance.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export function checkAgentRateLimit(input: {
  visitorId?: string | null;
  ip?: string | null;
}): { ok: true } | { ok: false; errorCode: "agent_rate_limited" } {
  const now = Date.now();
  prune(now);

  const keys = [
    input.visitorId?.trim() ? `v:${input.visitorId.trim()}` : null,
    input.ip?.trim() ? `ip:${input.ip.trim()}` : null,
  ].filter(Boolean) as string[];

  if (keys.length === 0) {
    keys.push("anon");
  }

  for (const key of keys) {
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      buckets.set(key, bucket);
    }
    if (bucket.count >= MAX_PER_WINDOW) {
      return { ok: false, errorCode: "agent_rate_limited" };
    }
  }

  for (const key of keys) {
    const bucket = buckets.get(key)!;
    bucket.count += 1;
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
