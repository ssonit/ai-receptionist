"use client";

import * as React from "react";
import Link from "next/link";
import {
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ConversationListRow,
  ConversationOutcome,
} from "@/lib/conversations-dashboard";
import type { ChatMessageRow } from "@/lib/chat-sessions";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "all" as const, label: "All" },
  { id: "booked" as const, label: "Booked" },
  { id: "lead" as const, label: "Lead" },
  { id: "errors" as const, label: "Errors" },
  { id: "abandoned" as const, label: "Abandoned" },
];

type ViewId = (typeof VIEWS)[number]["id"];

function outcomeBadgeClass(outcome: ConversationOutcome) {
  switch (outcome) {
    case "booked":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "lead":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "errors":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "abandoned":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function outcomeLabel(outcome: ConversationOutcome) {
  switch (outcome) {
    case "booked":
      return "Booked";
    case "lead":
      return "Lead";
    case "errors":
      return "Tool errors";
    case "abandoned":
      return "Abandoned";
    default:
      return "Empty";
  }
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ConversationDetailSheet({
  sessionId,
}: {
  sessionId: string;
}) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("Conversation");
  const [outcome, setOutcome] = React.useState<ConversationOutcome>("empty");
  const [messages, setMessages] = React.useState<ChatMessageRow[]>([]);
  const [leadId, setLeadId] = React.useState<string | null>(null);
  const [bookingId, setBookingId] = React.useState<string | null>(null);
  const [toolErrors, setToolErrors] = React.useState<
    { id: string; tool_name: string; error: string | null; created_at: string }[]
  >([]);
  const [eveSessionId, setEveSessionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/conversations/${sessionId}`);
        if (!res.ok) throw new Error("Failed to load conversation");
        const data = await res.json();
        if (cancelled) return;
        setTitle(data.session?.title ?? "Conversation");
        setOutcome(data.outcome ?? "empty");
        setMessages(data.messages ?? []);
        setLeadId(data.leadId ?? null);
        setBookingId(data.bookingId ?? null);
        setToolErrors(data.toolErrors ?? []);
        setEveSessionId(data.session?.eve_session_id ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">
        Conversation transcript {sessionId}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        <Badge
          variant="outline"
          className={cn(
            "mb-4 w-fit rounded-md px-2 py-0.5 text-xs font-medium",
            outcomeBadgeClass(outcome),
          )}
        >
          {outcomeLabel(outcome)}
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {eveSessionId || sessionId}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {leadId ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/leads">Open Leads</Link>
            </Button>
          ) : null}
          {bookingId ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/bookings">Open Bookings</Link>
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-muted-foreground mt-8 text-sm">Loading…</p>
        ) : error ? (
          <p className="text-destructive mt-8 text-sm">{error}</p>
        ) : (
          <>
            <div className="mt-8 space-y-3">
              <h3 className="text-sm font-medium">Transcript</h3>
              {messages.length === 0 ? (
                <p className="text-muted-foreground text-sm">No messages yet.</p>
              ) : (
                <ul className="space-y-3">
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm",
                        m.role === "user"
                          ? "border-border bg-muted/40"
                          : "border-border/60 bg-background",
                      )}
                    >
                      <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
                        {m.role}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {toolErrors.length > 0 ? (
              <div className="mt-8 space-y-2">
                <h3 className="text-sm font-medium">Tool errors</h3>
                <ul className="divide-y rounded-lg border">
                  {toolErrors.map((row) => (
                    <li key={row.id} className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {row.tool_name}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          {formatWhen(row.created_at)}
                        </span>
                      </div>
                      <p className="text-destructive mt-1 break-words">
                        {row.error || "Unknown error"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function ConversationsTable({ rows }: { rows: ConversationListRow[] }) {
  const [view, setView] = React.useState<ViewId>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const pageSize = 20;

  const filtered = React.useMemo(() => {
    if (view === "all") return rows;
    return rows.filter((r) => r.outcome === view);
  }, [rows, view]);

  React.useEffect(() => {
    setPage(0);
  }, [view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  return (
    <div className="px-4 lg:px-6">
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as ViewId)}
      >
        <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
          {VIEWS.map((v) => (
            <TabsTrigger key={v.id} value={v.id}>
              {v.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={view} className="mt-0">
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-left text-xs">
                <tr>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    Outcome
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    Messages
                  </th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      className="text-muted-foreground px-4 py-10 text-center"
                      colSpan={4}
                    >
                      No conversations yet.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-muted/30 cursor-pointer border-t"
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <IconMessage className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {row.title || "New chat"}
                            </p>
                            <p className="text-muted-foreground truncate font-mono text-[10px]">
                              {row.eve_session_id || row.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <Badge
                          variant="outline"
                          className={cn(
                            "rounded-md text-xs",
                            outcomeBadgeClass(row.outcome),
                          )}
                        >
                          {outcomeLabel(row.outcome)}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground hidden px-4 py-3 tabular-nums md:table-cell">
                        {row.message_count}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">
                        {formatWhen(row.last_message_at || row.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <p className="text-muted-foreground text-xs">
              {filtered.length} conversations · page {page + 1}/{pageCount}
            </p>
            <div className="flex gap-1">
              <Button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                size="icon"
                variant="outline"
              >
                <IconChevronLeft className="size-4" />
              </Button>
              <Button
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                size="icon"
                variant="outline"
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet
        open={Boolean(selectedId)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-lg p-0" side="right">
          {selectedId ? (
            <ConversationDetailSheet sessionId={selectedId} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
