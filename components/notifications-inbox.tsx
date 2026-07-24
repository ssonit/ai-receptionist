"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/dashboard/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  NotificationCursor,
  NotificationRow,
  NotificationTypeGroup,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function severityClass(severity: string) {
  if (severity === "high") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (severity === "medium") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  }
  return "border-border bg-muted text-muted-foreground";
}

type ViewMode = "unread" | "all";
type GroupFilter = "all" | NotificationTypeGroup;

export function NotificationsInbox({
  initialItems,
  initialNextCursor,
}: {
  initialItems: NotificationRow[];
  initialNextCursor: NotificationCursor | null;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<ViewMode>("unread");
  const [group, setGroup] = React.useState<GroupFilter>("all");
  const [items, setItems] = React.useState(initialItems);
  const [nextCursor, setNextCursor] = React.useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const loadPage = React.useCallback(
    async (opts: {
      view: ViewMode;
      group: GroupFilter;
      cursor?: NotificationCursor | null;
      append?: boolean;
    }) => {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (opts.view === "unread") params.set("unread", "1");
      else params.set("unreadFirst", "0");
      if (opts.group !== "all") params.set("group", opts.group);
      if (opts.cursor) {
        params.set("cursor", JSON.stringify(opts.cursor));
      }

      const res = await fetch(
        `/api/dashboard/notifications?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Failed to load notifications");
      const data = (await res.json()) as {
        items: NotificationRow[];
        nextCursor: NotificationCursor | null;
      };
      setItems((prev) =>
        opts.append ? [...prev, ...(data.items ?? [])] : (data.items ?? []),
      );
      setNextCursor(data.nextCursor ?? null);
    },
    [],
  );

  React.useEffect(() => {
    if (view === "unread" && group === "all") {
      setItems(initialItems);
      setNextCursor(initialNextCursor);
    }
  }, [initialItems, initialNextCursor, view, group]);

  const switchView = (next: ViewMode) => {
    setView(next);
    startTransition(async () => {
      try {
        await loadPage({ view: next, group, append: false });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load notifications",
        );
      }
    });
  };

  const switchGroup = (next: GroupFilter) => {
    setGroup(next);
    startTransition(async () => {
      try {
        await loadPage({ view, group: next, append: false });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load notifications",
        );
      }
    });
  };

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="bg-muted inline-flex rounded-lg p-0.5">
            <button
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === "unread"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              type="button"
              onClick={() => switchView("unread")}
            >
              Unread
            </button>
            <button
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                view === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              type="button"
              onClick={() => switchView("all")}
            >
              All
            </button>
          </div>
          <div className="bg-muted inline-flex rounded-lg p-0.5">
            {(
              [
                ["all", "All"],
                ["leads", "Leads"],
                ["bookings", "Bookings"],
                ["ai", "AI"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  group === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                type="button"
                onClick={() => switchGroup(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button
          disabled={pending}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => {
            startTransition(async () => {
              const result = await markAllNotificationsReadAction();
              if (result.error) toast.error(result.error);
              else {
                toast.success("Marked all as read");
                router.refresh();
                try {
                  await loadPage({ view, group, append: false });
                } catch {
                  // refresh will reload SSR defaults
                }
              }
            });
          }}
        >
          Mark all as read
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-4 py-12 text-center text-sm">
          {view === "unread"
            ? "No unread notifications."
            : "No notifications yet."}
        </p>
      ) : (
        <>
          <ul className="divide-y overflow-hidden rounded-xl border">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className={cn(
                    "hover:bg-muted/40 flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors",
                    !item.read_at && "bg-muted/20",
                  )}
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      if (!item.read_at) {
                        await markNotificationReadAction(item.id);
                      }
                      router.push(item.href || "/dashboard");
                      router.refresh();
                    });
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-md text-[10px]",
                        severityClass(item.severity),
                      )}
                    >
                      {item.severity}
                    </Badge>
                    {!item.read_at ? (
                      <Badge variant="secondary" className="text-[10px]">
                        New
                      </Badge>
                    ) : null}
                  </div>
                  {item.body ? (
                    <p className="text-muted-foreground line-clamp-2 text-sm">
                      {item.body}
                    </p>
                  ) : null}
                  <div className="text-muted-foreground flex flex-wrap gap-2 text-xs">
                    <span>{formatWhen(item.created_at)}</span>
                    {item.href ? (
                      <Link
                        className="underline underline-offset-4"
                        href={item.href}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Open link
                      </Link>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button
                disabled={loadingMore || pending}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  void (async () => {
                    setLoadingMore(true);
                    try {
                      await loadPage({
                        view,
                        group,
                        cursor: nextCursor,
                        append: true,
                      });
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to load more",
                      );
                    } finally {
                      setLoadingMore(false);
                    }
                  })();
                }}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
