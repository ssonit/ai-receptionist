import {
  CAL_WEBHOOK_TRIGGER_EVENTS,
  createWebhook,
  listWebhooks,
  withCalApiKey,
} from "@/lib/calcom";
import { appOrigin } from "@/lib/app-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWebhookSecret, getCalAccessTokenForWorkspace } from "@/lib/workspace";

export type EnsureCalWebhookResult =
  | { ok: true; skipped: boolean }
  | { ok: false; error: string };

/**
 * Best-effort, non-fatal: registers this workspace's Cal.com webhook if it
 * isn't already, using whatever credential is available (API key or OAuth
 * via getCalAccessTokenForWorkspace). Never throws — callers get a result,
 * not an exception, because sync/connect flows must not break if Cal.com
 * rejects webhook creation (e.g. missing OAuth scope, see spec section 5).
 *
 * Retry story: this runs every time syncCalBookingsToSupabase() runs (OAuth
 * callback, API-key save, and the dashboard's manual "Resync" button all
 * call it) — cal_webhook_synced_at only advances past NULL on success, so a
 * transient failure self-heals on the next of those calls without a cron.
 */
export async function ensureCalWebhookForWorkspace(
  workspaceId: string,
): Promise<EnsureCalWebhookResult> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("workspaces")
    .select("cal_webhook_synced_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (data?.cal_webhook_synced_at) {
    return { ok: true, skipped: true };
  }

  try {
    const token = await getCalAccessTokenForWorkspace(workspaceId);
    const secret = await ensureWebhookSecret(workspaceId);
    const subscriberUrl = `${appOrigin()}/api/cal/webhook?workspace_id=${workspaceId}`;

    await withCalApiKey(token, async () => {
      const existing = await listWebhooks();
      const alreadyRegistered = existing.some(
        (w) => w.subscriberUrl === subscriberUrl,
      );
      if (!alreadyRegistered) {
        await createWebhook({
          subscriberUrl,
          secret,
          triggers: CAL_WEBHOOK_TRIGGER_EVENTS,
        });
      }
    });

    await supabase
      .from("workspaces")
      .update({ cal_webhook_synced_at: new Date().toISOString() })
      .eq("id", workspaceId);

    return { ok: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "webhook registration failed";
    console.error("[cal-webhook-setup] ensure failed", workspaceId, message);
    return { ok: false, error: message };
  }
}
