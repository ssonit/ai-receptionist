"use client";

import * as React from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconDotsVertical,
  IconVideo,
} from "@tabler/icons-react";

import { bookingConfig } from "@/lib/booking-config";
import {
  CAL_BOOKING_VIEWS,
  getCalBookingView,
  getCalLifecycleBadgeLabel,
  type CalBookingListFilter,
  type CalBookingView,
} from "@/lib/booking-status";
import { cn } from "@/lib/utils";
import { openAfterMenuClose } from "@/lib/open-after-menu-close";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { toast } from "sonner";

export type BookingRow = {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  start_time: string;
  status: string;
  list_status: string | null;
  service: string | null;
  cal_booking_uid: string | null;
  session_id: string | null;
  synced_at: string | null;
  raw?: unknown;
};

const TAB_VIEWS = CAL_BOOKING_VIEWS.filter(
  (v): v is (typeof CAL_BOOKING_VIEWS)[number] & { id: CalBookingView } =>
    v.id !== "all",
);

function rowView(row: BookingRow): CalBookingView {
  return getCalBookingView(row.status, row.start_time, {
    raw: row.raw,
    listFilter: (row.list_status as CalBookingListFilter | null) ?? null,
  });
}

function extractEndIso(row: BookingRow): string | null {
  const raw = row.raw;
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  return typeof data.end === "string" ? data.end : null;
}

function extractMeetingUrl(row: BookingRow): string | null {
  const raw = row.raw;
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (typeof data.meetingUrl === "string") return data.meetingUrl;
  if (typeof data.location === "string" && /^https?:\/\//.test(data.location)) {
    return data.location;
  }
  return null;
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: bookingConfig.timezone,
  });
}

function formatTime(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: bookingConfig.timezone,
    })
    .replace(/\s?(AM|PM)/i, (_, m: string) => m.toLowerCase());
}

function formatTimeRange(row: BookingRow) {
  const start = formatTime(row.start_time);
  const endIso = extractEndIso(row);
  if (!endIso) return start;
  return `${start} - ${formatTime(endIso)}`;
}

function formatWhenDay(row: BookingRow) {
  return new Date(row.start_time).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: bookingConfig.timezone,
  });
}

function formatWhenTime(row: BookingRow) {
  return `${formatTimeRange(row)} (Indochina Time)`;
}

function formatWhenLong(row: BookingRow) {
  return `${formatWhenDay(row)}, ${formatWhenTime(row)}`;
}

function bookingTitle(row: BookingRow) {
  const service = row.service?.trim() || "Appointment";
  return `${service} between ${bookingConfig.name} and ${row.guest_name}`;
}

function participantsLine(row: BookingRow) {
  const parts = ["You", row.guest_name];
  if (row.guest_email) parts.push(row.guest_email);
  return parts.join(" · ");
}

