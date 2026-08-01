"use server";

/**
 * Reminder opt-out must be a real user action (POST), never a bare GET —
 * email scanners / antivirus / Gmail image-proxy bots auto-follow every link
 * in an email, which would silently opt guests out if GET alone did the write.
 */
import { verifyReminderOptOutToken } from "@/lib/booking-reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";

export type UnsubscribeActionState = {
  ok: boolean;
  message: string;
};

export async function confirmReminderOptOutAction(
  _prev: UnsubscribeActionState,
  formData: FormData,
): Promise<UnsubscribeActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  const bookingId = token ? verifyReminderOptOutToken(token) : null;
  if (!bookingId || !slug) {
    return {
      ok: false,
      message: "This unsubscribe link is invalid or expired.",
    };
  }

  const supabase = createAdminClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!workspace) {
    return {
      ok: false,
      message: "This unsubscribe link is invalid or expired.",
    };
  }

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, workspace_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking || booking.workspace_id !== workspace.id) {
    return {
      ok: false,
      message: "This unsubscribe link is invalid or expired.",
    };
  }

  await supabase
    .from("bookings")
    .update({ reminders_opt_out: true })
    .eq("id", bookingId)
    .eq("workspace_id", workspace.id);

  await supabase
    .from("booking_reminders")
    .update({ status: "skipped", error: "opt_out" })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  await trackServer(ANALYTICS_EVENT.REMINDER_OPTED_OUT, workspace.id, {
    bookingId,
  });

  return {
    ok: true,
    message: `You will not receive more reminders for this appointment with ${workspace.name}.`,
  };
}
