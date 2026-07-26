/**
 * Outbound booking reminders — schedule + send via cron tick.
 * Short lead is always guest_change_cutoff_minutes + 30 (guest still has time to change).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/app-origin";
import { isCancelledStatus } from "@/lib/booking-status";
import { hashManageLinkToken } from "@/lib/booking-manage-code";
import {
  bookingReminderEmailCopy,
  sendTransactionalEmail,
} from "@/lib/email";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { createNotificationDebounced } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizeTimezone } from "@/lib/timezones";
import { isWorkspaceBookingLive, publicBookingPath } from "@/lib/workspace";

export type ReminderKind = "reminder_24h" | "reminder_2h";

/** Bounded retry — a transient Resend/network failure gets a few more ticks. */
const MAX_REMINDER_ATTEMPTS = 3;

export type SendDueRemindersResult = {
  scheduled: number;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
};

type WorkspaceReminderRow = {
  id: string;
  name: string;
  slug: string | null;
  timezone: string;
  address: string | null;
  service_mode: string | null;
  booking_reminders_enabled: boolean;
  reminder_lead_minutes: number[] | null;
  reminder_quiet_start: number;
  reminder_quiet_end: number;
  guest_change_cutoff_minutes: number | null;
  agent_reply_locale: string | null;
};

type BookingReminderSource = {
  id: string;
  workspace_id: string;
  guest_name: string;
  guest_email: string | null;
  guest_timezone: string | null;
  service: string | null;
  start_time: string;
  status: string;
  reminders_opt_out: boolean | null;
  raw: unknown;
};

function pepper(): string {
  return (
    process.env.BOOKING_MANAGE_CODE_PEPPER?.trim() ||
    process.env.WORKSPACE_SECRETS_KEY?.trim() ||
    "eve-dev-manage-code-pepper"
  );
}

export function makeReminderOptOutToken(bookingId: string): string {
  const sig = createHmac("sha256", pepper())
    .update(`optout:${bookingId}`)
    .digest("base64url");
  return `${bookingId}.${sig}`;
}

export function verifyReminderOptOutToken(token: string): string | null {
  const [bookingId, sig] = token.split(".");
  if (!bookingId || !sig) return null;
  const expected = createHmac("sha256", pepper())
    .update(`optout:${bookingId}`)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return bookingId;
}

function zonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Convert a civil wall time in `timeZone` to a UTC Date. */
function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i++) {
    const got = zonedParts(new Date(utc), timeZone);
    const gotAsUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      0,
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    utc += wanted - gotAsUtc;
  }
  return new Date(utc);
}

