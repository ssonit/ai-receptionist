"use client";

import * as React from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconMessage,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConversationDetailSheet } from "@/components/conversation-detail-sheet";
import {
  formatConversationWhen,
  HUMAN_BADGE_CLASS,
  outcomeBadgeClass,
  outcomeLabel,
} from "@/components/conversation-display";
import type { ConversationListRow } from "@/lib/conversations-dashboard";
import { cn } from "@/lib/utils";

const VIEWS = [
  { id: "all" as const, label: "All" },
  { id: "human" as const, label: "Human" },
  { id: "booked" as const, label: "Booked" },
  { id: "lead" as const, label: "Lead" },
  { id: "errors" as const, label: "Errors" },
  { id: "abandoned" as const, label: "Abandoned" },
];

type ViewId = (typeof VIEWS)[number]["id"];

export function ConversationsTable({ rows }: { rows: ConversationListRow[] }) {
  const [view, setView] = React.useState<ViewId>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(0);
  const pageSize = 20;

  const filtered = React.useMemo(() => {
    if (view === "all") return rows;
    // "human" is who answers, not how the conversation went — it cuts across
    // every outcome, so it cannot be matched against `outcome` like the rest.
    if (view === "human") return rows.filter((r) => r.reply_mode === "human");
    return rows.filter((r) => r.outcome === view);
  }, [rows, view]);

  const humanCount = React.useMemo(
    () => rows.filter((r) => r.reply_mode === "human").length,
    [rows],
  );

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
              {v.id === "human" && humanCount > 0 ? (
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {humanCount}
                </span>
              ) : null}
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
                      {view === "human"
                        ? "No conversations are being handled by a person."
                        : "No conversations yet."}
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
                            <div className="flex items-center gap-2">
                              <p className="truncate font-medium">
                                {row.title || "New chat"}
                              </p>
                              {row.reply_mode === "human" ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "shrink-0 rounded-md text-[10px]",
                                    HUMAN_BADGE_CLASS,
                                  )}
                                >
                                  Human
                                </Badge>
                              ) : null}
                            </div>
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
                        {formatConversationWhen(
                          row.last_message_at || row.created_at,
                        )}
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
