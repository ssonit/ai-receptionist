"use client";

import Link from "next/link";
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
          aria-label="Thông tin workspace"
          className="size-8 text-zinc-300"
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconInfoCircle className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="border-white/10 bg-zinc-950 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">{workspace.name}</SheetTitle>
          <SheetDescription className="text-zinc-400">
            {workspace.tagline?.trim() || "Thông tin đặt lịch"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5 overflow-y-auto px-1 pb-6 text-sm">
          {workspace.about?.trim() ? (
            <p className="leading-relaxed text-zinc-300 text-pretty">
              {workspace.about.trim()}
            </p>
          ) : null}

          {hoursLines.length > 0 ? (
            <div>
              <p className="mb-1.5 font-medium text-zinc-200">Giờ mở cửa</p>
              <ul className="space-y-0.5 text-zinc-400">
                {hoursLines.map((line) => (
                  <li key={line}>{line.replace(/^-+\s*/, "")}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {workspace.phone?.trim() ? (
            <p className="text-zinc-400">
              <span className="font-medium text-zinc-200">ĐT: </span>
              <a
                className="underline-offset-2 hover:underline"
                href={`tel:${workspace.phone}`}
              >
                {workspace.phone}
              </a>
            </p>
          ) : null}

          {workspace.address?.trim() ? (
            <p className="text-pretty text-zinc-400">
              <span className="font-medium text-zinc-200">Địa chỉ: </span>
              {workspace.address}
            </p>
          ) : null}

          {workspace.faqItems.length > 0 ? (
            <div className="space-y-3">
              <p className="font-medium text-zinc-200">FAQ</p>
              <ul className="space-y-3">
                {workspace.faqItems.slice(0, 5).map((item) => (
                  <li key={item.question} className="border-l-2 border-white/15 pl-3">
                    <p className="font-medium text-zinc-100">{item.question}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-500">
                      {item.answer.replace(/^-\s*/gm, "").trim()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="pt-2 text-xs text-zinc-600">
            Trợ lý đặt lịch ·{" "}
            <Link className="underline-offset-2 hover:underline" href="/">
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
}: {
  workspace: PublicBookingWorkspace;
  user?: ChatUser | null;
  /** Marketing `/chat` sandbox — shows demo banner only. */
  demoMode?: boolean;
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
      user={user}
      workspaceName={workspace.name}
      workspaceSlug={workspace.slug}
      workspaceTagline={workspace.tagline}
    />
  );
}
