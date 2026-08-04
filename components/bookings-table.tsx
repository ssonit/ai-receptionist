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

import {
  CAL_BOOKING_VIEWS,
  getCalBookingView,
  getCalLifecycleBadgeLabel,
  type CalBookingListFilter,
  type CalBookingView,
} from "@/lib/booking-status";
import { cn } from "@/lib/utils";
import { openAfterMenuClose } from "@/lib/open-after-menu-close";
import {
  CancelBookingAlertDialog,
  type CancelBookingTarget,
} from "@/components/cancel-booking-alert-dialog";
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
  cancelled_by?: string | null;
  guest_timezone?: string | null;
  /** Latest reminder status across kinds (for badge). */
  reminder_status?: "pending" | "sent" | "failed" | "skipped" | null;
  service: string | null;
  cal_booking_uid: string | null;
  session_id: string | null;
  synced_at: string | null;
  raw?: unknown;
  created_by_staff_name?: string | null;
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

/** Formatters are expensive to build — one per timezone, reused across rows. */
const tzLabelFormatters = new Map<string, Intl.DateTimeFormat>();

function tzLabelFormatter(timeZone: string) {
  let fmt = tzLabelFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" });
    tzLabelFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** Human timezone label for the workspace tz, e.g. "Indochina Time", "GMT+1". */
function timeZoneLabel(iso: string, timeZone: string) {
  const parts = tzLabelFormatter(timeZone).formatToParts(new Date(iso));
  return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
}

function formatDay(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
}

function formatTime(iso: string, timeZone: string) {
  return new Date(iso)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    })
    .replace(/\s?(AM|PM)/i, (_, m: string) => m.toLowerCase());
}

function formatTimeRange(row: BookingRow, timeZone: string) {
  const start = formatTime(row.start_time, timeZone);
  const endIso = extractEndIso(row);
  if (!endIso) return start;
  return `${start} - ${formatTime(endIso, timeZone)}`;
}

function formatWhenDay(row: BookingRow, timeZone: string) {
  return new Date(row.start_time).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatWhenTime(row: BookingRow, timeZone: string) {
  const label = timeZoneLabel(row.start_time, timeZone);
  return `${formatTimeRange(row, timeZone)} (${label})`;
}

function formatWhenLong(row: BookingRow, timeZone: string) {
  return `${formatWhenDay(row, timeZone)}, ${formatWhenTime(row, timeZone)}`;
}

function bookingTitle(row: BookingRow, hostName: string) {
  const service = row.service?.trim() || "Appointment";
  return `${service} between ${hostName} and ${row.guest_name}`;
}

function participantsLine(row: BookingRow) {
  const parts = ["You", row.guest_name];
  if (row.guest_email) parts.push(row.guest_email);
  return parts.join(" · ");
}

function initialOf(name: string) {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

export function BookingsTable({
  rows,
  timeZone,
  hostName,
  serviceMode = "onsite",
}: {
  rows: BookingRow[];
  /** Workspace IANA timezone — never assume the Pilot default. */
  timeZone: string;
  /** Workspace name shown as the meeting host. */
  hostName: string;
  /** Onsite: hide "Guest saw" even if guest_timezone was stored by mistake. */
  serviceMode?: "onsite" | "online";
}) {
  const [view, setView] = React.useState<CalBookingView>("upcoming");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);
  const [cancelTarget, setCancelTarget] = React.useState<CancelBookingTarget | null>(
    null,
  );

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
                            {formatDay(row.start_time, timeZone)}
                          </p>
                          <p className="text-muted-foreground text-sm">
                            {formatTimeRange(row, timeZone)}
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
                            {bookingTitle(row, hostName)}
                          </p>
                          {row.created_by_staff_name ? (
                            <Badge
                              variant="secondary"
                              className="mt-1 rounded-sm text-[10px]"
                            >
                              Booked by {row.created_by_staff_name}
                            </Badge>
                          ) : null}
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
                              {rowView(row) !== "past" &&
                              rowView(row) !== "cancelled" ? (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => {
                                      openAfterMenuClose(() =>
                                        setCancelTarget({
                                          id: row.id,
                                          guest_name: row.guest_name,
                                          start_time: row.start_time,
                                        }),
                                      );
                                    }}
                                  >
                                    Cancel booking
                                  </DropdownMenuItem>
                                </>
                              ) : null}
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
          {active ? (
            <BookingDetailSheet
              booking={active}
              hostName={hostName}
              onRequestCancel={setCancelTarget}
              serviceMode={serviceMode}
              timeZone={timeZone}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <CancelBookingAlertDialog
        booking={cancelTarget}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        open={Boolean(cancelTarget)}
        timeZone={timeZone}
      />
    </div>
  );
}

function BookingDetailSheet({
  booking,
  timeZone,
  hostName,
  serviceMode = "onsite",
  onRequestCancel,
}: {
  booking: BookingRow;
  timeZone: string;
  hostName: string;
  serviceMode?: "onsite" | "online";
  onRequestCancel: (target: CancelBookingTarget) => void;
}) {
  const meetingUrl = extractMeetingUrl(booking);

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">
        {bookingTitle(booking, hostName)}
      </SheetTitle>
      <SheetDescription className="sr-only">
        {formatWhenLong(booking, timeZone)}
      </SheetDescription>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="w-fit rounded-md border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
          >
            {getCalLifecycleBadgeLabel(booking.status)}
          </Badge>
          {booking.cancelled_by === "guest" ? (
            <Badge variant="secondary" className="text-xs">
              Cancelled by guest
            </Badge>
          ) : booking.cancelled_by === "cal" ? (
            <Badge variant="outline" className="text-xs">
              Cancelled on Cal.com
            </Badge>
          ) : booking.cancelled_by === "owner" ? (
            <Badge variant="secondary" className="text-xs">
              Cancelled by staff
            </Badge>
          ) : null}
          {booking.reminder_status === "sent" ? (
            <Badge variant="secondary" className="text-xs">
              Reminder sent
            </Badge>
          ) : booking.reminder_status === "pending" ? (
            <Badge variant="outline" className="text-xs">
              Reminder pending
            </Badge>
          ) : booking.reminder_status === "failed" ? (
            <Badge variant="destructive" className="text-xs">
              Reminder failed
            </Badge>
          ) : null}
        </div>

        <h2 className="text-foreground mb-8 text-xl leading-snug font-semibold tracking-tight">
          {bookingTitle(booking, hostName)}
        </h2>

        <div className="flex flex-col gap-8">
          <section className="space-y-2">
            <h3 className="text-muted-foreground text-sm">When</h3>
            <div className="text-sm leading-relaxed">
              <p>{formatWhenDay(booking, timeZone)}</p>
              <p>{formatWhenTime(booking, timeZone)}</p>
              {serviceMode === "online" &&
              booking.guest_timezone &&
              booking.guest_timezone !== timeZone ? (
                <p className="text-muted-foreground text-xs">
                  Guest saw:{" "}
                  {formatTime(booking.start_time, booking.guest_timezone)} (
                  {timeZoneLabel(booking.start_time, booking.guest_timezone)})
                </p>
              ) : null}
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
            {rowView(booking) !== "past" && rowView(booking) !== "cancelled" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    openAfterMenuClose(() =>
                      onRequestCancel({
                        id: booking.id,
                        guest_name: booking.guest_name,
                        start_time: booking.start_time,
                      }),
                    );
                  }}
                >
                  Cancel booking
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
