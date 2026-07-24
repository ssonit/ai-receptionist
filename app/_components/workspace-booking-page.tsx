"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconInfoCircle } from "@tabler/icons-react";
import { AgentChat } from "@/app/_components/agent-chat";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { PublicBookingWorkspace } from "@/lib/workspace";
import { resolveChatBranding } from "@/lib/chat-branding";

type ChatUser = {
  name: string;
  email: string;
  avatar: string;
};

function WorkspaceInfoSheet({ workspace }: { workspace: PublicBookingWorkspace }) {
  const t = useTranslations();
  const hoursLines = (workspace.businessHours ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);

  const hasDetails = Boolean(
    workspace.about?.trim() ||
      hoursLines.length ||
      workspace.phone?.trim() ||
      workspace.address?.trim() ||
      workspace.faqItems.length,
  );

  if (!hasDetails) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label={t("chat.workspaceInfo")}
          className="size-8 text-zinc-300"
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconInfoCircle className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 border-white/10 bg-zinc-950 p-0 text-zinc-100 sm:max-w-md">
        <SheetHeader className="gap-2 border-b border-white/10 px-6 py-6 pr-14 text-left">
          <SheetTitle className="text-xl font-semibold tracking-tight text-white">
            {workspace.name}
          </SheetTitle>
          <SheetDescription className="text-sm leading-relaxed text-zinc-400">
            {workspace.tagline?.trim() || t("chat.bookingDetails")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-10 px-6 py-8">
            {workspace.about?.trim() ? (
              <p className="text-sm leading-relaxed text-pretty text-zinc-300">
                {workspace.about.trim()}
              </p>
            ) : null}

            {(hoursLines.length > 0 ||
              workspace.phone?.trim() ||
              workspace.address?.trim()) && (
              <section className="flex flex-col gap-6">
                {hoursLines.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      {t("chat.businessHours")}
                    </p>
                    <ul className="space-y-1.5 text-sm leading-relaxed text-zinc-300">
                      {hoursLines.map((line) => (
                        <li key={line}>{line.replace(/^-+\s*/, "")}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {workspace.phone?.trim() ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      {t("chat.phone")}
                    </p>
                    <a
                      className="text-sm text-zinc-200 underline-offset-4 hover:text-white hover:underline"
                      href={`tel:${workspace.phone}`}
                    >
                      {workspace.phone}
                    </a>
                  </div>
                ) : null}

                {workspace.address?.trim() ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      {t("chat.address")}
                    </p>
                    <p className="text-sm leading-relaxed text-pretty text-zinc-300">
                      {workspace.address}
                    </p>
                  </div>
                ) : null}
              </section>
            )}

            {workspace.faqItems.length > 0 ? (
              <section className="flex flex-col gap-5 border-t border-white/10 pt-8">
                <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
                  {t("chat.faq")}
                </p>
                <ul className="flex flex-col divide-y divide-white/10">
                  {workspace.faqItems.slice(0, 5).map((item) => (
                    <li key={item.question} className="flex flex-col gap-2.5 py-5 first:pt-0 last:pb-0">
                      <p className="text-sm font-medium leading-snug text-zinc-100">
                        {item.question}
                      </p>
                      <p className="text-sm leading-relaxed text-pretty text-zinc-400">
                        {item.answer.replace(/^-\s*/gm, "").trim()}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <p className="mt-auto border-t border-white/10 px-6 py-5 text-xs leading-relaxed text-zinc-600">
            {t("chat.disclaimer")} ·{" "}
            <Link
              className="text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
              href="/"
            >
              Eve
            </Link>
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function WorkspaceBookingPage({
  workspace,
  user,
  demoMode = false,
  initialLocale,
}: {
  workspace: PublicBookingWorkspace;
  user?: ChatUser | null;
  /** Marketing `/chat` sandbox — shows demo banner only. */
  demoMode?: boolean;
  initialLocale?: "en" | "vi";
}) {
  return (
    <AgentChat
      chatBranding={resolveChatBranding({
        assistantLabel: workspace.chatAssistantLabel,
        intro: workspace.chatIntro,
        suggestions: workspace.chatSuggestions,
      })}
      demoMode={demoMode}
      headerEnd={<WorkspaceInfoSheet workspace={workspace} />}
      initialLocale={initialLocale}
      user={user}
      workspaceName={workspace.name}
      workspaceSlug={workspace.slug}
      workspaceTagline={workspace.tagline}
    />
  );
}
