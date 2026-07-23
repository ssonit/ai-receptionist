import { createAdminClient } from "@/lib/supabase/admin";
import {
  createNotificationDebounced,
  purgeOldNotifications,
} from "@/lib/notifications";
import { getDefaultWorkspaceId } from "@/lib/workspace";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Phase-2 digests: stale leads + missing AI config + retention purge.
 * Safe to call from sync / API — debounced 24h per entity.
 */
export async function ensureDigestNotifications(
  workspaceId = getDefaultWorkspaceId(),
): Promise<void> {
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
      title: "Lead new quá 3 ngày",
      body: `${label} vẫn ở trạng thái new — nên gọi lại hoặc chuyển contacted/lost.`,
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
      title: "Chưa chọn meeting type cho AI",
      body: "Agent không check slot / đặt lịch được cho đến khi chọn type ở Settings.",
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
      title: "Chưa lấy được Cal.com username",
      body: "Mở Meeting types để sync profile, hoặc kiểm tra CALCOM_API_KEY.",
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
      title: "FAQ trống",
      body: "Agent thiếu Q&A — khách hỏi dịch vụ/giờ dễ bị trả lời generic.",
      severity: "medium",
      href: "/dashboard/faq",
      entityType: "ai_config",
      entityId: "empty-faq",
      workspaceId,
      windowMinutes: 24 * 60,
    });
  }
}
