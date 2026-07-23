"use client";

import * as React from "react";
import { IconMenu2, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ChatSessionListItem } from "@/lib/chat-sessions";

export function ChatSessionSidebar({
  sessions,
  activeId,
  busy,
  onSelect,
  onNew,
  className,
}: {
  sessions: ChatSessionListItem[];
  activeId: string | null;
  busy?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex h-full w-full flex-col border-white/10 bg-zinc-950/90",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3">
        <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">
          Hội thoại
        </p>
        <Button
          className="h-8 gap-1 rounded-full border-white/10 bg-white/[0.04] text-xs text-zinc-200 hover:bg-white/[0.08] hover:text-white"
          disabled={busy}
          onClick={onNew}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconPlus className="size-3.5" />
          Mới
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-zinc-500">
            Chưa có hội thoại. Bắt đầu chat hoặc bấm Mới.
          </p>
        ) : (
          <ul className="space-y-1">
            {sessions.map((s) => {
              const active = s.id === activeId;
              return (
                <li key={s.id}>
                  <button
                    className={cn(
                      "w-full rounded-xl px-3 py-2.5 text-left transition",
                      active
                        ? "bg-white/[0.08] text-white"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    )}
                    disabled={busy}
                    onClick={() => onSelect(s.id)}
                    type="button"
                  >
                    <span className="line-clamp-2 text-sm font-medium">
                      {s.title || "Chat mới"}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-zinc-600">
                      {s.last_message_at
                        ? new Date(s.last_message_at).toLocaleString("vi-VN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "Chưa có tin nhắn"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

export function ChatSessionDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="left"
        className="w-[min(100%,18rem)] gap-0 border-white/10 bg-zinc-950 p-0 sm:max-w-[18rem]"
      >
        <SheetTitle className="sr-only">Danh sách hội thoại</SheetTitle>
        <SheetDescription className="sr-only">
          Chọn hoặc tạo hội thoại chat
        </SheetDescription>
        <div className="flex h-full min-h-0 flex-1 flex-col pt-10">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function ChatSessionsToggle({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      aria-label="Danh sách hội thoại"
      className="size-8 text-zinc-300 md:hidden"
      onClick={onClick}
      size="icon"
      type="button"
      variant="ghost"
    >
      <IconMenu2 className="size-4" />
    </Button>
  );
}
