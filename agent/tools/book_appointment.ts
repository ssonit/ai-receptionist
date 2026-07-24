import { defineTool } from "eve/tools";
import { z } from "zod";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { createBooking, getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { upsertLeadAsBooked } from "@/lib/leads";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalApiKeyForWorkspace,
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
          "Chưa cấu hình meeting type cho AI booking. Vào Dashboard → Setup / Settings để chọn.";
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

      const apiKey = await getCalApiKeyForWorkspace(workspaceId);
      const day = start.slice(0, 10);
      const slots = await withCalApiKey(apiKey, () =>
        getAvailableSlots({
          startDate: day,
          endDate: day,
          timeZone: bookingConfig.timezone,
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
      } catch (dbError) {
        const warning =
          dbError instanceof Error
            ? `Saved on Cal.com but failed to mirror to Supabase: ${dbError.message}`
            : "Saved on Cal.com but failed to mirror to Supabase";
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
          title: `Booking Cal.com nhưng chưa mirror DB`,
          body: `${guestName} · ${booking.start} · ${warning}`,
          severity: "medium",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: booking.uid,
          workspaceId,
        });
        return { ok: true as const, booking, warning };
      }

      await logAgentToolEvent({
        toolName: "book_appointment",
        ok: true,
        sessionId: sid,
        workspaceId,
        meta: { uid: booking.uid },
      });

      await createNotification({
        type: "booking_created",
        title: `Booking mới: ${guestName}`,
        body: [service ?? aiEvent.title, booking.start, phone]
          .filter(Boolean)
          .join(" · "),
        severity: "high",
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
        },
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
