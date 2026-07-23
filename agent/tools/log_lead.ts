import { defineTool } from "eve/tools";
import { z } from "zod";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  normalizeLeadUrgency,
  type LeadStatus,
} from "@/lib/lead-status";
import { findWorkspaceLead } from "@/lib/leads";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

function nextStatusOnLog(current: string | undefined): LeadStatus {
  if (current === "booked" || current === "lost" || current === "qualified") {
    return current as LeadStatus;
  }
  if (current === "contacted") return "contacted";
  return "new";
}

export default defineTool({
  description:
    "Save or update a qualified lead when the visitor shared contact details but has not booked yet, or when capturing intake answers. Prefer calling this once per conversation after name + phone/email are known.",
  inputSchema: z.object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    service: z.string().optional(),
    urgency: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(input, ctx) {
    const sessionId = ctx.session?.id ?? null;
    try {
      const supabase = createAdminClient();
      const workspaceId = getPilotWorkspaceId();
      const phone = input.phone?.trim() || null;
      const email = input.email?.trim() || null;
      const urgency = normalizeLeadUrgency(input.urgency);

      const existing = await findWorkspaceLead({
        workspaceId,
        sessionId,
        phone,
      });

      const patch = {
        full_name: input.fullName?.trim() || null,
        phone,
        email,
        service: input.service?.trim() || null,
        urgency,
        notes: input.notes?.trim() || null,
        session_id: sessionId,
        status: nextStatusOnLog(existing?.status),
      };

      if (existing) {
        const { error } = await supabase
          .from("leads")
          .update(patch)
          .eq("id", existing.id);
        if (error) {
          await logAgentToolEvent({
            toolName: "log_lead",
            ok: false,
            error: error.message,
            sessionId,
            workspaceId,
          });
          return { ok: false as const, error: error.message };
        }
        await logAgentToolEvent({
          toolName: "log_lead",
          ok: true,
          sessionId,
          workspaceId,
          meta: { leadId: existing.id, updated: true },
        });
        return {
          ok: true as const,
          leadId: existing.id,
          updated: true as const,
          status: patch.status,
        };
      }

      const { data, error } = await supabase
        .from("leads")
        .insert({
          workspace_id: workspaceId,
          ...patch,
          status: "new",
        })
        .select("id")
        .single();

      if (error) {
        await logAgentToolEvent({
          toolName: "log_lead",
          ok: false,
          error: error.message,
          sessionId,
          workspaceId,
        });
        return { ok: false as const, error: error.message };
      }

      await logAgentToolEvent({
        toolName: "log_lead",
        ok: true,
        sessionId,
        workspaceId,
        meta: { leadId: data.id, updated: false },
      });

      return {
        ok: true as const,
        leadId: data.id,
        updated: false as const,
        status: "new" as const,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to log lead";
      await logAgentToolEvent({
        toolName: "log_lead",
        ok: false,
        error: message,
        sessionId,
      });
      return { ok: false as const, error: message };
    }
  },
});
