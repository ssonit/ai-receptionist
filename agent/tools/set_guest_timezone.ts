import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  authAttr,
  resolveGuestBookingActor,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  isValidIanaTimeZone,
  normalizeIanaTimeZone,
  resolveTimeZoneFromText,
} from "@/lib/guest-timezone";
import { setChatSessionGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { APP_ERROR_CODE } from "@/lib/errors";
import { formatTimezoneLabel } from "@/lib/timezones";

export default defineTool({
  description:
    "Set the guest's IANA timezone for this chat (online workspaces). Pass timeZone (IANA) or location text like \"London\" / \"PST\". Never invent a timezone if unsure — ask again.",
  inputSchema: z.object({
    timeZone: z
      .string()
      .optional()
      .describe("IANA timezone e.g. Europe/London"),
    location: z
      .string()
      .optional()
      .describe("Spoken location e.g. London, New York, giờ Nhật"),
    sessionId: z.string().optional(),
  }),
  async execute({ timeZone, location, sessionId }, ctx) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;

    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) return toolError(gate.errorCode);
      if (gate.actor.rateLimited) {
        return toolError(APP_ERROR_CODE.AGENT_RATE_LIMITED);
      }

      const chatSessionId =
        gate.actor.chatSessionId ||
        authAttr(auth?.attributes, "chatSessionId");
      if (!chatSessionId) {
        return {
          ok: false as const,
          error: "No chat session to store timezone. Continue chatting and try again.",
          errorCode: APP_ERROR_CODE.INVALID_INPUT,
        };
      }

      let resolved: string | null = null;
      if (timeZone?.trim()) {
        resolved = normalizeIanaTimeZone(timeZone);
        if (!resolved && isValidIanaTimeZone(timeZone)) {
          resolved = timeZone.trim();
        }
      }
      if (!resolved && location?.trim()) {
        resolved = resolveTimeZoneFromText(location);
      }

      if (!resolved) {
        return {
          ok: false as const,
          error:
            "Could not map that to a timezone. Ask the guest for a city (e.g. London, Tokyo) or IANA name (Europe/London).",
          errorCode: APP_ERROR_CODE.INVALID_INPUT,
          suggestions: [
            "Europe/London",
            "America/New_York",
            "Asia/Tokyo",
            "Asia/Ho_Chi_Minh",
          ],
        };
      }

      const saved = await setChatSessionGuestTimeZone({
        chatSessionId,
        timeZone: resolved,
      });
      if (!saved) {
        return toolError(APP_ERROR_CODE.SAVE_FAILED);
      }

      await logAgentToolEvent({
        toolName: "set_guest_timezone",
        ok: true,
        sessionId: sid,
        chatSessionId,
        workspaceId: gate.actor.workspaceId,
        meta: { timeZone: resolved },
      });

      return {
        ok: true as const,
        timeZone: resolved,
        label: formatTimezoneLabel(resolved),
        message: `Guest timezone set to ${formatTimezoneLabel(resolved)}. Confirm this with the guest once.`,
      };
    } catch (error) {
      console.error("[set_guest_timezone]", error);
      return toolError(APP_ERROR_CODE.SAVE_FAILED);
    }
  },
});
