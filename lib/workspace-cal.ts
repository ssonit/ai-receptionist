import { bookingConfig } from "@/lib/booking-config";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * Prompt block: what the agent may book via chat tools.
 * Prefer this over FAQ/services copy when they disagree on duration/title.
 */
export function formatAiBookableMeetingTypeMarkdown(
  aiEvent: AiBookingEventType | null,
): string {
  if (!aiEvent) {
    return [
      "## AI bookable meeting type",
      "",
      "Not configured yet — the owner must select one under Dashboard → Agent → Booking.",
      "Do not invent a duration or claim guests can book a specific meeting type via chat until configured.",
      "",
    ].join("\n");
  }

  const title = aiEvent.title.trim() || aiEvent.slug;
  return [
    "## AI bookable meeting type",
    "",
    `- **AI bookable type:** ${title} · ${aiEvent.lengthMinutes} phút · slug \`${aiEvent.slug}\``,
    "- When describing what guests can book **via chat**, use this title and duration.",
    "- Do **not** invent another duration. FAQ / services text is supplementary — it must **not** override this type.",
    "- `check_availability` / `book_appointment` always use this Cal.com meeting type.",
    "",
  ].join("\n");
}

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
 * Prefer DB (`is_ai_booking` / workspaces.cal_event_type_id), else env bootstrap
 * for Eve Pilot only.
 */
export async function getAiBookingEventType(
  workspaceId: string,
): Promise<AiBookingEventType | null> {
  if (!workspaceId.trim()) return null;
  const { getDefaultWorkspaceId } = await import("@/lib/workspace");
  const wsId = workspaceId;
  const supabase = createAdminClient();

  const [{ data: aiRow }, { data: workspace }] = await Promise.all([
    supabase
      .from("workspace_event_types")
      .select(
        "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, is_ai_booking",
      )
      .eq("workspace_id", wsId)
      .eq("is_ai_booking", true)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("cal_event_type_id, cal_event_type_slug, cal_username")
      .eq("id", wsId)
      .maybeSingle(),
  ]);

  const username =
    workspace?.cal_username || bookingConfig.cal.username || "";

  if (aiRow) {
    return {
      workspaceId: wsId,
      id: aiRow.id,
      calEventTypeId: aiRow.cal_event_type_id,
      slug: aiRow.slug,
      title: aiRow.title,
      lengthMinutes: aiRow.length_minutes,
      minimumNoticeMinutes: aiRow.minimum_notice_minutes,
      username,
    };
  }

  if (workspace?.cal_event_type_id) {
    return {
      workspaceId: wsId,
      id: "",
      calEventTypeId: workspace.cal_event_type_id,
      slug: workspace.cal_event_type_slug || bookingConfig.cal.eventTypeSlug,
      title: workspace.cal_event_type_slug || "AI booking",
      lengthMinutes: 30,
      minimumNoticeMinutes: bookingConfig.minNoticeHours * 60,
      username,
    };
  }

  // Env bootstrap only for Eve Pilot (`/chat` demo) — tenants use DB meeting types
  if (wsId === getDefaultWorkspaceId()) {
    if (bookingConfig.cal.eventTypeId) {
      return {
        workspaceId: wsId,
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
        workspaceId: wsId,
        id: "",
        calEventTypeId: 0,
        slug: bookingConfig.cal.eventTypeSlug,
        title: bookingConfig.cal.eventTypeSlug,
        lengthMinutes: 30,
        minimumNoticeMinutes: bookingConfig.minNoticeHours * 60,
        username: bookingConfig.cal.username,
      };
    }
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

/** A single meeting type, scoped to its workspace — never a bare-id read. */
export async function getWorkspaceEventTypeById(
  workspaceId: string,
  id: string,
): Promise<WorkspaceEventTypeRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_event_types")
    .select(
      "id, workspace_id, cal_event_type_id, slug, title, length_minutes, minimum_notice_minutes, is_ai_booking, synced_at, created_at, updated_at, raw",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as WorkspaceEventTypeRow) ?? null;
}

export function eventRefFromMeetingType(
  row: Pick<WorkspaceEventTypeRow, "cal_event_type_id" | "slug">,
  username: string,
): { eventTypeId?: number; eventTypeSlug: string; username: string } {
  return {
    eventTypeId: row.cal_event_type_id || undefined,
    eventTypeSlug: row.slug,
    username,
  };
}
