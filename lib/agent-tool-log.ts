import { createAdminClient } from "@/lib/supabase/admin";
import { createToolErrorNotificationDebounced } from "@/lib/notifications-write";

export async function logAgentToolEvent(input: {
  toolName: string;
  ok: boolean;
  error?: string | null;
  sessionId?: string | null;
  meta?: Record<string, unknown> | null;
  /** Required — never fall back to another tenant's workspace. */
  workspaceId: string;
}): Promise<void> {
  try {
    if (!input.workspaceId.trim()) {
      console.error("[agent-tool-log] refused: missing workspaceId");
      return;
    }
    const workspaceId = input.workspaceId;
    const supabase = createAdminClient();
    await supabase.from("agent_tool_events").insert({
      workspace_id: workspaceId,
      tool_name: input.toolName,
      ok: input.ok,
      error: input.error?.trim() || null,
      session_id: input.sessionId ?? null,
      meta: input.meta ?? null,
    });

    if (!input.ok && input.error?.trim()) {
      await createToolErrorNotificationDebounced({
        toolName: input.toolName,
        error: input.error.trim(),
        sessionId: input.sessionId,
        workspaceId,
      });
    }
  } catch {
    // Never break the agent tool path because of telemetry.
  }
}
