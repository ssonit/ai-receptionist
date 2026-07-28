import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Write-path notifications for agent tools / sync.
 * Must NOT import next/headers or @/lib/supabase/server (Eve agent bundle).
 *
 * Every write requires an explicit workspaceId — never fall back to Eve Pilot
 * (that would leak alerts into the wrong tenant inbox).
 */

export const NOTIFICATION_TYPES = [
  "lead_new",
  "lead_urgent",
  "long_treatment_requested",
  "booking_created",
  "tool_error",
  "booking_mirror_failed",
  "booking_cancelled",
  "booking_rescheduled",
  "lead_stale",
  "ai_config",
  "booking_cancelled_by_guest",
  "booking_rescheduled_by_guest",
  "booking_change_requested",
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
  /** Required for multi-tenant isolation. */
  workspaceId: string;
};

function requireWorkspaceId(workspaceId: string | undefined, label: string): string | null {
  const id = workspaceId?.trim();
  if (!id) {
    console.error(`[notifications] ${label} refused: missing workspaceId`);
    return null;
  }
  return id;
}

/** Fire-and-forget safe for agent tools — never throws to callers. */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<string | null> {
  try {
    const workspaceId = requireWorkspaceId(input.workspaceId, "create");
    if (!workspaceId) return null;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        workspace_id: workspaceId,
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
    const workspaceId = requireWorkspaceId(input.workspaceId, "debounce");
    if (!workspaceId) return null;

    const entityId = input.entityId ?? null;
    if (!entityId) {
      return createNotification({ ...input, workspaceId });
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
  workspaceId: string;
  windowMinutes?: number;
}): Promise<void> {
  try {
    const workspaceId = requireWorkspaceId(input.workspaceId, "tool_error");
    if (!workspaceId) return;

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
      const match = /^Attempt (\d+)\s*·/.exec(unread.body ?? "");
      const nextCount = match ? Number(match[1]) + 1 : 2;
      const { error } = await supabase
        .from("notifications")
        .update({
          body: `Attempt ${nextCount} · ${errorText}`,
          title: `Tool error: ${input.toolName}`,
          severity: "high",
          created_at: new Date().toISOString(),
        })
        .eq("id", unread.id)
        .eq("workspace_id", workspaceId);
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
      title: `Tool error: ${input.toolName}`,
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

/** Delete read notifications older than `days` (default 30). Scoped to one workspace. */
export async function purgeOldNotifications(
  days = 30,
  workspaceId?: string,
): Promise<number> {
  try {
    const wsId = requireWorkspaceId(workspaceId, "purge");
    if (!wsId) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("notifications")
      .delete()
      .eq("workspace_id", wsId)
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
