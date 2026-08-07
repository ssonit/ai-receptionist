import { defineTool } from "eve/tools";
import { z } from "zod";
import { authAttr } from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { normalizeLeadUrgency } from "@/lib/lead-status";
import { findWorkspaceLead } from "@/lib/leads";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceIdFromAgentContext } from "@/lib/workspace";

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
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
    let workspaceIdForLog: string | null = null;
    // Resolved (not just read from the header) the same way
    // resolveGuestBookingActor validates it — a raw client-supplied header
    // could name a chat_sessions row that doesn't exist, and leads.chat_session_id
    // has a real FK constraint, so an unvalidated value would fail the whole
    // insert/update rather than just being missing.
    let chatSessionId: string | null = null;
    try {
      const supabase = createAdminClient();
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId,
        auth,
      });
      workspaceIdForLog = workspaceId;

      const headerChatSessionId = authAttr(auth?.attributes, "chatSessionId");
      if (headerChatSessionId) {
        const { data: sessionRow } = await supabase
          .from("chat_sessions")
          .select("id")
          .eq("id", headerChatSessionId)
          .maybeSingle();
        chatSessionId = sessionRow?.id ?? null;
      }

      const phone = input.phone?.trim() || null;
      const email = input.email?.trim() || null;
      const urgency = normalizeLeadUrgency(input.urgency);

      const patch = {
        full_name: input.fullName?.trim() || null,
        phone,
        email,
        service: input.service?.trim() || null,
        urgency,
        notes: input.notes?.trim() || null,
        session_id: sessionId,
        chat_session_id: chatSessionId,
      };

      const existing = await findWorkspaceLead({
        workspaceId,
        sessionId,
        chatSessionId,
        phone,
      });

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
            chatSessionId,
            workspaceId,
          });
          return { ok: false as const, error: error.message };
        }

        await logAgentToolEvent({
          toolName: "log_lead",
          ok: true,
          sessionId,
          chatSessionId,
          workspaceId,
          meta: { leadId: existing.id, updated: true },
        });

        return {
          ok: true as const,
          leadId: existing.id,
          updated: true as const,
          status: existing.status,
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
          chatSessionId,
          workspaceId,
        });
        return { ok: false as const, error: error.message };
      }

      await logAgentToolEvent({
        toolName: "log_lead",
        ok: true,
        sessionId,
        chatSessionId,
        workspaceId,
        meta: { leadId: data.id, updated: false },
      });

      const leadLabel = patch.full_name || phone || email || "Guest";
      await createNotification({
        type: "lead_new",
        title: `New lead: ${leadLabel}`,
        body: [patch.service, patch.phone || patch.email]
          .filter(Boolean)
          .join(" · "),
        severity: "high",
        href: "/dashboard/leads",
        entityType: "lead",
        entityId: data.id,
        workspaceId,
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
      if (workspaceIdForLog) {
        await logAgentToolEvent({
          toolName: "log_lead",
          ok: false,
          error: message,
          sessionId,
          chatSessionId,
          workspaceId: workspaceIdForLog,
        });
      }
      return { ok: false as const, error: message };
    }
  },
});