function addCalendarDays(
  year: number,
  month: number,
  day: number,
  delta: number,
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function isInQuietHours(
  date: Date,
  timeZone: string,
  quietStart: number,
  quietEnd: number,
): boolean {
  if (quietStart === quietEnd) return false;
  const { hour } = zonedParts(date, timeZone);
  if (quietStart < quietEnd) {
    return hour >= quietStart && hour < quietEnd;
  }
  return hour >= quietStart || hour < quietEnd;
}

/** Next quiet-end wall clock at or after `from` in `timeZone`. */
export function deferToQuietEnd(
  from: Date,
  timeZone: string,
  quietEnd: number,
): Date {
  const parts = zonedParts(from, timeZone);
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;
  if (
    parts.hour > quietEnd ||
    (parts.hour === quietEnd && parts.minute > 0)
  ) {
    ({ year: y, month: m, day: d } = addCalendarDays(y, m, d, 1));
  }
  return wallTimeToUtc(y, m, d, quietEnd, 0, timeZone);
}

function kindForLeadMinutes(leadMinutes: number, shortLead: number): ReminderKind {
  return leadMinutes <= shortLead + 60 ? "reminder_2h" : "reminder_24h";
}

/**
 * A configured long-lead reminder must clear the short-lead window
 * (cutoff + 30) with margin, or it collapses into the same "reminder_2h"
 * slot and is silently dropped by `effectiveLeadMinutes`. Exported so
 * `saveWorkspaceSettings` can reject a value before it goes silent instead
 * of accepting it and having it vanish at send time.
 */
export function minLongLeadMinutes(guestChangeCutoffMinutes: number): number {
  const cutoff = Math.max(0, Math.floor(guestChangeCutoffMinutes));
  return cutoff + 30 + 60;
}

/**
 * Effective lead offsets: long leads from settings + short = cutoff + 30.
 */
export function effectiveLeadMinutes(input: {
  reminderLeadMinutes: number[] | null | undefined;
  guestChangeCutoffMinutes: number;
}): { lead: number; kind: ReminderKind }[] {
  const cutoff = Math.max(0, Math.floor(input.guestChangeCutoffMinutes));
  const shortLead = cutoff + 30;
  const minLongLead = minLongLeadMinutes(cutoff);
  const configured = (input.reminderLeadMinutes ?? [1440])
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n > minLongLead);

  const longs = configured.length > 0 ? configured : [1440];
  const out: { lead: number; kind: ReminderKind }[] = [];
  const seen = new Set<ReminderKind>();

  for (const lead of [...longs].sort((a, b) => b - a)) {
    const kind = kindForLeadMinutes(lead, shortLead);
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push({ lead, kind });
  }

  if (!seen.has("reminder_2h")) {
    out.push({ lead: shortLead, kind: "reminder_2h" });
  }

  return out;
}

function extractMeetingUrl(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  if (typeof data.meetingUrl === "string" && data.meetingUrl.trim()) {
    return data.meetingUrl.trim();
  }
  if (typeof data.location === "string" && /^https?:\/\//i.test(data.location)) {
    return data.location.trim();
  }
  return null;
}

function resolveReminderTimeZone(
  booking: BookingReminderSource,
  workspace: WorkspaceReminderRow,
): string {
  if (
    workspace.service_mode === "online" &&
    booking.guest_timezone?.trim()
  ) {
    return canonicalizeTimezone(booking.guest_timezone);
  }
  return canonicalizeTimezone(workspace.timezone || "UTC");
}

function computeSchedule(input: {
  startTime: Date;
  leadMinutes: number;
  kind: ReminderKind;
  timeZone: string;
  quietStart: number;
  quietEnd: number;
}): { scheduledFor: Date; status: "pending" | "skipped" } {
  let scheduledFor = new Date(
    input.startTime.getTime() - input.leadMinutes * 60_000,
  );

  if (
    !isInQuietHours(
      scheduledFor,
      input.timeZone,
      input.quietStart,
      input.quietEnd,
    )
  ) {
    return { scheduledFor, status: "pending" };
  }

  if (input.kind === "reminder_2h") {
    return { scheduledFor, status: "skipped" };
  }

  scheduledFor = deferToQuietEnd(
    scheduledFor,
    input.timeZone,
    input.quietEnd,
  );

  // If deferral pushed past the appointment, skip.
  if (scheduledFor.getTime() >= input.startTime.getTime()) {
    return { scheduledFor, status: "skipped" };
  }

  return { scheduledFor, status: "pending" };
}

async function loadReminderWorkspaces(
  workspaceIds: string[],
): Promise<WorkspaceReminderRow[]> {
  if (workspaceIds.length === 0) return [];
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, timezone, address, service_mode, booking_reminders_enabled, reminder_lead_minutes, reminder_quiet_start, reminder_quiet_end, guest_change_cutoff_minutes, agent_reply_locale",
    )
    .in("id", workspaceIds)
    .eq("booking_reminders_enabled", true);

  if (error) {
    console.error("[reminders] load workspaces failed", error.message);
    return [];
  }
  return (data ?? []) as WorkspaceReminderRow[];
}

/** Existing booking_reminders rows we're allowed to recompute (settings changed). */
const RECOMPUTABLE_ERROR = "quiet_hours_short_lead";

