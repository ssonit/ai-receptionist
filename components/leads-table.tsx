"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDotsVertical,
  IconUser,
} from "@tabler/icons-react";
import {
  updateLeadNotesAction,
  updateLeadStatusAction,
} from "@/app/dashboard/leads/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  getLeadStatusLabel,
  LEAD_STATUSES,
  LEAD_STATUS_VIEWS,
  type LeadStatus,
  type LeadStatusView,
} from "@/lib/lead-status";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type LeadRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  urgency: string | null;
  notes: string | null;
  status: string;
  session_id: string | null;
  created_at: string;
  updated_at: string | null;
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function urgencyBadgeClass(urgency: string | null) {
  switch (urgency) {
    case "urgent":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400";
    case "high":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "low":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "new":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "contacted":
      return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400";
    case "qualified":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "booked":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400";
    case "lost":
      return "border-border bg-muted text-muted-foreground";
    default:
      return "";
  }
}

function initialOf(name: string | null) {
  return (name?.trim().charAt(0) || "?").toUpperCase();
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-border/60 py-3 last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm break-all">{value || "—"}</dd>
    </div>
  );
}

function LeadDetailSheet({
  lead,
  onStatusChange,
}: {
  lead: LeadRow;
  onStatusChange: (status: LeadStatus) => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = React.useState(lead.notes ?? "");
  const [savingNotes, startSaveNotes] = React.useTransition();
  const [statusPending, startStatus] = React.useTransition();

  React.useEffect(() => {
    setNotes(lead.notes ?? "");
  }, [lead.id, lead.notes]);

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{lead.full_name || "Lead"}</SheetTitle>
      <SheetDescription className="sr-only">
        Lead details {lead.id}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        <Badge
          variant="outline"
          className={cn(
            "mb-5 w-fit rounded-md px-2 py-0.5 text-xs font-medium",
            statusBadgeClass(lead.status),
          )}
        >
          {getLeadStatusLabel(lead.status)}
        </Badge>

        <div className="mb-8 flex items-start gap-3">
          <div className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium">
            {initialOf(lead.full_name)}
          </div>
          <div className="min-w-0">
            <h2 className="text-foreground text-xl leading-snug font-semibold tracking-tight">
              {lead.full_name || "Untitled lead"}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {formatWhen(lead.created_at)}
            </p>
          </div>
        </div>

        <section className="mb-8">
          <h3 className="text-muted-foreground mb-1 text-sm">Details</h3>
          <dl>
            <DetailRow label="Phone" value={lead.phone} />
            <DetailRow label="Email" value={lead.email} />
            <DetailRow label="Service" value={lead.service} />
            <DetailRow
              label="Urgency"
              value={
                lead.urgency ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-md text-xs capitalize",
                      urgencyBadgeClass(lead.urgency),
                    )}
                  >
                    {lead.urgency}
                  </Badge>
                ) : (
                  "—"
                )
              }
            />
            <DetailRow
              label="Session"
              value={
                lead.session_id ? (
                  <span className="font-mono text-xs">{lead.session_id}</span>
                ) : (
                  "—"
                )
              }
            />
            <DetailRow
              label="Updated"
              value={lead.updated_at ? formatWhen(lead.updated_at) : "—"}
            />
          </dl>
        </section>

        <section className="mb-8 space-y-2">
          <Label htmlFor="lead-status">Status</Label>
          <Select
            disabled={statusPending}
            value={lead.status}
            onValueChange={(value) => {
              startStatus(() => {
                onStatusChange(value as LeadStatus);
              });
            }}
          >
            <SelectTrigger id="lead-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {getLeadStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <section className="space-y-2">
          <Label htmlFor="lead-notes">Notes</Label>
          <Textarea
            id="lead-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button
            disabled={savingNotes}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              startSaveNotes(async () => {
                const result = await updateLeadNotesAction(lead.id, notes);
                if (result.error) toast.error(result.error);
                else {
                  toast.success(result.success ?? "Saved");
                  router.refresh();
                }
              });
            }}
          >
            {savingNotes ? "Saving…" : "Save notes"}
          </Button>
        </section>
      </div>
    </div>
  );
}

