import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  findClaimableBookings,
  resolveGuestBookingActor,
  resolveOwnedBooking,
  assertBookingChangeAllowed,
  getWorkspaceGuestPolicy,
  summarizeBookingCandidates,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { cancelCalBooking, withCalApiKey } from "@/lib/calcom";
import { APP_ERROR_CODE } from "@/lib/errors";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCalApiKeyForWorkspace } from "@/lib/workspace";

export default defineTool({
  description:
    "Cancel an upcoming appointment the guest has proven ownership of (same chat session, verified manage/OTP/phone, or profile email). Prefer list_my_appointments first.",
  inputSchema: z.object({
    bookingUid: z.string().optional(),
    start: z.string().optional(),
    reason: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  async execute({ bookingUid, start, reason, sessionId }, ctx) {
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
        start,
      });
      if (!resolved.ok) {
        const proof =
          resolved.errorCode === APP_ERROR_CODE.BOOKING_NOT_CLAIMABLE
            ? ("code" as const)
            : resolved.errorCode === APP_ERROR_CODE.BOOKING_VERIFY_REQUIRED
              ? ("phone_last4" as const)
              : undefined;
        return {
          ...toolError(resolved.errorCode),
          requiresProof: proof,
          candidates: resolved.candidates
            ? summarizeBookingCandidates(resolved.candidates)
            : undefined,
        };
      }

      const booking = resolved.booking;
      const policy = await getWorkspaceGuestPolicy(actor.workspaceId);
      const allowed = assertBookingChangeAllowed(policy, booking, "cancel");
      if (!allowed.ok) return toolError(allowed.errorCode);

      const apiKey = await getCalApiKeyForWorkspace(actor.workspaceId);
      const cancelled = await withCalApiKey(apiKey, () =>
        cancelCalBooking({
          bookingUid: booking.cal_booking_uid,
          cancellationReason: reason,
        }),
      );

      const supabase = createAdminClient();
      await supabase
        .from("bookings")
        .update({
          status: "cancelled",
          list_status: "cancelled",
          cancelled_by: "guest",
          raw: cancelled.raw,
          synced_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      await logAgentToolEvent({
        toolName: "cancel_appointment",
        ok: true,
        sessionId: sid,
        workspaceId: actor.workspaceId,
        meta: { uid: booking.cal_booking_uid },
      });

      await createNotification({
        type: "booking_cancelled_by_guest",
        title: `Guest cancelled: ${booking.guest_name}`,
        body: [booking.service, booking.start_time, reason]
          .filter(Boolean)
          .join(" · "),
        severity: "medium",
        href: "/dashboard/bookings",
        entityType: "booking",
        entityId: booking.cal_booking_uid,
        workspaceId: actor.workspaceId,
      });

      return {
        ok: true as const,
        booking: {
          uid: booking.cal_booking_uid,
          start: booking.start_time,
          status: "cancelled",
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "cancel failed";
      if (workspaceIdForLog) {
        await logAgentToolEvent({
          toolName: "cancel_appointment",
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
