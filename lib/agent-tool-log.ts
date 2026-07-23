import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

export async function logAgentToolEvent(input: {
  toolName: string;
  ok: boolean;
  error?: string | null;
  sessionId?: string | null;
  meta?: Record<string, unknown> | null;
  workspaceId?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("agent_tool_events").insert({
      workspace_id: input.workspaceId ?? getPilotWorkspaceId(),
      tool_name: input.toolName,
      ok: input.ok,
      error: input.error?.trim() || null,
      session_id: input.sessionId ?? null,
      meta: input.meta ?? null,
    });
  } catch {
    // Never break the agent tool path because of telemetry.
  }
}
