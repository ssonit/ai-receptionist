import { bookingConfig } from "@/lib/booking-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

export type AiBookingEventType = {
  workspaceId: string;
  id: string;
  calEventTypeId: number;
  slug: string;
  title: string;
  lengthMinutes: number;
  minimumNoticeMinutes: number | null;
  username: string;
};

export type WorkspaceEventTypeRow = {
  id: string;
  workspace_id: string;
  cal_event_type_id: number;
  slug: string;
  title: string;
  length_minutes: number;
  minimum_notice_minutes: number | null;
  is_ai_booking: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
  raw: unknown | null;
};

/** App-facing alias — Cal.com API says event types; Eve UI says meeting types. */
export type WorkspaceMeetingTypeRow = WorkspaceEventTypeRow;

/**
 * Resolve the single meeting type used by AI booking tools.
 * Prefer DB (`is_ai_booking` / workspaces.cal_event_type_id), else env bootstrap.
 */
export async function getAiBookingEventType(
  workspaceId: string = getPilotWorkspaceId(),
): Promise<AiBookingEventType | null> {
  const supabase = createAdminClient();

  const { data: aiRow } = await supabase
    .from("workspace_event_types")
    .select(
      "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, is_ai_booking",
    )
    .eq("workspace_id", workspaceId)
    .eq("is_ai_booking", true)
    .maybeSingle();

  if (aiRow) {
    return {
      workspaceId,
      id: aiRow.id,
      calEventTypeId: aiRow.cal_event_type_id,
      slug: aiRow.slug,
      title: aiRow.title,
      lengthMinutes: aiRow.length_minutes,
      minimumNoticeMinutes: aiRow.minimum_notice_minutes,
      username: bookingConfig.cal.username,
    };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("cal_event_type_id, cal_event_type_slug, cal_username")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspace?.cal_event_type_id) {
    return {
      workspaceId,
      id: "",
      calEventTypeId: workspace.cal_event_type_id,
      slug: workspace.cal_event_type_slug || bookingConfig.cal.eventTypeSlug,
      title: workspace.cal_event_type_slug || "AI booking",
      lengthMinutes: 30,
      minimumNoticeMinutes: bookingConfig.minNoticeHours * 60,
      username: workspace.cal_username || bookingConfig.cal.username,
    };
  }

  if (bookingConfig.cal.eventTypeId) {
    return {
      workspaceId,
      id: "",
      calEventTypeId: bookingConfig.cal.eventTypeId,
      slug: bookingConfig.cal.eventTypeSlug,
      title: bookingConfig.cal.eventTypeSlug || "AI booking",
      lengthMinutes: 30,
      minimumNoticeMinutes: bookingConfig.minNoticeHours * 60,
      username: bookingConfig.cal.username,
    };
  }

  if (bookingConfig.cal.username && bookingConfig.cal.eventTypeSlug) {
    return {
      workspaceId,
      id: "",
      calEventTypeId: 0,
      slug: bookingConfig.cal.eventTypeSlug,
      title: bookingConfig.cal.eventTypeSlug,
      lengthMinutes: 30,
      minimumNoticeMinutes: bookingConfig.minNoticeHours * 60,
      username: bookingConfig.cal.username,
    };
  }

  return null;
}

export async function listWorkspaceMeetingTypes(
  workspaceId: string,
): Promise<WorkspaceMeetingTypeRow[]> {
  return listWorkspaceEventTypes(workspaceId);
}

export async function listWorkspaceEventTypes(
  workspaceId: string,
): Promise<WorkspaceEventTypeRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_event_types")
    .select(
      "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, is_ai_booking, synced_at, created_at, updated_at, raw",
    )
    .eq("workspace_id", workspaceId)
    .order("title", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}
