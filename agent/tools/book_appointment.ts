import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  getWorkspaceGuestPolicy,
  resolveGuestBookingActor,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { createWorkspaceBooking } from "@/lib/booking-create";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { calendarDayInTimeZone } from "@/lib/guest-timezone";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";

export default defineTool({
  description:
    "Create a real appointment booking in the calendar after the guest confirmed a specific available slot. Requires name, phone, and an ISO start time that came from check_availability. Email is usually optional unless the workspace returns BOOKING_EMAIL_REQUIRED.",
  inputSchema: z.object({
    guestName: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email().optional().or(z.literal("")),
    start: z.string().describe("ISO 8601 start time from check_availability"),
    service: z
      .string()
      .optional()
      .describe("Requested service or reason for visit"),
    notes: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  async execute(
    { guestName, phone, email, start, service, notes, sessionId },
    ctx,
  ) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    let workspaceIdForLog: string | null = null;
    // Set once resolveGuestBookingActor runs, below — earlier failure
    // branches (policy/meeting-type/API-key checks) log with this still
    // null, which correctly reflects that no chat session was resolved yet.
    let chatSessionIdForLog: string | null = null;
    try {
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId: sid,
        auth: ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null,
      });
      workspaceIdForLog = workspaceId;
      const policy = await getWorkspaceGuestPolicy(workspaceId);
      if (policy.guestEmailRequired && !email?.trim()) {
        const error = appErrorMessage(APP_ERROR_CODE.BOOKING_EMAIL_REQUIRED);
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId,
        });
        return { ok: false as const, error };
      }
      const aiEvent = await getAiBookingEventType(workspaceId);
      if (!aiEvent) {
        const error =
          "AI booking meeting type is not configured. Go to Dashboard → Setup / Settings to select one.";
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const eventRef = {
        eventTypeId: aiEvent.calEventTypeId || undefined,
        eventTypeSlug: aiEvent.slug,
        username: aiEvent.username,
      };

      let apiKey: string;
      try {
        apiKey = await getCalApiKeyForWorkspace(workspaceId);
      } catch {
        const error = appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED_GUEST);
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId,
        });
        return { ok: false as const, error };
      }
      const ws = await getWorkspaceById(workspaceId);
      const timeZone = ws?.timezone ?? bookingConfig.timezone;
      const auth =
        ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
      const locale =
        typeof auth?.attributes?.locale === "string"
          ? (auth.attributes.locale as string)
          : undefined;
      const day = calendarDayInTimeZone(start, timeZone);
      const slots = await withCalApiKey(apiKey, () =>
        getAvailableSlots({
          startDate: day,
          endDate: day,
          timeZone,
          ...eventRef,
        }),
      );
      const targetMs = Date.parse(start);
      const stillOpen = slots.some((slot) => {
        if (slot.start === start) return true;
        const slotMs = Date.parse(slot.start);
        return (
          !Number.isNaN(targetMs) &&
          !Number.isNaN(slotMs) &&
          slotMs === targetMs
        );
      });
      if (!stillOpen) {
        const error =
          "Slot is no longer available. Call check_availability again.";
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const guestActor = await resolveGuestBookingActor({
        sessionId: sid,
        auth,
      });
      const visitorId = guestActor.ok ? guestActor.actor.visitorId : null;
      const chatSessionId = guestActor.ok
        ? guestActor.actor.chatSessionId
        : null;
      chatSessionIdForLog = chatSessionId;
      const guestTzResolved = await resolveGuestTimeZone({
        auth,
        chatSessionId,
      });
      const guestTimeZone =
        ws?.service_mode === "online" ? guestTzResolved.guestTimeZone : null;

      const result = await withCalApiKey(apiKey, () =>
        createWorkspaceBooking({
          workspaceId,
          eventRef,
          eventTitle: aiEvent.title,
          start,
          guestName,
          phone,
          email,
          timeZone,
          locale,
          notes,
          service,
          sessionId: sid,
          visitorId,
          chatSessionId,
          guestTimeZone,
          source: "chat",
        }),
      );

      if (!result.ok) {
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error: result.error,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId,
        });
        return result;
      }

      await logAgentToolEvent({
        toolName: "book_appointment",
        ok: true,
        sessionId: sid,
        chatSessionId: chatSessionIdForLog,
        workspaceId,
        meta: {
          uid: result.booking.uid,
          ...(result.warning ? { mirrorFailed: true } : {}),
        },
      });

      return {
        ok: true as const,
        booking: {
          uid: result.booking.uid,
          start: result.booking.start,
          status: result.booking.status,
          meetingUrl: result.booking.meetingUrl,
          eventTypeId: aiEvent.calEventTypeId || null,
          eventTypeSlug: aiEvent.slug,
          display: result.booking.display,
          guestTimeZone,
          businessTimeZone: timeZone,
        },
        ...(result.warning ? { warning: result.warning } : {}),
        /** Tell the guest once — will be redacted when persisted. */
        manageCode: result.manageCode,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create booking";
      if (workspaceIdForLog) {
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error: message,
          sessionId: sid,
          chatSessionId: chatSessionIdForLog,
          workspaceId: workspaceIdForLog,
        });
      }
      return { ok: false as const, error: message };
    }
  },
});
