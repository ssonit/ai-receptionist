import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  findClaimableBookings,
  resolveGuestBookingActor,
  summarizeBookingCandidates,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { APP_ERROR_CODE } from "@/lib/errors";

export default defineTool({
  description:
    "List upcoming appointments this guest can already claim in this chat (same session, verified codes, or logged-in profile email). Does NOT accept email/phone — never invent appointments.",
  inputSchema: z.object({
    sessionId: z.string().optional(),
  }),
  async execute({ sessionId }, ctx) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) {
        return toolError(gate.errorCode);
      }
      if (gate.actor.rateLimited) {
        return toolError(APP_ERROR_CODE.AGENT_RATE_LIMITED);
      }

      const { auto, needsPhoneLast4 } = await findClaimableBookings(gate.actor);
      await logAgentToolEvent({
        toolName: "list_my_appointments",
        ok: true,
        sessionId: sid,
        workspaceId: gate.actor.workspaceId,
        meta: {
          auto: auto.length,
          needsPhoneLast4: needsPhoneLast4.length,
        },
      });

      return {
        ok: true as const,
        appointments: summarizeBookingCandidates(auto),
        needsPhoneLast4: summarizeBookingCandidates(needsPhoneLast4),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "list_my_appointments failed";
      console.error("[list_my_appointments]", message);
      return toolError(APP_ERROR_CODE.LOAD_FAILED);
    }
  },
});