function initialOf(name: string) {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function BookingsTable({ rows }: { rows: BookingRow[] }) {
  const [view, setView] = React.useState<CalBookingView>("upcoming");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);

  const counts = React.useMemo(() => {
    const next: Record<CalBookingView, number> = {
      upcoming: 0,
      unconfirmed: 0,
      recurring: 0,
      past: 0,
      cancelled: 0,
    };
    for (const row of rows) next[rowView(row)] += 1;
    return next;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const list = rows.filter((row) => rowView(row) === view);
    list.sort((a, b) => {
      const diff = Date.parse(a.start_time) - Date.parse(b.start_time);
      return view === "past" || view === "cancelled" ? -diff : diff;
    });
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

  function onSelectView(next: string) {
    setView(next as CalBookingView);
    setSelectedId(null);
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Tabs value={view} onValueChange={onSelectView} className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={view} onValueChange={onSelectView}>
            <SelectTrigger className="w-fit md:hidden" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAB_VIEWS.map((tab) => (
                <SelectItem key={tab.id} value={tab.id}>
                  {tab.label} ({counts[tab.id]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TabsList className="hidden h-auto flex-wrap justify-start gap-1 bg-transparent p-0 md:flex">
            {TAB_VIEWS.map((tab) => (
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
              {view === "upcoming"
                ? "Next"
                : TAB_VIEWS.find((t) => t.id === view)?.label}
            </div>

            {pageRows.length === 0 ? (
              <p className="text-muted-foreground px-4 py-12 text-center text-sm">
                No bookings in this tab. Sync Cal.com or switch tabs.
              </p>
            ) : (
              <ul className="divide-y">
                {pageRows.map((row) => {
                  const meetingUrl = extractMeetingUrl(row);
                  const isActive = active?.id === row.id;
                  return (
                    <li key={row.id}>
                      <div
                        className={cn(
                          "flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-start sm:gap-6",
                          isActive && "bg-muted/50",
                          "hover:bg-muted/40 cursor-pointer",
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
                        <div className="w-full shrink-0 sm:w-40">
                          <p className="text-sm font-medium">
                            {formatDay(row.start_time)}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {formatTimeRange(row)}
                          </p>
                          {meetingUrl ? (
                            <Button
                              asChild
                              className="mt-2 h-8"
                              size="sm"
                              variant="outline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a
                                href={meetingUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                <IconVideo />
                                Join
                              </a>
                            </Button>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {bookingTitle(row)}
                          </p>
                          <p className="text-muted-foreground mt-1 truncate text-sm">
                            {participantsLine(row)}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {row.session_id ? "Chat" : "Cal.com"}
                            {row.guest_phone ? ` · ${row.guest_phone}` : ""}
                          </p>
                        </div>

                        <div
                          className="shrink-0 self-start"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                              >
                                <IconDotsVertical />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  openAfterMenuClose(() =>
                                    setSelectedId(row.id),
                                  );
                                }}
                              >
                                View details
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  const email = row.guest_email?.trim();
                                  if (!email) {
                                    toast.error("No email");
                                    return;
                                  }
                                  void navigator.clipboard.writeText(email);
                                  toast.success("Email copied");
                                }}
                              >
                                Copy email
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => {
                                  const phone = row.guest_phone?.trim();
                                  if (!phone) {
                                    toast.error("No phone number");
                                    return;
                                  }
                                  void navigator.clipboard.writeText(phone);
                                  toast.success("Phone copied");
                                }}
                              >
                                Copy phone
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                disabled={!row.cal_booking_uid}
                                onSelect={() => {
                                  if (!row.cal_booking_uid) return;
                                  void navigator.clipboard.writeText(
                                    row.cal_booking_uid,
                                  );
                                  toast.success("Cal UID copied");
                                }}
                              >
                                Copy Cal UID
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
              <div className="text-muted-foreground hidden items-center gap-2 text-sm sm:flex">
                <Label htmlFor="bookings-page-size">Rows per page</Label>
                <Select
                  value={`${pageSize}`}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger
                    id="bookings-page-size"
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
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-md"
        >
          {active ? <BookingDetailSheet booking={active} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BookingDetailSheet({ booking }: { booking: BookingRow }) {
  const meetingUrl = extractMeetingUrl(booking);
  const hostName = bookingConfig.name;

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{bookingTitle(booking)}</SheetTitle>
      <SheetDescription className="sr-only">
        {formatWhenLong(booking)}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        <Badge
          variant="outline"
          className="mb-5 w-fit rounded-md border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
        >
          {getCalLifecycleBadgeLabel(booking.status)}
        </Badge>

        <h2 className="text-foreground mb-8 text-xl leading-snug font-semibold tracking-tight">
          {bookingTitle(booking)}
        </h2>

        <div className="flex flex-col gap-8">
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-sm">When</h3>
            <div className="text-sm leading-relaxed">
              <p>{formatWhenDay(booking)}</p>
              <p>{formatWhenTime(booking)}</p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-muted-foreground text-sm">Who</h3>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                  {initialOf(hostName)}
                </div>
                <div className="min-w-0 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{hostName}</p>
                    <Badge
                      variant="secondary"
                      className="rounded-sm bg-sky-500/15 px-1.5 py-0 text-[10px] font-medium text-sky-600 dark:text-sky-400"
                    >
                      Host
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-muted text-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
                  {initialOf(booking.guest_name)}
                </div>
                <div className="min-w-0 space-y-0.5 pt-0.5">
                  <p className="text-sm font-medium">{booking.guest_name}</p>
                  {booking.guest_email ? (
                    <p className="text-muted-foreground truncate text-sm">
                      {booking.guest_email}
                    </p>
                  ) : null}
                  {booking.guest_phone ? (
                    <p className="text-muted-foreground text-sm">
                      {booking.guest_phone}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-muted-foreground text-sm">Where</h3>
            {meetingUrl ? (
              <p className="flex items-center gap-2 text-sm">
                <IconVideo className="size-4 shrink-0" />
                <span>
                  Cal Video:{" "}
                  <a
                    className="text-sky-500 underline-offset-2 hover:underline"
                    href={meetingUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {meetingUrl.replace(/^https?:\/\//, "")}
                  </a>
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {booking.session_id ? "Booked via chat" : "Cal.com"}
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 px-6 py-4">
        {meetingUrl ? (
          <Button asChild className="h-9 flex-1">
            <a href={meetingUrl} rel="noreferrer" target="_blank">
              <IconVideo className="size-4" />
              Join Cal Video
            </a>
          </Button>
        ) : (
          <div className="flex-1" />
        )}
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-9 shrink-0"
          disabled={!meetingUrl}
          onClick={() => {
            if (!meetingUrl) return;
            void navigator.clipboard.writeText(meetingUrl);
            toast.success("Link copied");
          }}
        >
          <IconCopy className="size-4" />
          <span className="sr-only">Copy link</span>
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 shrink-0"
            >
              <IconDots className="size-4" />
              <span className="sr-only">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                const email = booking.guest_email?.trim();
                if (!email) {
                  toast.error("No email");
                  return;
                }
                void navigator.clipboard.writeText(email);
                toast.success("Email copied");
              }}
            >
              Copy email
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                const phone = booking.guest_phone?.trim();
                if (!phone) {
                  toast.error("No phone number");
                  return;
                }
                void navigator.clipboard.writeText(phone);
                toast.success("Phone copied");
              }}
            >
              Copy phone
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!booking.cal_booking_uid}
              onSelect={() => {
                if (!booking.cal_booking_uid) return;
                void navigator.clipboard.writeText(booking.cal_booking_uid);
                toast.success("Cal UID copied");
              }}
            >
              Copy Cal UID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
