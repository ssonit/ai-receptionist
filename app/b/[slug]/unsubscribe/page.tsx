import Link from "next/link";
import { notFound } from "next/navigation";
import { verifyReminderOptOutToken } from "@/lib/booking-reminders";
import { getPublicBookingWorkspace } from "@/lib/workspace";
import { UnsubscribeConfirmForm } from "./unsubscribe-confirm-form";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
};

/**
 * GET must stay read-only — email scanners / antivirus / Gmail's proxy
 * auto-follow every link in an email. The actual opt-out write only happens
 * from confirmReminderOptOutAction (a POST via the confirm button below).
 */
export default async function ReminderUnsubscribePage({
  params,
  searchParams,
}: PageProps) {
  const [{ slug }, { token }] = await Promise.all([params, searchParams]);
  const workspace = await getPublicBookingWorkspace(slug);
  if (!workspace) notFound();

  const trimmedToken = token?.trim() ?? "";
  const bookingId = trimmedToken
    ? verifyReminderOptOutToken(trimmedToken)
    : null;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-serif text-3xl tracking-tight">{workspace.name}</h1>
      {bookingId ? (
        <UnsubscribeConfirmForm slug={slug} token={trimmedToken} />
      ) : (
        <p className="text-muted-foreground max-w-md text-pretty">
          This unsubscribe link is invalid or expired.
        </p>
      )}
      <Link
        className="text-sm underline underline-offset-4"
        href={`/b/${workspace.slug}`}
      >
        Back to booking chat
      </Link>
    </div>
  );
}
