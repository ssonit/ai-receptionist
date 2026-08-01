import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/workspace-secrets";
import { getPilotWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Operator endpoint, not a dashboard one: it writes to *every* tenant with the
 * service-role client, so it is gated on CRON_SECRET like `/api/cron/tick`
 * rather than on a logged-in owner. `/api/dashboard/**` is outside the proxy
 * matcher, so without this check the route is anonymous.
 */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * One-shot: generate a per-workspace webhook secret for every workspace that
 * doesn't have one yet. Pilot is skipped — it uses the env var.
 *
 * Running this cuts every affected tenant off the shared env secret, so their
 * existing Cal.com webhooks return 401 until the owner pastes the new secret
 * from Settings. Deliberate, one-way, and why it is not self-service.
 */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const pilotId = getPilotWorkspaceId();

  const { data: rows, error } = await supabase
    .from("workspaces")
    .select("id")
    .is("webhook_secret_encrypted", null);

  if (error || !rows) {
    console.error("[backfill] could not list workspaces", error);
    return Response.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  let updated = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const row of rows) {
    if (row.id === pilotId) {
      skipped++;
      continue;
    }

    const enc = encryptSecret(randomBytes(32).toString("hex"));
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({ webhook_secret_encrypted: enc })
      .eq("id", row.id);

    // An unchecked failure here would report a workspace as migrated while it
    // silently stays on the (now Pilot-only) env fallback — i.e. no secret.
    if (updateError) {
      console.error(`[backfill] workspace ${row.id} failed`, updateError);
      failed.push(row.id);
      continue;
    }
    updated++;
  }

  // Ids only, never names — the caller is an operator, not a tenant.
  return Response.json({
    ok: failed.length === 0,
    updated,
    skipped,
    failed,
  });
}