async function scheduleForWorkspace(
  workspace: WorkspaceReminderRow,
): Promise<number> {
  const supabase = createAdminClient();
  const leads = effectiveLeadMinutes({
    reminderLeadMinutes: workspace.reminder_lead_minutes,
    guestChangeCutoffMinutes:
      typeof workspace.guest_change_cutoff_minutes === "number"
        ? workspace.guest_change_cutoff_minutes
        : 120,
  });
  const maxLead = Math.max(...leads.map((l) => l.lead), 1440);
  const now = Date.now();
  const horizon = new Date(now + maxLead * 60_000 + 60 * 60_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, workspace_id, guest_name, guest_email, guest_timezone, service, start_time, status, reminders_opt_out, raw",
    )
    .eq("workspace_id", workspace.id)
    .gte("start_time", nowIso)
    .lte("start_time", horizon)
    .eq("reminders_opt_out", false)
    .not("guest_email", "is", null)
    .limit(500);

  if (error) {
    console.error("[reminders] load bookings failed", error.message);
    return 0;
  }

  const quietStart = workspace.reminder_quiet_start ?? 21;
  const quietEnd = workspace.reminder_quiet_end ?? 8;

  const eligibleBookings = (bookings ?? [])
    .map((raw) => raw as BookingReminderSource)
    .filter(
      (booking): booking is BookingReminderSource & { guest_email: string } =>
        Boolean(booking.guest_email?.trim()) &&
        !isCancelledStatus(booking.status) &&
        !Number.isNaN(new Date(booking.start_time).getTime()),
    );

  if (eligibleBookings.length === 0) {
    await supabase
      .from("workspaces")
      .update({ last_reminder_scan_at: new Date().toISOString() })
      .eq("id", workspace.id);
    return 0;
  }

  // One lookup for every (booking, kind) already on file, so we never
  // resend/resurrect a row that's already `sent` or terminally `failed` —
  // only truly new rows or ones still `pending`/quiet-hours-`skipped` are
  // (re)written, in a single batched upsert instead of one write per row.
  const bookingIds = eligibleBookings.map((b) => b.id);
  const { data: existingRows } = await supabase
    .from("booking_reminders")
    .select("booking_id, kind, status, error")
    .eq("channel", "email")
    .in("booking_id", bookingIds);

  const existingMap = new Map<
    string,
    { status: string; error: string | null }
  >();
  for (const row of existingRows ?? []) {
    existingMap.set(`${row.booking_id}:${row.kind}`, {
      status: row.status as string,
      error: (row.error as string | null) ?? null,
    });
  }

  const rows: {
    workspace_id: string;
    booking_id: string;
    kind: ReminderKind;
    channel: string;
    destination: string;
    status: "pending" | "skipped";
    scheduled_for: string;
    error: string | null;
  }[] = [];
  let newCount = 0;

  for (const booking of eligibleBookings) {
    const startTime = new Date(booking.start_time);
    const tz = resolveReminderTimeZone(booking, workspace);

    for (const { lead, kind } of leads) {
      const key = `${booking.id}:${kind}`;
      const existing = existingMap.get(key);

      if (
        existing &&
        existing.status !== "pending" &&
        !(existing.status === "skipped" && existing.error === RECOMPUTABLE_ERROR)
      ) {
        continue; // already sent, terminally failed, or skipped for a real reason (opt-out etc).
      }
      if (!existing) newCount += 1;

      const { scheduledFor, status } = computeSchedule({
        startTime,
        leadMinutes: lead,
        kind,
        timeZone: tz,
        quietStart,
        quietEnd,
      });

      rows.push({
        workspace_id: workspace.id,
        booking_id: booking.id,
        kind,
        channel: "email",
        destination: booking.guest_email.trim().toLowerCase(),
        status,
        scheduled_for: scheduledFor.toISOString(),
        error: status === "skipped" ? RECOMPUTABLE_ERROR : null,
      });
    }
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("booking_reminders")
      .upsert(rows, { onConflict: "booking_id,kind,channel" });

    if (upsertError) {
      console.warn("[reminders] upsert", upsertError.message);
      newCount = 0;
    }
  }

  await supabase
    .from("workspaces")
    .update({ last_reminder_scan_at: new Date().toISOString() })
    .eq("id", workspace.id);

  return newCount;
}

