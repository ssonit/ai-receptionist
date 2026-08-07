import { ensureDigestNotifications } from "@/lib/notification-digests";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncCalBookingsToSupabase } from "@/lib/sync-cal-bookings";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

/**
 * Workspaces that need a background sync this tick:
 * any with a confirmed booking in the next 48h (keeps Cal mirror fresh).
 */
async function workspaceIdsForTick(): Promise<string[]> {
  const supabase = createAdminClient();
  const now = Date.now();
  const horizon = new Date(now + 48 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: upcoming } = await supabase
    .from("bookings")
    .select("workspace_id")
    .gte("start_time", nowIso)
    .lte("start_time", horizon)
    .not("status", "ilike", "%cancel%")
    .limit(2000);

  const ids = new Set<string>();
  for (const row of upcoming ?? []) {
    if (row.workspace_id) ids.add(row.workspace_id as string);
  }
  return [...ids];
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceIds = await workspaceIdsForTick();
  const syncResults: {
    workspaceId: string;
    synced: number;
    skipped?: boolean;
    error?: string;
  }[] = [];

  for (const workspaceId of workspaceIds) {
    try {
      const result = await syncCalBookingsToSupabase(workspaceId);
      syncResults.push({
        workspaceId,
        synced: result.synced,
        skipped: result.skipped,
        error: result.error,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "sync failed";
      console.error("[cron/tick] sync failed", workspaceId, message);
      syncResults.push({ workspaceId, synced: 0, error: message });
    }
  }

  // Digests also run inside sync; call again for workspaces that synced
  // this tick so stale-lead / AI-config alerts still fire.
  for (const workspaceId of workspaceIds) {
    try {
      await ensureDigestNotifications(workspaceId);
    } catch (error) {
      console.error("[cron/tick] digest failed", workspaceId, error);
    }
  }

  try {
    await createAdminClient().rpc("prune_agent_rate_limits");
  } catch (error) {
    console.error("[cron/tick] rate-limit prune failed", error);
  }

  return Response.json({
    ok: true,
    workspaces: workspaceIds.length,
    sync: syncResults,
  });
}
