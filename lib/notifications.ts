import { createClient } from "@/lib/supabase/server";
import { getSessionWorkspaceId } from "@/lib/workspace-session";

export {
  NOTIFICATION_TYPES,
  createNotification,
  createNotificationDebounced,
  createToolErrorNotificationDebounced,
  purgeOldNotifications,
  type CreateNotificationInput,
  type NotificationSeverity,
  type NotificationType,
} from "@/lib/notifications-write";

export const NOTIFICATION_TYPE_GROUPS = {
  leads: [
    "lead_new",
    "lead_urgent",
    "long_treatment_requested",
    "lead_stale",
  ],
  bookings: [
    "booking_created",
    "booking_mirror_failed",
    "booking_cancelled",
    "booking_rescheduled",
    "booking_cancelled_by_guest",
    "booking_rescheduled_by_guest",
    "booking_change_requested",
  ],
  ai: ["tool_error", "ai_config"],
} as const;

export type NotificationTypeGroup = keyof typeof NOTIFICATION_TYPE_GROUPS;

export type NotificationRow = {
  id: string;
  workspace_id: string | null;
  type: import("@/lib/notifications-write").NotificationType;
  title: string;
  body: string;
  severity: import("@/lib/notifications-write").NotificationSeverity;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationCursor = {
  created_at: string;
  id: string;
};

export type ListNotificationsResult = {
  items: NotificationRow[];
  nextCursor: NotificationCursor | null;
};

const SELECT =
  "id, workspace_id, type, title, body, severity, href, entity_type, entity_id, read_at, created_at";

const PAGE_DEFAULT = 30;

export function parseNotificationTypeGroup(
  value: string | null | undefined,
): NotificationTypeGroup | null {
  if (value === "leads" || value === "bookings" || value === "ai") return value;
  return null;
}

export async function listNotifications(input?: {
  unreadOnly?: boolean;
  /** Unread rows first, then by created_at. Default true when not unreadOnly. */
  unreadFirst?: boolean;
  limit?: number;
  cursor?: NotificationCursor | null;
  types?: readonly import("@/lib/notifications-write").NotificationType[];
  group?: NotificationTypeGroup | null;
}): Promise<ListNotificationsResult> {
  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return { items: [], nextCursor: null };
  const limit = Math.min(Math.max(input?.limit ?? PAGE_DEFAULT, 1), 100);
  const unreadOnly = Boolean(input?.unreadOnly);
  const unreadFirst = input?.unreadFirst ?? !unreadOnly;
  const types =
    input?.types ??
    (input?.group ? NOTIFICATION_TYPE_GROUPS[input.group] : undefined);

  let query = supabase
    .from("notifications")
    .select(SELECT)
    .eq("workspace_id", workspaceId);

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  if (types && types.length > 0) {
    query = query.in("type", [...types]);
  }

  if (input?.cursor?.created_at && input.cursor.id) {
    const { created_at, id } = input.cursor;
    query = query.or(
      `created_at.lt."${created_at}",and(created_at.eq."${created_at}",id.lt.${id})`,
    );
  }

  const useUnreadFirst = unreadFirst && !unreadOnly && !input?.cursor;
  if (useUnreadFirst) {
    query = query
      .order("read_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  } else {
    query = query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const { data, error } = await query.limit(limit + 1);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as NotificationRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? { created_at: last.created_at, id: last.id }
      : null;

  return { items, nextCursor };
}

export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return 0;
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .is("read_at", null);

  if (error) throw new Error(error.message);
}
