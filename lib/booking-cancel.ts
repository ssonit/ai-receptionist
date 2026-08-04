/**
 * The single place that cancels a real Cal.com booking and mirrors the
 * change into Supabase. `agent/tools/cancel_appointment.ts` (guest
 * self-service via chat) and the dashboard's cancel action both call this
 * instead of duplicating the sequence.
 *
 * Caller must already be inside `withCalApiKey(apiKey, () => ...)` —
 * this function does not touch the API key itself.
 */
import { cancelCalBooking } from "@/lib/calcom";
import { createAdminClient } from "@/lib/supabase/admin";

export type CancelWorkspaceBookingInput = {
  workspaceId: string;
  bookingId: string;
  calBookingUid: string;
  reason?: string;
  cancelledBy: "guest" | "owner";
};

export async function cancelWorkspaceBooking(
  input: CancelWorkspaceBookingInput,
): Promise<{ status: "cancelled" }> {
  const cancelled = await cancelCalBooking({
    bookingUid: input.calBookingUid,
    cancellationReason: input.reason,
  });

  // Cal.com already cancelled by the time we get here — nothing below this
  // point may throw out of the function. A mirror failure (returned error or
  // a thrown client/network error) must not be reported as a cancel failure;
  // it would leave the dashboard showing the slot as still booked until the
  // next cron sync, but the booking really is cancelled on Cal.com.
  try {
    const supabase = createAdminClient();
    const { error: mirrorError } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        list_status: "cancelled",
        cancelled_by: input.cancelledBy,
        raw: cancelled.raw,
        synced_at: new Date().toISOString(),
      })
      .eq("workspace_id", input.workspaceId)
      .eq("id", input.bookingId);
    if (mirrorError) throw new Error(mirrorError.message);
  } catch (mirrorError) {
    console.error(
      `[booking-cancel] mirror failed for ${input.calBookingUid}`,
      mirrorError,
    );
  }

  return { status: "cancelled" };
}
