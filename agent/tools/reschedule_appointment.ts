import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  assertBookingChangeAllowed,
  findClaimableBookings,
  getWorkspaceGuestPolicy,
  resolveGuestBookingActor,
  resolveOwnedBooking,
  summarizeBookingCandidates,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  getAvailableSlots,
  rescheduleCalBooking,
  withCalApiKey,
} from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { calendarDayInTimeZone, formatSlotForGuest } from "@/lib/guest-timezone";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import { APP_ERROR_CODE } from "@/lib/errors";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalApiKeyForWorkspace, getWorkspaceById } from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";

export default defineTool({
  description:
    "Reschedule a claimable appointment to a newStart from check_availability. Prefer list_my_appointments first.",
  inputSchema: z.object({
    bookingUid: z.string().optional(),
    currentStart: z.string().optional(),
    newStart: z.string(),
    reason: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  async execute(
    { bookingUid, currentStart, newStart, reason, sessionId },
    ctx,
  ) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
    let workspaceIdForLog: string | null = null;

    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) return toolError(gate.errorCode);
      const actor = gate.actor;
      workspaceIdForLog = actor.workspaceId;
      if (actor.rateLimited) return toolError(APP_ERROR_CODE.AGENT_RATE_LIMITED);

      const { auto, needsPhoneLast4 } = await findClaimableBookings(actor);
      if (auto.length === 0 && needsPhoneLast4.length > 0) {
        return {
          ...toolError(APP_ERROR_CODE.BOOKING_VERIFY_REQUIRED),
          requiresProof: "phone_last4" as const,
          candidates: summarizeBookingCandidates(needsPhoneLast4),
        };
      }

      const resolved = await resolveOwnedBooking({
        actor,
        bookingUid,
        start: currentStart,
      });
      if (!resolved.ok) {
        return {
          ...toolError(resolved.errorCode),
          requiresProof:
            resolved.errorCode === APP_ERROR_CODE.BOOKING_NOT_CLAIMABLE
              ? ("code" as const)
              : undefined,
          candidates: resolved.candidates
            ? summarizeBookingCandidates(resolved.candidates)
            : undefined,
        };
      }

      const booking = resolved.booking;
      const policy = await getWorkspaceGuestPolicy(actor.workspaceId);
      const allowed = assertBookingChangeAllowed(
        policy,
        booking,
        "reschedule",
      );
      if (!allowed.ok) return toolError(allowed.errorCode);

      const aiEvent = await getAiBookingEventType(actor.workspaceId);
      if (!aiEvent) {
        return toolError(APP_ERROR_CODE.AI_MEETING_TYPE_REQUIRED);
      }

      const eventRef = {
        eventTypeId: aiEvent.calEventTypeId || undefined,
        eventTypeSlug: aiEvent.slug,
        username: aiEvent.username,
      };

      let apiKey: string;
      try {
        apiKey = await getCalApiKeyForWorkspace(actor.workspaceId);
      } catch {
        return toolError(APP_ERROR_CODE.CAL_NOT_CONFIGURED_GUEST);
      }
      const ws = await getWorkspaceById(actor.workspaceId);
      const timeZone = ws?.timezone ?? bookingConfig.timezone;
      const guestTimeZone =
        ws?.service_mode === "online"
          ? (
              await resolveGuestTimeZone({
                auth,
                chatSessionId: actor.chatSessionId,
              })
            ).guestTimeZone
          : null;
      const day = calendarDayInTimeZone(newStart, timeZone);
      const slots = await withCalApiKey(apiKey, () =>
        getAvailableSlots({
          startDate: day,
          endDate: day,
          timeZone,
          ...eventRef,
        }),
      );
      const targetMs = Date.parse(newStart);
      const stillOpen = slots.some((slot) => {
        if (slot.start === newStart) return true;
        const slotMs = Date.parse(slot.start);
        return (
          !Number.isNaN(targetMs) &&
          !Number.isNaN(slotMs) &&
          slotMs === targetMs
        );
      });
      if (!stillOpen) {
        return {
          ok: false as const,
          error: "New slot is no longer available. Call check_availability again.",
          errorCode: APP_ERROR_CODE.INVALID_INPUT,
        };
      }

      const moved = await withCalApiKey(apiKey, () =>
        rescheduleCalBooking({
          bookingUid: booking.cal_booking_uid,
          start: newStart,
          reschedulingReason: reason,
        }),
      );

      const supabase = createAdminClient();
      const status = normalizeCalApiStatus(moved.status);
      const nowIso = new Date().toISOString();

      // Cal.com already moved the booking. The mirror below is best-effort:
      // report failures instead of letting the dashboard drift silently until
      // the next cron sync.
      const mirrorErrors: string[] = [];

      if (moved.uid !== booking.cal_booking_uid) {
        const { error: retireError } = await supabase
          .from("bookings")
          .update({
            status: "cancelled",
            list_status: "cancelled",
            cancelled_by: "guest",
            synced_at: nowIso,
          })
          .eq("id", booking.id);
        if (retireError) mirrorErrors.push(`retire_old: ${retireError.message}`);

        const { error: insertError } = await supabase.from("bookings").upsert(
          {
            workspace_id: actor.workspaceId,
            cal_booking_uid: moved.uid,
            guest_name: booking.guest_name,
            guest_phone: booking.guest_phone,
            guest_email: booking.guest_email,
            service: booking.service,
            start_time: moved.start || newStart,
            status,
            list_status: "upcoming",
            notes: reason ?? null,
            session_id: booking.session_id ?? sid,
            visitor_id: booking.visitor_id,
            chat_session_id: booking.chat_session_id,
            manage_code_hash: booking.manage_code_hash,
            guest_timezone: booking.guest_timezone,
            cancelled_by: null,
            raw: moved.raw,
            synced_at: nowIso,
          },
          { onConflict: "workspace_id,cal_booking_uid" },
        );
        if (insertError) mirrorErrors.push(`insert_new: ${insertError.message}`);
      } else {
        const { error: moveError } = await supabase
          .from("bookings")
          .update({
            start_time: moved.start || newStart,
            status,
            list_status: "upcoming",
            raw: moved.raw,
            synced_at: nowIso,
          })
          .eq("id", booking.id);
        if (moveError) mirrorErrors.push(`move: ${moveError.message}`);
      }

      if (mirrorErrors.length > 0) {
        console.error(
          `[reschedule_appointment] mirror failed for ${booking.cal_booking_uid} -> ${moved.uid}`,
          mirrorErrors,
        );
        await createNotification({
          type: "booking_mirror_failed",
          title: "Reschedule saved on Cal.com but not mirrored",
          body: `${booking.guest_name} · ${moved.start || newStart} · ${mirrorErrors.join("; ")}`,
          severity: "medium",
          href: "/dashboard/bookings",
          entityType: "booking",
          entityId: moved.uid,
          workspaceId: actor.workspaceId,
        });
      }

      await logAgentToolEvent({
        toolName: "reschedule_appointment",
        ok: true,
        sessionId: sid,
        workspaceId: actor.workspaceId,
        meta: {
          fromUid: booking.cal_booking_uid,
          toUid: moved.uid,
        },
      });

      await createNotification({
        type: "booking_rescheduled_by_guest",
        title: `Guest rescheduled: ${booking.guest_name}`,
        body: [
          booking.service,
          `${booking.start_time} → ${moved.start || newStart}`,
        ]
          .filter(Boolean)
          .join(" · "),
        severity: "medium",
        href: "/dashboard/bookings",
        entityType: "booking",
        entityId: moved.uid,
        workspaceId: actor.workspaceId,
      });

      const newStartIso = moved.start || newStart;
      const display = formatSlotForGuest(
        newStartIso,
        guestTimeZone,
        timeZone,
      );
      const previousDisplay = formatSlotForGuest(
        booking.start_time,
        guestTimeZone,
        timeZone,
      );

      return {
        ok: true as const,
        booking: {
          uid: moved.uid,
          previousUid: booking.cal_booking_uid,
          previousStart: booking.start_time,
          previousDisplay: previousDisplay.combined,
          start: newStartIso,
          status,
          meetingUrl: moved.meetingUrl,
          display: display.combined,
          guestTimeZone,
          businessTimeZone: timeZone,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "reschedule failed";
      if (workspaceIdForLog) {
        await logAgentToolEvent({
          toolName: "reschedule_appointment",
          ok: false,
          error: message,
          sessionId: sid,
          workspaceId: workspaceIdForLog,
        });
      }
      return toolError(APP_ERROR_CODE.SAVE_FAILED);
    }
  },
});
