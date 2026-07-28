import { defineTool } from "eve/tools";
import { z } from "zod";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  normalizeLeadUrgency,
  type LeadStatus,
} from "@/lib/lead-status";
import { findWorkspaceLead } from "@/lib/leads";
import {
  createNotification,
  createNotificationDebounced,
} from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWorkspaceIdFromAgentContext } from "@/lib/workspace";

function nextStatusOnLog(current: string | undefined): LeadStatus {
  if (current === "booked" || current === "lost" || current === "qualified") {
    return current as LeadStatus;
  }
  if (current === "contacted") return "contacted";
  return "new";
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLongTreatmentIntent(
  service: string | null | undefined,
  notes: string | null | undefined,
): boolean {
  const haystack = `${normalizeText(service)} ${normalizeText(notes)}`.trim();
  if (!haystack) return false;
  return (
    haystack.includes("dieu tri dai") ||
    haystack.includes("kham dieu tri dai") ||
    haystack.includes("dieu tri lau") ||
    haystack.includes("long treatment") ||
    haystack.includes("extended treatment") ||
    haystack.includes("long consultation")
  );
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
    let workspaceIdForLog: string | null = null;
    try {
      const supabase = createAdminClient();
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId,
        auth: ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null,
      });
      workspaceIdForLog = workspaceId;
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
      const longTreatment = isLongTreatmentIntent(patch.service, patch.notes);

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
        if (urgency === "high" || urgency === "urgent") {
          await createNotification({
            type: "lead_urgent",
            title: `Urgent lead: ${patch.full_name || phone || "Guest"}`,
            body: [patch.service, urgency, patch.notes]
              .filter(Boolean)
              .join(" · "),
            severity: "high",
            href: "/dashboard/leads",
            entityType: "lead",
            entityId: existing.id,
            workspaceId,
          });
        }
        if (longTreatment) {
          const leadLabel = patch.full_name || phone || email || "Guest";
          const longTreatmentEntityId = `long-treatment:${existing.id}`;
          await createNotificationDebounced({
            type: "long_treatment_requested",
            title: `Long treatment request: ${leadLabel}`,
            body: [patch.service, patch.phone || patch.email, patch.notes]
              .filter(Boolean)
              .join(" · "),
            severity: "high",
            href: "/dashboard/leads",
            entityType: "lead",
            entityId: longTreatmentEntityId,
            workspaceId,
            windowMinutes: 180,
          });
        }
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
      if (urgency === "high" || urgency === "urgent") {
        await createNotification({
          type: "lead_urgent",
          title: `Urgent lead: ${leadLabel}`,
          body: `Urgency: ${urgency}`,
          severity: "high",
          href: "/dashboard/leads",
          entityType: "lead",
          entityId: data.id,
          workspaceId,
        });
      }
      if (longTreatment) {
        const longTreatmentEntityId = `long-treatment:${data.id}`;
        await createNotificationDebounced({
          type: "long_treatment_requested",
          title: `Long treatment request: ${leadLabel}`,
          body: [patch.service, patch.phone || patch.email, patch.notes]
            .filter(Boolean)
            .join(" · "),
          severity: "high",
          href: "/dashboard/leads",
          entityType: "lead",
          entityId: longTreatmentEntityId,
          workspaceId,
          windowMinutes: 180,
        });
      }

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
          workspaceId: workspaceIdForLog,
        });
      }
      return { ok: false as const, error: message };
    }
  },
});
