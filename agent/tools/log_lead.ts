import { defineTool } from "eve/tools";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

export default defineTool({
  description:
    "Save a qualified lead when the visitor shared contact details but has not booked yet, or when capturing intake answers.",
  inputSchema: z.object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    service: z.string().optional(),
    urgency: z.string().optional(),
    notes: z.string().optional(),
  }),
  async execute(input, ctx) {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("leads")
        .insert({
          workspace_id: getPilotWorkspaceId(),
          full_name: input.fullName ?? null,
          phone: input.phone ?? null,
          email: input.email || null,
          service: input.service ?? null,
          urgency: input.urgency ?? null,
          notes: input.notes ?? null,
          session_id: ctx.session?.id ?? null,
        })
        .select("id")
        .single();

      if (error) {
        return { ok: false as const, error: error.message };
      }
      return { ok: true as const, leadId: data.id };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to log lead",
      };
    }
  },
});
