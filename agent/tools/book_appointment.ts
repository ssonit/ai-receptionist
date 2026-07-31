import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveGuestBookingActor } from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  generateManageCode,
  hashBookingCode,
} from "@/lib/booking-manage-code";
import { createBooking, getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { upsertLeadAsBooked } from "@/lib/leads";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";

export default defineTool({
  description:
    "Create a real appointment booking in the calendar after the guest confirmed a specific available slot. Requires name, email, phone, and an ISO start time that came from check_availability.",
  inputSchema: z.object({
    guestName: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email(),
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
    try {
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId: sid,
        auth: ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null,
      });
      workspaceIdForLog = workspaceId;
      const aiEvent = await getAiBookingEventType(workspaceId);
      if (!aiEvent) {
        const error =
          "AI booking meeting type is not configured. Go to Dashboard → Setup / Settings to select one.";
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: false,
          error,
          sessionId: sid,
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
          workspaceId,
        });
        return { ok: false as const, error };
      }
      const ws = await getWorkspaceById(workspaceId);
      const timeZone = ws?.timezone ?? bookingConfig.timezone;
      const day = start.slice(0, 10);
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
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const booking = await withCalApiKey(apiKey, () =>
        createBooking({
          start,
          attendeeName: guestName,
          attendeeEmail: email,
          attendeePhone: phone,
          notes: [service, notes].filter(Boolean).join(" | ") || undefined,
          ...eventRef,
        }),
      );

      const auth =
        ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
      const guestActor = await resolveGuestBookingActor({
        sessionId: sid,
        auth,
      });
      const visitorId = guestActor.ok ? guestActor.actor.visitorId : null;
      const chatSessionId = guestActor.ok
        ? guestActor.actor.chatSessionId
        : null;
      const guestTzResolved = await resolveGuestTimeZone({
        auth,
        chatSessionId,
      });
      const guestTimeZone =
        ws?.service_mode === "online" ? guestTzResolved.guestTimeZone : null;
      const manageCode = generateManageCode();
      const manageCodeHash = hashBookingCode(manageCode);
      const startDisplay = formatSlotForGuest(
        booking.start,
        guestTimeZone,
        timeZone,
      );

      try {
        const supabase = createAdminClient();
        await supabase.from("bookings").upsert(
          {
            workspace_id: workspaceId,
            cal_booking_uid: booking.uid,
            guest_name: guestName,
            guest_phone: phone,
            guest_email: email,
            service: service ?? aiEvent.title ?? null,
            start_time: booking.start,
            status: normalizeCalApiStatus(booking.status),
            list_status: "upcoming",
            notes: notes ?? null,
            session_id: sid,
            visitor_id: visitorId,
            chat_session_id: chatSessionId,
            manage_code_hash: manageCodeHash,
            guest_timezone: guestTimeZone,
            raw: booking.raw,
          },
          { onConflict: "cal_booking_uid" },
        );

        await upsertLeadAsBooked({
          workspaceId,
          fullName: guestName,
          phone,
          email,
          service: service ?? aiEvent.title ?? null,
          notes: notes ?? null,
          sessionId: sid,
        });

        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: true,
          sessionId: sid,
          workspaceId,
          meta: { uid: booking.uid },
        });

        await createNotification({
          type: "booking_created",
          title: `New booking: ${guestName}`,
          body: [service ?? aiEvent.title, booking.start, phone]
            .filter(Boolean)
            .join(" · "),
          severity: "high",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: booking.uid,
          workspaceId,
        });
        await trackServer(ANALYTICS_EVENT.BOOKING_CREATED, workspaceId, {
          workspaceId,
          service: service ?? aiEvent.title ?? null,
          source: "chat",
        });
      } catch (dbError) {
        const warning =
          dbError instanceof Error
            ? `Saved on Cal.com but failed to mirror to Supabase: ${dbError.message}`
            : "Saved on Cal.com but failed to mirror to Supabase";
        try {
          const supabase = createAdminClient();
          await supabase.from("bookings").upsert(
            {
              workspace_id: workspaceId,
              cal_booking_uid: booking.uid,
              guest_name: guestName,
              guest_phone: phone,
              guest_email: email,
              service: service ?? aiEvent.title ?? null,
              start_time: booking.start,
              status: normalizeCalApiStatus(booking.status),
              list_status: "upcoming",
              notes: notes ?? null,
              session_id: sid,
              visitor_id: visitorId,
              chat_session_id: chatSessionId,
              manage_code_hash: manageCodeHash,
              guest_timezone: guestTimeZone,
              raw: booking.raw,
            },
            { onConflict: "cal_booking_uid" },
          );
        } catch {
          // ignore second failure — still return manageCode below
        }
        await logAgentToolEvent({
          toolName: "book_appointment",
          ok: true,
          error: warning,
          sessionId: sid,
          workspaceId,
          meta: { uid: booking.uid, mirrorFailed: true },
        });
        await createNotification({
          type: "booking_mirror_failed",
          title: `Cal.com booking saved but not mirrored to DB`,
          body: `${guestName} · ${booking.start} · ${warning}`,
          severity: "medium",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: booking.uid,
          workspaceId,
        });
        return {
          ok: true as const,
          booking: {
            uid: booking.uid,
            start: booking.start,
            status: booking.status,
            meetingUrl: booking.meetingUrl,
            eventTypeId: aiEvent.calEventTypeId || null,
            eventTypeSlug: aiEvent.slug,
            display: startDisplay.combined,
            guestTimeZone,
            businessTimeZone: timeZone,
          },
          warning,
          manageCode,
        };
      }

      return {
        ok: true as const,
        booking: {
          uid: booking.uid,
          start: booking.start,
          status: booking.status,
          meetingUrl: booking.meetingUrl,
          eventTypeId: aiEvent.calEventTypeId || null,
          eventTypeSlug: aiEvent.slug,
          display: startDisplay.combined,
          guestTimeZone,
          businessTimeZone: timeZone,
        },
        /** Tell the guest once — will be redacted when persisted. */
        manageCode,
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
          workspaceId: workspaceIdForLog,
        });
      }
      return { ok: false as const, error: message };
    }
  },
});
