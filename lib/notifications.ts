import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPilotWorkspaceId } from "@/lib/workspace";

export const NOTIFICATION_TYPES = [
  "lead_new",
  "lead_urgent",
  "booking_created",
  "tool_error",
  "booking_mirror_failed",
  "booking_cancelled",
  "booking_rescheduled",
  "lead_stale",
  "ai_config",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type NotificationSeverity = "high" | "medium" | "low";

export const NOTIFICATION_TYPE_GROUPS = {
  leads: ["lead_new", "lead_urgent", "lead_stale"],
  bookings: [
    "booking_created",
    "booking_mirror_failed",
    "booking_cancelled",
    "booking_rescheduled",
  ],
  ai: ["tool_error", "ai_config"],
} as const;

export type NotificationTypeGroup = keyof typeof NOTIFICATION_TYPE_GROUPS;

export type NotificationRow = {
  id: string;
  workspace_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
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

export type CreateNotificationInput = {
  type: NotificationType;
  title: string;
  body?: string;
  severity?: NotificationSeverity;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  workspaceId?: string;
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

/** Fire-and-forget safe for agent tools — never throws to callers. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        workspace_id: input.workspaceId ?? getPilotWorkspaceId(),
        type: input.type,
        title: input.title.trim(),
        body: (input.body ?? "").trim(),
        severity: input.severity ?? "medium",
        href: input.href ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[notifications] create failed", error.message);
      return null;
    }
    return data.id as string;
  } catch (error) {
    console.error("[notifications] create failed", error);
    return null;
  }
}

/**
 * Skip create if the same workspace+type+entity_id was notified within
 * `windowMinutes` (default 24h). Used for digests / sync churn.
 */
export async function createNotificationDebounced(
  input: CreateNotificationInput & { windowMinutes?: number },
): Promise<string | null> {
  try {
    const workspaceId = input.workspaceId ?? getPilotWorkspaceId();
    const entityId = input.entityId ?? null;
    if (!entityId) {
      return createNotification(input);
    }

    const since = new Date(
      Date.now() - (input.windowMinutes ?? 24 * 60) * 60_000,
    ).toISOString();

    const supabase = createAdminClient();
    const { data: recent } = await supabase
      .from("notifications")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("type", input.type)
      .eq("entity_id", entityId)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (recent?.id) return null;
    return createNotification({ ...input, workspaceId });
  } catch (error) {
    console.error("[notifications] debounce create failed", error);
    return null;
  }
}

/**
 * Prefer collapsing into an existing unread tool_error for the same
 * tool+session. Otherwise debounce new rows (default 5 minutes).
 */
export async function createToolErrorNotificationDebounced(input: {
  toolName: string;
  error: string;
  sessionId?: string | null;
  workspaceId?: string;
  windowMinutes?: number;
}): Promise<void> {
  try {
    const workspaceId = input.workspaceId ?? getPilotWorkspaceId();
    const entityId = `${input.toolName}:${input.sessionId ?? "none"}`;
    const errorText = input.error.slice(0, 480);
    const supabase = createAdminClient();

    const { data: unread } = await supabase
      .from("notifications")
      .select("id, body")
      .eq("workspace_id", workspaceId)
      .eq("type", "tool_error")
      .eq("entity_id", entityId)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (unread?.id) {
      const match = /^Lần (\d+)\s*·/.exec(unread.body ?? "");
      const nextCount = match ? Number(match[1]) + 1 : 2;
      const { error } = await supabase
        .from("notifications")
        .update({
          body: `Lần ${nextCount} · ${errorText}`,
          title: `Lỗi tool: ${input.toolName}`,
          severity: "high",
          created_at: new Date().toISOString(),
        })
        .eq("id", unread.id);
      if (error) {
        console.error("[notifications] collapse tool_error failed", error.message);
      }
      return;
    }

    await createNotificationDebounced({
      type: "tool_error",
      title: `Lỗi tool: ${input.toolName}`,
      body: errorText,
      severity: "high",
      href: "/dashboard/conversations",
      entityType: "tool",
      entityId,
      workspaceId,
      windowMinutes: input.windowMinutes ?? 5,
    });
  } catch {
    // never break tool path
  }
}

export async function listNotifications(input?: {
  unreadOnly?: boolean;
  /** Unread rows first, then by created_at. Default true when not unreadOnly. */
  unreadFirst?: boolean;
  limit?: number;
  cursor?: NotificationCursor | null;
  types?: readonly NotificationType[];
  group?: NotificationTypeGroup | null;
}): Promise<ListNotificationsResult> {
  const supabase = await createClient();
  const limit = Math.min(Math.max(input?.limit ?? PAGE_DEFAULT, 1), 100);
  const unreadOnly = Boolean(input?.unreadOnly);
  const unreadFirst = input?.unreadFirst ?? !unreadOnly;
  const types =
    input?.types ??
    (input?.group ? NOTIFICATION_TYPE_GROUPS[input.group] : undefined);

  let query = supabase
    .from("notifications")
    .select(SELECT)
    .eq("workspace_id", getPilotWorkspaceId());

  if (unreadOnly) {
    query = query.is("read_at", null);
  }

  if (types && types.length > 0) {
    query = query.in("type", [...types]);
  }

  if (input?.cursor?.created_at && input.cursor.id) {
    const { created_at, id } = input.cursor;
    // Keyset: (created_at, id) < cursor for desc order. Quote ISO timestamp.
    query = query.or(
      `created_at.lt."${created_at}",and(created_at.eq."${created_at}",id.lt.${id})`,
    );
  }

  // Keyset cursor requires created_at/id order. Unread-first only for first page (bell).
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
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", getPilotWorkspaceId())
    .is("read_at", null);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", getPilotWorkspaceId())
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("workspace_id", getPilotWorkspaceId())
    .is("read_at", null);

  if (error) throw new Error(error.message);
}

/** Delete read notifications older than `days` (default 30). Admin only. */
export async function purgeOldNotifications(
  days = 30,
  workspaceId = getPilotWorkspaceId(),
): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .delete()
      .eq("workspace_id", workspaceId)
      .not("read_at", "is", null)
      .lt("created_at", cutoff.toISOString())
      .select("id");

    if (error) {
      console.error("[notifications] purge failed", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (error) {
    console.error("[notifications] purge failed", error);
    return 0;
  }
}
