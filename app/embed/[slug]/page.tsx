import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { appOrigin } from "@/lib/app-origin";
import {
  hostFromUrl,
  isEmbedHostAllowed,
  normalizeEmbedHost,
} from "@/lib/embed";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import { resolvePublicEmbedWorkspace } from "@/lib/workspace";

import { EmbedChat } from "./embed-chat";

export const metadata = {
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * Chrome-less chat for third-party embedding via public/embed.js.
 * Key may be Site ID (`chat_<uuid>`) or legacy slug.
 * Gated on bookingLive + optional embed_allowed_origins.
 */
export default async function EmbedPage({ params }: PageProps) {
  const { slug: key } = await params;
  const workspace = await resolvePublicEmbedWorkspace(key);

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

  const h = await headers();
  const requestHost =
    hostFromUrl(h.get("referer")) || hostFromUrl(h.get("origin"));
  const appHost = normalizeEmbedHost(appOrigin());
  const allowed = workspace.embedAllowedOrigins;
  const sameApp = Boolean(appHost && requestHost && requestHost === appHost);
  if (
    allowed.length > 0 &&
    !sameApp &&
    !isEmbedHostAllowed(requestHost, allowed)
  ) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 bg-zinc-950 px-6 text-center">
        <p className="text-sm text-zinc-400">
          Embed isn&apos;t allowed on this site.
        </p>
      </div>
    );
  }

  const locale = await readGuestLocale();
  return <EmbedChat initialLocale={locale} workspace={workspace} />;
}