export function LeadsTable({ rows }: { rows: LeadRow[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<LeadStatusView>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [statusPending, startStatus] = React.useTransition();

  const counts = React.useMemo(() => {
    const next: Record<LeadStatusView, number> = {
      all: rows.length,
      new: 0,
      contacted: 0,
      qualified: 0,
      booked: 0,
      lost: 0,
    };
    for (const row of rows) {
      if (row.status in next) {
        next[row.status as LeadStatus] += 1;
      }
    }
    return next;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const list =
      view === "all" ? [...rows] : rows.filter((row) => row.status === view);
    list.sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    );
    return list;
  }, [rows, view]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(
    pageIndex * pageSize,
    pageIndex * pageSize + pageSize,
  );

  const active = selectedId
    ? (rows.find((row) => row.id === selectedId) ?? null)
    : null;

  React.useEffect(() => {
    setPageIndex(0);
  }, [view, pageSize]);

  async function changeStatus(leadId: string, status: LeadStatus) {
    const result = await updateLeadStatusAction(leadId, status);
    if (result.error) toast.error(result.error);
    else {
      toast.success(result.success);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Tabs
        value={view}
        onValueChange={(v) => setView(v as LeadStatusView)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select
            value={view}
            onValueChange={(v) => setView(v as LeadStatusView)}
          >
            <SelectTrigger className="w-fit md:hidden" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_STATUS_VIEWS.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  {tab.label} ({counts[tab.id]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TabsList className="hidden h-auto flex-wrap justify-start gap-1 bg-transparent p-0 md:flex">
            {LEAD_STATUS_VIEWS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-lg border border-transparent px-3 py-1.5 data-[state=active]:border-border data-[state=active]:bg-muted"
              >
                {tab.label}
                <span className="text-muted-foreground ml-1 text-xs">
                  {counts[tab.id]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={view} className="mt-0">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="text-muted-foreground border-b px-4 py-3 text-xs font-medium tracking-wide uppercase">
              {view === "all" ? "Recent" : getLeadStatusLabel(view)}
            </div>

            {pageRows.length === 0 ? (
              <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                No leads in this tab yet. Chat with customers so `log_lead` can capture them.
              </p>
            ) : (
              <ul className="divide-y">
                {pageRows.map((row) => {
                  const isActive = active?.id === row.id;
                  return (
                    <li key={row.id}>
                      <div
                        className={cn(
                          "flex cursor-pointer items-start gap-4 px-4 py-4 transition-colors",
                          "hover:bg-muted/40",
                          isActive && "bg-muted/50",
                        )}
                        onClick={() => setSelectedId(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(row.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full">
                          <IconUser className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium">
                              {row.full_name || "Untitled lead"}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-md px-1.5 py-0 text-[10px]",
                                statusBadgeClass(row.status),
                              )}
                            >
                              {getLeadStatusLabel(row.status)}
                            </Badge>
                            {row.urgency ? (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-md px-1.5 py-0 text-[10px] capitalize",
                                  urgencyBadgeClass(row.urgency),
                                )}
                              >
                                {row.urgency}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-muted-foreground mt-0.5 text-sm">
                            {row.phone || "No phone number"}
                            {row.service ? ` · ${row.service}` : ""}
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {formatWhen(row.created_at)}
                          </p>
                        </div>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <IconDotsVertical className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenuItem
                              onSelect={() => {
                                const phone = row.phone?.trim();
                                if (!phone) {
                                  toast.error("No phone number");
                                  return;
                                }
                                void navigator.clipboard.writeText(phone);
                                toast.success("Phone copied");
                              }}
                            >
                              <IconCopy />
                              Copy phone
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                const email = row.email?.trim();
                                if (!email) {
                                  toast.error("No email");
                                  return;
                                }
                                void navigator.clipboard.writeText(email);
                                toast.success("Email copied");
                              }}
                            >
                              <IconCopy />
                              Copy email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {LEAD_STATUSES.filter((s) => s !== row.status).map(
                              (s) => (
                                <DropdownMenuItem
                                  key={s}
                                  disabled={statusPending}
                                  onSelect={() => {
                                    startStatus(async () => {
                                      await changeStatus(row.id, s);
                                    });
                                  }}
                                >
                                  → {getLeadStatusLabel(s)}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <div className="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
                <Label htmlFor="leads-page-size">Rows per page</Label>
                <Select
                  value={`${pageSize}`}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger
                    id="leads-page-size"
                    size="sm"
                    className="w-18"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30].map((n) => (
                      <SelectItem key={n} value={`${n}`}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground text-sm">
                {filtered.length === 0
                  ? "0"
                  : `${pageIndex * pageSize + 1}–${Math.min(
                      (pageIndex + 1) * pageSize,
                      filtered.length,
                    )} of ${filtered.length}`}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                >
                  <IconChevronLeft />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8"
                  disabled={pageIndex >= pageCount - 1}
                  onClick={() =>
                    setPageIndex((p) => Math.min(pageCount - 1, p + 1))
                  }
                >
                  <IconChevronRight />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Sheet
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          {active ? (
            <LeadDetailSheet
              lead={active}
              onStatusChange={(status) => {
                startStatus(async () => {
                  await changeStatus(active.id, status);
                });
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
