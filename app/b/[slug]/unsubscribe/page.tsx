import Link from "next/link";
import { notFound } from "next/navigation";
import {
  verifyReminderOptOutToken,
} from "@/lib/booking-reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicBookingWorkspace } from "@/lib/workspace";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function ReminderUnsubscribePage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { token } = await searchParams;
  const workspace = await getPublicBookingWorkspace(slug);
  if (!workspace) notFound();

  let message = "This unsubscribe link is invalid or expired.";
  let ok = false;

  const bookingId = token ? verifyReminderOptOutToken(token) : null;
  if (bookingId) {
    const supabase = createAdminClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, workspace_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (booking?.workspace_id === workspace.id) {
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

      ok = true;
      message = `You will not receive more reminders for this appointment with ${workspace.name}.`;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl tracking-tight">{workspace.name}</h1>
      <p className="text-muted-foreground max-w-md text-pretty">{message}</p>
      {ok ? (
        <p className="text-muted-foreground max-w-md text-sm text-pretty">
          This only stops reminders for this one appointment. It does not cancel
          the booking.
        </p>
      ) : null}
      <Link
        className="text-sm underline underline-offset-4"
        href={`/b/${workspace.slug}`}
      >
        Back to booking chat
      </Link>
    </div>
  );
}
