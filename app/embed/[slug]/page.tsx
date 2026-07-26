import { notFound } from "next/navigation";
import { getPublicBookingWorkspace } from "@/lib/workspace";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import { EmbedChat } from "./embed-chat";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Chrome-less chat for third-party embedding via public/embed.js.
 * Gated on bookingLive — see setup-wizard-reorder.md.
 */
export default async function EmbedPage({ params }: PageProps) {
  const { slug } = await params;
  const workspace = await getPublicBookingWorkspace(slug);

  if (!workspace) notFound();

  if (!workspace.bookingLive) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center">
        <p className="text-sm text-zinc-400">
          Booking isn&apos;t available right now.
        </p>
      </div>
    );
  }

  const locale = await readGuestLocale();
  return <EmbedChat initialLocale={locale} workspace={workspace} />;
}

