import { createAdminClient } from "@/lib/supabase/admin";
import {
  createNotificationDebounced,
  purgeOldNotifications,
} from "@/lib/notifications";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Phase-2 digests: stale leads + missing AI config + retention purge.
 * Safe to call from sync / API — debounced 24h per entity.
 * Always scoped to one workspace (never Eve Pilot by default).
 */
export async function ensureDigestNotifications(
  workspaceId: string,
): Promise<void> {
  if (!workspaceId.trim()) {
    console.error("[notifications] digest refused: missing workspaceId");
    return;
  }
  try {
    await Promise.all([
      ensureStaleLeadNotifications(workspaceId),
      ensureAiConfigNotifications(workspaceId),
      purgeOldNotifications(30, workspaceId),
    ]);
  } catch (error) {
    console.error("[notifications] digest failed", error);
  }
}

async function ensureStaleLeadNotifications(workspaceId: string) {
  const supabase = createAdminClient();
  const staleBefore = daysAgoIso(3);

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, full_name, phone, created_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "new")
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("[notifications] stale leads query failed", error.message);
    return;
  }

  for (const lead of leads ?? []) {
    const label =
      lead.full_name?.trim() || lead.phone || lead.id.slice(0, 8);
    await createNotificationDebounced({
      type: "lead_stale",
      title: "Lead still new after 3 days",
      body: `${label} is still in new status — follow up or move to contacted/lost.`,
      severity: "medium",
      href: "/dashboard/leads",
      entityType: "lead",
      entityId: lead.id,
      workspaceId,
      windowMinutes: 24 * 60,
    });
  }
}

async function ensureAiConfigNotifications(workspaceId: string) {
  const supabase = createAdminClient();

  const [workspaceRes, aiMeetingTypeRes, faqCountRes] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "cal_username, about, agent_instructions, cal_event_type_id, cal_event_type_slug",
      )
      .eq("id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_event_types")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_ai_booking", true),
    supabase
      .from("workspace_faq_items")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);

  const workspace = workspaceRes.data;
  const hasAiMeetingType = Boolean(
    (aiMeetingTypeRes.count ?? 0) > 0 ||
      workspace?.cal_event_type_id ||
      workspace?.cal_event_type_slug,
  );
  const faqCount = faqCountRes.count ?? 0;
  const calUsername = workspace?.cal_username?.trim() ?? "";

  if (!hasAiMeetingType) {
    await createNotificationDebounced({
      type: "ai_config",
      title: "AI meeting type not selected",
      body: "Agent cannot check slots or book until a type is selected in Settings.",
      severity: "high",
      href: "/dashboard/settings",
      entityType: "ai_config",
      entityId: "missing-ai-meeting-type",
      workspaceId,
      windowMinutes: 24 * 60,
    });
  }

  if (!calUsername) {
    await createNotificationDebounced({
      type: "ai_config",
      title: "Cal.com username not available",
      body: "Open Meeting types to sync the profile, or check CALCOM_API_KEY.",
      severity: "medium",
      href: "/dashboard/meeting-types",
      entityType: "ai_config",
      entityId: "missing-cal-username",
      workspaceId,
      windowMinutes: 24 * 60,
    });
  }

  if (faqCount === 0) {
    await createNotificationDebounced({
      type: "ai_config",
      title: "FAQ is empty",
      body: "Agent lacks Q&A — service/hours questions may get generic answers.",
      severity: "medium",
      href: "/dashboard/faq",
      entityType: "ai_config",
      entityId: "empty-faq",
      workspaceId,
      windowMinutes: 24 * 60,
    });
  }
}
