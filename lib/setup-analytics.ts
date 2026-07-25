/**
 * Lightweight setup-funnel events (stored in agent_tool_events).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type SetupAnalyticsEvent =
  | "setup_open"
  | "setup_step1_done"
  | "setup_step2_view"
  | "setup_cal_skip"
  | "setup_cal_connected"
  | "setup_meeting_type"
  | "setup_complete_dashboard";

export async function logSetupEvent(input: {
  workspaceId: string;
  event: SetupAnalyticsEvent;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    if (!input.workspaceId.trim()) return;
    const supabase = createAdminClient();
    await supabase.from("agent_tool_events").insert({
      workspace_id: input.workspaceId,
      tool_name: `setup:${input.event}`,
      ok: true,
      error: null,
      session_id: null,
      meta: { event: input.event, ...(input.meta ?? {}) },
    });
  } catch {
    // never break setup UX
  }
}