async function issueManageLink(input: {
  workspaceId: string;
  bookingId: string;
  startTime: string;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const codeHash = hashManageLinkToken(token);
  const startMs = new Date(input.startTime).getTime();
  const expiresAt = new Date(
    (Number.isFinite(startMs) ? startMs : Date.now()) + 60 * 60_000,
  ).toISOString();

  const { error } = await supabase.from("booking_verifications").insert({
    workspace_id: input.workspaceId,
    booking_id: input.bookingId,
    chat_session_id: null,
    channel: "manage_link",
    destination: null,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
    consumed_at: null,
    verified_until: null,
  });

  if (error) {
    console.error("[reminders] manage_link insert failed", error.message);
    return null;
  }
  return token;
}

async function sendOneReminder(row: {
  id: string;
  workspace_id: string;
  booking_id: string;
  kind: string;
  destination: string | null;
  attempts: number;
}): Promise<"sent" | "failed" | "skipped"> {
  const supabase = createAdminClient();

  const [{ data: booking }, { data: workspace }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, workspace_id, guest_name, guest_email, guest_timezone, service, start_time, status, reminders_opt_out, raw",
      )
      .eq("id", row.booking_id)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select(
        "id, name, slug, timezone, address, service_mode, booking_reminders_enabled, reminder_quiet_start, reminder_quiet_end, guest_change_cutoff_minutes, agent_reply_locale",
      )
      .eq("id", row.workspace_id)
      .maybeSingle(),
  ]);

  const mark = async (
    status: "sent" | "failed" | "skipped",
    error?: string,
  ) => {
    await supabase
      .from("booking_reminders")
      .update({
        status,
        attempts: (row.attempts ?? 0) + 1,
        error: error ?? null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
  };

  if (!booking || !workspace) {
    await mark("skipped", "booking_or_workspace_missing");
    return "skipped";
  }
  if (!workspace.booking_reminders_enabled) {
    await mark("skipped", "reminders_disabled");
    return "skipped";
  }
  // Cal key / meeting type can be removed after reminders were scheduled —
  // don't email a manage link into a "booking page isn't ready yet" wall.
  if (!(await isWorkspaceBookingLive(workspace.id))) {
    await mark("skipped", "booking_not_live");
    return "skipped";
  }
  if (booking.reminders_opt_out) {
    await mark("skipped", "opt_out");
    return "skipped";
  }
  if (isCancelledStatus(booking.status)) {
    await mark("skipped", "booking_cancelled");
    return "skipped";
  }

  const email =
    row.destination?.trim() || booking.guest_email?.trim() || "";
  if (!email) {
    await mark("skipped", "no_email");
    return "skipped";
  }

  const slug = workspace.slug?.trim();
  if (!slug) {
    await mark("failed", "workspace_missing_slug");
    return "failed";
  }

  const token = await issueManageLink({
    workspaceId: workspace.id,
    bookingId: booking.id,
    startTime: booking.start_time,
  });
  if (!token) {
    await mark("failed", "manage_link_issue_failed");
    await notifyReminderFailure(workspace.id, booking.id);
    return "failed";
  }

  const origin = appOrigin();
  const manageUrl = `${origin}${publicBookingPath(slug)}?mt=${encodeURIComponent(token)}`;
  const unsubscribeUrl = `${origin}${publicBookingPath(slug)}/unsubscribe?token=${encodeURIComponent(makeReminderOptOutToken(booking.id))}`;

  const guestTz =
    workspace.service_mode === "online" ? booking.guest_timezone : null;
  const display = formatSlotForGuest(
    booking.start_time,
    guestTz,
    workspace.timezone || "UTC",
    {
      locale:
        workspace.agent_reply_locale === "vi" ? "vi-VN" : "en-US",
      yourTimeLabel:
        workspace.agent_reply_locale === "vi" ? "giờ của bạn" : "your time",
    },
  );

  const meetingUrl = extractMeetingUrl(booking.raw);
  const locationLine =
    workspace.service_mode === "online"
      ? meetingUrl
      : workspace.address?.trim() || null;

  const locale = workspace.agent_reply_locale === "vi" ? "vi" : "en";
  const copy = bookingReminderEmailCopy({
    locale,
    workspaceName: workspace.name,
    serviceLabel: booking.service?.trim() || "Appointment",
    whenLabel: display.guest ?? display.business,
    locationLine,
    manageUrl,
    unsubscribeUrl,
  });

  const sent = await sendTransactionalEmail({
    to: email,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
    locale,
  });

  if (!sent.ok) {
    await mark("failed", "email_send_failed");
    await notifyReminderFailure(workspace.id, booking.id);
    return "failed";
  }

  await mark("sent");
  return "sent";
}

async function notifyReminderFailure(
  workspaceId: string,
  bookingId: string,
): Promise<void> {
  await createNotificationDebounced({
    type: "ai_config",
    title: "Booking reminders failing",
    body: "Outbound reminder emails could not be sent. Check RESEND_API_KEY and your verified sending domain.",
    severity: "high",
    href: "/dashboard/settings",
    entityType: "booking_reminder",
    entityId: bookingId,
    workspaceId,
    windowMinutes: 24 * 60,
  });
}

/**
 * Schedule pending rows + send due reminders for the given workspaces
 * (or discover reminder-enabled ones when ids omitted).
 */
export async function sendDueReminders(input?: {
  workspaceIds?: string[];
}): Promise<SendDueRemindersResult> {
  const supabase = createAdminClient();
  let workspaceIds = input?.workspaceIds ?? [];

  if (workspaceIds.length === 0) {
    const { data } = await supabase
      .from("workspaces")
      .select("id")
      .eq("booking_reminders_enabled", true)
      .limit(500);
    workspaceIds = (data ?? []).map((r) => r.id as string);
  }

  const workspaces = await loadReminderWorkspaces(workspaceIds);
  let scheduled = 0;
  for (const ws of workspaces) {
    scheduled += await scheduleForWorkspace(ws);
  }

  const nowIso = new Date().toISOString();
  const { data: due, error: dueError } = await supabase
    .from("booking_reminders")
    .select("id, workspace_id, booking_id, kind, destination, attempts")
    // Pending rows, plus previously-failed rows still under the retry cap —
    // a transient send failure must not permanently drop a reminder.
    .or(
      `status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_REMINDER_ATTEMPTS})`,
    )
    .lte("scheduled_for", nowIso)
    .in(
      "workspace_id",
      workspaces.map((w) => w.id).length
        ? workspaces.map((w) => w.id)
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("scheduled_for", { ascending: true })
    .limit(100);

  if (dueError) {
    console.error("[reminders] due query failed", dueError.message);
    return {
      scheduled,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: dueError.message,
    };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    try {
      const result = await sendOneReminder(row);
      if (result === "sent") sent += 1;
      else if (result === "failed") failed += 1;
      else skipped += 1;
    } catch (error) {
      failed += 1;
      console.error("[reminders] send crashed", error);
      await supabase
        .from("booking_reminders")
        .update({
          status: "failed",
          attempts: (row.attempts ?? 0) + 1,
          error: error instanceof Error ? error.message : "send_crashed",
        })
        .eq("id", row.id);
      await notifyReminderFailure(row.workspace_id, row.booking_id);
    }
  }

  return { scheduled, sent, failed, skipped };
}

/** Fingerprint helper for tests / debugging. */
export function reminderIdempotencyKey(
  bookingId: string,
  kind: ReminderKind,
  channel = "email",
): string {
  return createHash("sha256")
    .update(`${bookingId}:${kind}:${channel}`)
    .digest("hex")
    .slice(0, 16);
}
