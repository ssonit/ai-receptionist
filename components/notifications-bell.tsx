"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconBell } from "@tabler/icons-react";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/dashboard/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NotificationRow } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/client";
import { getPilotWorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRow[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/dashboard/notifications?limit=10&unreadFirst=1",
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: NotificationRow[];
        unread: number;
      };
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch (error) {
      console.error("[notifications bell]", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Supabase Realtime: refresh on insert/update (mark read) for this workspace.
  React.useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | undefined;
    const workspaceId = getPilotWorkspaceId();
    const supabase = createClient();

    const scheduleReload = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        if (!cancelled) void load();
      }, 250);
    };

    const channel = supabase
      .channel(`notifications:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          scheduleReload();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[notifications bell] realtime unavailable, using poll");
        }
      });

    const onFocus = () => {
      if (document.visibilityState === "visible") void load();
    };
    // Fallback poll if realtime drops — much slower than before.
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5 * 60_000);

    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={
            unread > 0 ? `${unread} thông báo chưa đọc` : "Thông báo"
          }
          className="relative"
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <IconBell className="size-4" />
          {unread > 0 ? (
            <Badge
              className="absolute -top-1.5 -right-1.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
              variant="destructive"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Thông báo</span>
          {unread > 0 ? (
            <button
              className="text-muted-foreground text-xs font-normal underline-offset-4 hover:underline"
              type="button"
              onClick={() => {
                void (async () => {
                  await markAllNotificationsReadAction();
                  await load();
                  router.refresh();
                })();
              }}
            >
              Đọc hết
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading && items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            Đang tải…
          </p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-xs">
            Chưa có thông báo.
          </p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              className={cn(
                "flex cursor-pointer flex-col items-start gap-0.5 py-2",
                !item.read_at && "bg-muted/40",
              )}
              onSelect={() => {
                void (async () => {
                  if (!item.read_at) {
                    await markNotificationReadAction(item.id);
                  }
                  setOpen(false);
                  router.push(item.href || "/dashboard/notifications");
                  router.refresh();
                })();
              }}
            >
              <span className="line-clamp-1 text-sm font-medium">
                {item.title}
              </span>
              {item.body ? (
                <span className="text-muted-foreground line-clamp-2 text-xs">
                  {item.body}
                </span>
              ) : null}
              <span className="text-muted-foreground text-[10px]">
                {formatWhen(item.created_at)}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/notifications">Xem tất cả</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
