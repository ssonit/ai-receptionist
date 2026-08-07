import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveGuestBookingActor, toolError } from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { APP_ERROR_CODE } from "@/lib/errors";
import { createNotification } from "@/lib/notifications-write";

export default defineTool({
  description:
    "Escalate a cancel/reschedule request to workspace staff when the guest cannot prove ownership (tier D). Does NOT cancel anything.",
  inputSchema: z.object({
    guestName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    requestedAction: z.enum(["cancel", "reschedule", "other"]),
    details: z.string(),
    sessionId: z.string().optional(),
  }),
  async execute(
    { guestName, phone, email, requestedAction, details, sessionId },
    ctx,
  ) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;

    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) return toolError(gate.errorCode);

      const body = [requestedAction, guestName, phone, email, details]
        .filter(Boolean)
        .join(" · ");

      await createNotification({
        type: "booking_change_requested",
        title: `Guest asks to ${requestedAction} a booking`,
        body,
        severity: "high",
        href: "/dashboard/bookings",
        entityType: "chat_session",
        entityId: gate.actor.chatSessionId ?? sid ?? undefined,
        workspaceId: gate.actor.workspaceId,
      });

      await logAgentToolEvent({
        toolName: "request_booking_change",
        ok: true,
        sessionId: sid,
        chatSessionId: gate.actor.chatSessionId,
        workspaceId: gate.actor.workspaceId,
        meta: { requestedAction },
      });

      return {
        ok: true as const,
        message:
          "Request sent to staff. Do not tell the guest the booking was already cancelled or moved.",
      };
    } catch (error) {
      console.error("[request_booking_change]", error);
      return toolError(APP_ERROR_CODE.SAVE_FAILED);
    }
  },
});
