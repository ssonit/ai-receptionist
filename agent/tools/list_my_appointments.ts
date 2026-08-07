import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  findClaimableBookings,
  resolveGuestBookingActor,
  summarizeBookingCandidates,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { bookingConfig } from "@/lib/booking-config";
import { APP_ERROR_CODE } from "@/lib/errors";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { getWorkspaceById } from "@/lib/workspace";

export default defineTool({
  description:
    "List upcoming appointments this guest can already claim in this chat (same session, verified codes, or logged-in profile email). Does NOT accept email/phone — never invent appointments. Times use bookings.guest_timezone when set (online workspaces only).",
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

      const ws = await getWorkspaceById(gate.actor.workspaceId);
      const businessTz = ws?.timezone ?? bookingConfig.timezone;
      const online = ws?.service_mode === "online";
      const fallback = online
        ? await resolveGuestTimeZone({
            auth,
            chatSessionId: gate.actor.chatSessionId,
          })
        : { guestTimeZone: null as string | null };

      const { auto, needsPhoneLast4 } = await findClaimableBookings(gate.actor);
      await logAgentToolEvent({
        toolName: "list_my_appointments",
        ok: true,
        sessionId: sid,
        chatSessionId: gate.actor.chatSessionId,
        workspaceId: gate.actor.workspaceId,
        meta: {
          auto: auto.length,
          needsPhoneLast4: needsPhoneLast4.length,
        },
      });

      const fmt = {
        businessTimeZone: businessTz,
        fallbackGuestTimeZone: online ? fallback.guestTimeZone : null,
        ignoreStoredGuestTz: !online,
      };

      return {
        ok: true as const,
        businessTimeZone: businessTz,
        appointments: summarizeBookingCandidates(auto, fmt),
        needsPhoneLast4: summarizeBookingCandidates(needsPhoneLast4, fmt),
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "list_my_appointments failed";
      console.error("[list_my_appointments]", message);
      return toolError(APP_ERROR_CODE.LOAD_FAILED);
    }
  },
});
