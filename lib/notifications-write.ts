import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultWorkspaceId } from "@/lib/workspace";

/**
 * Write-path notifications for agent tools / sync.
 * Must NOT import next/headers or @/lib/supabase/server (Eve agent bundle).
 */

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

/** Fire-and-forget safe for agent tools — never throws to callers. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        workspace_id: input.workspaceId ?? getDefaultWorkspaceId(),
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
    const workspaceId = input.workspaceId ?? getDefaultWorkspaceId();
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
    const workspaceId = input.workspaceId ?? getDefaultWorkspaceId();
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
        console.error(
          "[notifications] collapse tool_error failed",
          error.message,
        );
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

/** Delete read notifications older than `days` (default 30). Admin only. */
export async function purgeOldNotifications(
  days = 30,
  workspaceId = getDefaultWorkspaceId(),
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
