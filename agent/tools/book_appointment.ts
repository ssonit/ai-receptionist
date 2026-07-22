import { defineTool } from "eve/tools";
import { z } from "zod";
import { createBooking, getAvailableSlots } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPilotWorkspaceId } from "@/lib/workspace";

export default defineTool({
  description:
    "Create a real appointment booking in the calendar after the guest confirmed a specific available slot. Requires name, email, phone, and an ISO start time that came from check_availability.",
  inputSchema: z.object({
    guestName: z.string().min(1),
    phone: z.string().min(6),
    email: z.string().email(),
    start: z.string().describe("ISO 8601 start time from check_availability"),
    service: z.string().optional().describe("Requested service or reason for visit"),
    notes: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  async execute({ guestName, phone, email, start, service, notes, sessionId }, ctx) {
    try {
      const day = start.slice(0, 10);
      const slots = await getAvailableSlots({
        startDate: day,
        endDate: day,
        timeZone: bookingConfig.timezone,
      });
      const targetMs = Date.parse(start);
      const stillOpen = slots.some((slot) => {
        if (slot.start === start) return true;
        const slotMs = Date.parse(slot.start);
        return !Number.isNaN(targetMs) && !Number.isNaN(slotMs) && slotMs === targetMs;
      });
      if (!stillOpen) {
        return {
          ok: false as const,
          error: "Slot is no longer available. Call check_availability again.",
        };
      }

      const booking = await createBooking({
        start,
        attendeeName: guestName,
        attendeeEmail: email,
        attendeePhone: phone,
        notes: [service, notes].filter(Boolean).join(" | ") || undefined,
      });

      try {
        const supabase = createAdminClient();
        await supabase.from("bookings").upsert(
          {
            workspace_id: getPilotWorkspaceId(),
            cal_booking_uid: booking.uid,
            guest_name: guestName,
            guest_phone: phone,
            guest_email: email,
            service: service ?? null,
            start_time: booking.start,
            status: normalizeCalApiStatus(booking.status),
            list_status: "upcoming",
            notes: notes ?? null,
            session_id: sessionId ?? ctx.session?.id ?? null,
            raw: booking.raw,
          },
          { onConflict: "cal_booking_uid" },
        );

        await supabase.from("leads").insert({
          workspace_id: getPilotWorkspaceId(),
          full_name: guestName,
          phone,
          email,
          service: service ?? null,
          notes: notes ?? null,
          session_id: sessionId ?? ctx.session?.id ?? null,
        });
      } catch (dbError) {
        // Booking on Cal.com succeeded; mirror failure should not undo confirmation.
        return {
          ok: true as const,
          booking,
          warning:
            dbError instanceof Error
              ? `Saved on Cal.com but failed to mirror to Supabase: ${dbError.message}`
              : "Saved on Cal.com but failed to mirror to Supabase",
        };
      }

      return {
        ok: true as const,
        booking: {
          uid: booking.uid,
          start: booking.start,
          status: booking.status,
          meetingUrl: booking.meetingUrl,
        },
      };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Failed to create booking",
      };
    }
  },
});
