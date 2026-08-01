/**
 * Guest booking ownership for cancel / reschedule / list (no dashboard login).
 * Claim tiers: A1 same chat session, A2 same visitor (+ phone last4 verify),
 * A+ logged-in profile email, B manage code, C email OTP (via booking_verifications).
 */
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { isCancelledStatus } from "@/lib/booking-status";
import { VERIFIED_UNTIL_MS } from "@/lib/booking-manage-code";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { escapeLikePattern } from "@/lib/sql-like";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  authAttr,
  getPilotWorkspaceId,
  resolveWorkspaceIdBySlug,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";

export type AgentAuthBag = {
  attributes?: Readonly<Record<string, string | readonly string[]>>;
} | null;

export type OwnedBookingRow = {
  id: string;
  cal_booking_uid: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  service: string | null;
  start_time: string;
  status: string;
  list_status: string | null;
  visitor_id: string | null;
  chat_session_id: string | null;
  session_id: string | null;
  manage_code_hash: string | null;
  guest_timezone: string | null;
  claimTier: "A1" | "A2" | "A+" | "B" | "C";
};

export type GuestBookingActor = {
  workspaceId: string;
  chatSessionId: string | null;
  visitorId: string | null;
  eveSessionId: string | null;
  /** Profile email when chat_sessions.user_id is set (A+). */
  profileEmail: string | null;
  rateLimited: boolean;
};

export type WorkspaceGuestPolicy = {
  guestCancelEnabled: boolean;
  guestRescheduleEnabled: boolean;
  guestChangeCutoffMinutes: number;
  isPilot: boolean;
};

const BOOKING_SELECT =
  "id, cal_booking_uid, guest_name, guest_email, guest_phone, service, start_time, status, list_status, visitor_id, chat_session_id, session_id, manage_code_hash, guest_timezone";

export { authAttr } from "@/lib/workspace";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function activeBooking(row: {
  cal_booking_uid: string | null;
  status: string;
  list_status: string | null;
}): boolean {
  return (
    Boolean(row.cal_booking_uid?.trim()) &&
    !isCancelledStatus(row.status) &&
    row.list_status !== "cancelled"
  );
}

export async function resolveGuestBookingActor(input: {
  sessionId?: string | null;
  auth?: AgentAuthBag;
}): Promise<
  | { ok: true; actor: GuestBookingActor }
  | { ok: false; errorCode: string; workspaceId: string | null }
> {
  const attrs = input.auth?.attributes;
  const rateLimited = authAttr(attrs, "agentRateLimited") === "1";
  const cookieVisitorId = authAttr(attrs, "visitorId");
  const headerChatSessionId = authAttr(attrs, "chatSessionId");
  const slug = authAttr(attrs, "workspaceSlug");

  let workspaceId: string | null = null;
  try {
    workspaceId = await resolveWorkspaceIdFromAgentContext({
      sessionId: input.sessionId,
      auth: input.auth,
    });
  } catch {
    return {
      ok: false,
      errorCode: APP_ERROR_CODE.WORKSPACE_RESOLVE_FAILED,
      workspaceId: null,
    };
  }

  const supabase = createAdminClient();
  let chatSessionId: string | null = headerChatSessionId;
  let sessionVisitorId: string | null = null;
  let sessionWorkspaceId: string | null = null;
  let userId: string | null = null;
  let eveSessionId: string | null = input.sessionId?.trim() || null;

  if (chatSessionId) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, visitor_id, workspace_id, user_id, eve_session_id")
      .eq("id", chatSessionId)
      .maybeSingle();
    if (data) {
      sessionVisitorId = (data.visitor_id as string | null) ?? null;
      sessionWorkspaceId = (data.workspace_id as string | null) ?? null;
      userId = (data.user_id as string | null) ?? null;
      if (data.eve_session_id) eveSessionId = data.eve_session_id as string;
    } else {
      chatSessionId = null;
    }
  }

  if (!chatSessionId && eveSessionId) {
    const { data } = await supabase
      .from("chat_sessions")
      .select("id, visitor_id, workspace_id, user_id, eve_session_id")
      .eq("eve_session_id", eveSessionId)
      .limit(1)
      .maybeSingle();
    if (data) {
      chatSessionId = data.id as string;
      sessionVisitorId = (data.visitor_id as string | null) ?? null;
      sessionWorkspaceId = (data.workspace_id as string | null) ?? null;
      userId = (data.user_id as string | null) ?? null;
    }
  }

  // S1: when a chat session is resolved, require cookie visitor === session.visitor_id
  // (both non-null). Missing cookie or null session visitor → refuse (no A1 via header).
  if (chatSessionId) {
    if (
      !cookieVisitorId ||
      !sessionVisitorId ||
      cookieVisitorId !== sessionVisitorId
    ) {
      return {
        ok: false,
        errorCode: APP_ERROR_CODE.BOOKING_SESSION_MISMATCH,
        workspaceId,
      };
    }
  }

  // Never trust session.visitor_id alone — cookie is source of truth for claims.
  const visitorId = cookieVisitorId;

  // S1: slug hint must match chat session workspace
  if (slug && sessionWorkspaceId) {
    const fromSlug = await resolveWorkspaceIdBySlug(slug);
    if (fromSlug && fromSlug !== sessionWorkspaceId) {
      return {
        ok: false,
        errorCode: APP_ERROR_CODE.BOOKING_SESSION_MISMATCH,
        workspaceId,
      };
    }
  }

  if (sessionWorkspaceId && sessionWorkspaceId !== workspaceId) {
    workspaceId = sessionWorkspaceId;
  }

  let profileEmail: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();
    profileEmail = profile?.email
      ? normalizeEmail(String(profile.email))
      : null;
  }

  return {
    ok: true,
    actor: {
      workspaceId,
      chatSessionId,
      visitorId,
      eveSessionId,
      profileEmail,
      rateLimited,
    },
  };
}

async function loadVerifiedBookingIds(input: {
  workspaceId: string;
  chatSessionId: string | null;
}): Promise<Set<string>> {
  const out = new Set<string>();
  if (!input.chatSessionId) return out;
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("booking_verifications")
    .select("booking_id, verified_until")
    .eq("workspace_id", input.workspaceId)
    .eq("chat_session_id", input.chatSessionId)
    .not("verified_until", "is", null)
    .gt("verified_until", nowIso);
  for (const row of data ?? []) {
    if (row.booking_id) out.add(row.booking_id as string);
  }
  return out;
}

/**
 * Bookings this actor may list / change without further proof (A1 + verified B/C)
 * plus A2 candidates (same visitor, other sessions) marked for phone last4.
 */
export async function findClaimableBookings(
  actor: GuestBookingActor,
): Promise<{
  auto: OwnedBookingRow[];
  needsPhoneLast4: OwnedBookingRow[];
}> {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const verifiedIds = await loadVerifiedBookingIds({
    workspaceId: actor.workspaceId,
    chatSessionId: actor.chatSessionId,
  });

  const auto: OwnedBookingRow[] = [];
  const needsPhoneLast4: OwnedBookingRow[] = [];
  const seen = new Set<string>();

  const push = (
    row: Omit<OwnedBookingRow, "claimTier"> & { claimTier: OwnedBookingRow["claimTier"] },
    bucket: "auto" | "phone",
  ) => {
    if (!activeBooking(row) || seen.has(row.id)) return;
    if (Date.parse(row.start_time) < Date.parse(nowIso)) return;
    seen.add(row.id);
    if (bucket === "auto") auto.push(row);
    else needsPhoneLast4.push(row);
  };

  // A1: same chat session (actor already visitor-bound in resolveGuestBookingActor)
  if (actor.chatSessionId && actor.visitorId) {
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("workspace_id", actor.workspaceId)
      .eq("chat_session_id", actor.chatSessionId)
      .gte("start_time", nowIso)
      .limit(30);
    for (const raw of data ?? []) {
      push({ ...(raw as OwnedBookingRow), claimTier: "A1" }, "auto");
    }
  }

  // A1 via eve session_id — only when booking.visitor_id matches cookie visitor
  if (actor.eveSessionId && actor.visitorId) {
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("workspace_id", actor.workspaceId)
      .eq("session_id", actor.eveSessionId)
      .eq("visitor_id", actor.visitorId)
      .gte("start_time", nowIso)
      .limit(30);
    for (const raw of data ?? []) {
      push({ ...(raw as OwnedBookingRow), claimTier: "A1" }, "auto");
    }
  }

  // Verified B/C
  if (verifiedIds.size > 0) {
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("workspace_id", actor.workspaceId)
      .in("id", [...verifiedIds])
      .gte("start_time", nowIso);
    for (const raw of data ?? []) {
      push({ ...(raw as OwnedBookingRow), claimTier: "B" }, "auto");
    }
  }

  // A+: profile email
  if (actor.profileEmail) {
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("workspace_id", actor.workspaceId)
      // Escaped: an ordinary underscore in the profile email would otherwise
      // act as a wildcard and auto-claim (tier A+) a stranger's booking.
      .ilike("guest_email", escapeLikePattern(actor.profileEmail))
      .gte("start_time", nowIso)
      .limit(30);
    for (const raw of data ?? []) {
      push({ ...(raw as OwnedBookingRow), claimTier: "A+" }, "auto");
    }
  }

  // A2: same visitor, other sessions — needs phone last4 unless already auto
  if (actor.visitorId) {
    const { data } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("workspace_id", actor.workspaceId)
      .eq("visitor_id", actor.visitorId)
      .gte("start_time", nowIso)
      .limit(30);
    for (const raw of data ?? []) {
      const row = raw as OwnedBookingRow;
      if (seen.has(row.id)) continue;
      const sameSession =
        (actor.chatSessionId && row.chat_session_id === actor.chatSessionId) ||
        (actor.eveSessionId && row.session_id === actor.eveSessionId);
      if (sameSession) {
        push({ ...row, claimTier: "A1" }, "auto");
      } else {
        push({ ...row, claimTier: "A2" }, "phone");
      }
    }
  }

  auto.sort((a, b) => a.start_time.localeCompare(b.start_time));
  needsPhoneLast4.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { auto, needsPhoneLast4 };
}

export async function resolveOwnedBooking(input: {
  actor: GuestBookingActor;
  bookingUid?: string | null;
  start?: string | null;
  /** When true, include A2 (needs phone) as candidates only, not auto-pick. */
  includeA2Candidates?: boolean;
}): Promise<
  | { ok: true; booking: OwnedBookingRow }
  | { ok: false; errorCode: string; candidates?: OwnedBookingRow[] }
> {
  const { auto, needsPhoneLast4 } = await findClaimableBookings(input.actor);
  const pool = input.includeA2Candidates
    ? [...auto, ...needsPhoneLast4]
    : auto;

  if (pool.length === 0) {
    return { ok: false, errorCode: APP_ERROR_CODE.BOOKING_NOT_CLAIMABLE };
  }

  const uid = input.bookingUid?.trim() || null;
  const startHint = input.start?.trim() || null;

  let matched = pool;
  if (uid) {
    matched = pool.filter((b) => b.cal_booking_uid === uid);
  } else if (startHint) {
    const targetMs = Date.parse(startHint);
    matched = pool.filter((b) => {
      if (b.start_time === startHint) return true;
      const ms = Date.parse(b.start_time);
      return (
        !Number.isNaN(targetMs) && !Number.isNaN(ms) && ms === targetMs
      );
    });
  }

  if (matched.length === 0) {
    return {
      ok: false,
      errorCode: APP_ERROR_CODE.BOOKING_NOT_CLAIMABLE,
      candidates: pool,
    };
  }

  // Prefer auto-claimable over A2
  const autoMatch = matched.filter((m) => m.claimTier !== "A2");
  const pickFrom = autoMatch.length > 0 ? autoMatch : matched;

  if (pickFrom.length > 1) {
    return {
      ok: false,
      errorCode: APP_ERROR_CODE.INVALID_INPUT,
      candidates: pickFrom,
    };
  }

  const booking = pickFrom[0]!;
  if (booking.claimTier === "A2") {
    return {
      ok: false,
      errorCode: APP_ERROR_CODE.BOOKING_VERIFY_REQUIRED,
      candidates: [booking],
    };
  }

  return { ok: true, booking };
}

export async function getWorkspaceGuestPolicy(
  workspaceId: string,
): Promise<WorkspaceGuestPolicy> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("workspaces")
    .select(
      "guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  return {
    guestCancelEnabled: data?.guest_cancel_enabled !== false,
    guestRescheduleEnabled: data?.guest_reschedule_enabled !== false,
    guestChangeCutoffMinutes:
      typeof data?.guest_change_cutoff_minutes === "number"
        ? data.guest_change_cutoff_minutes
        : 120,
    // Compare against the canonical Pilot id (env-overridable), not a
    // user-editable slug — workspaces.slug can be renamed from Settings.
    isPilot: workspaceId === getPilotWorkspaceId(),
  };
}

export function assertBookingChangeAllowed(
  policy: WorkspaceGuestPolicy,
  booking: OwnedBookingRow,
  action: "cancel" | "reschedule",
): { ok: true } | { ok: false; errorCode: string } {
  if (policy.isPilot) {
    return { ok: false, errorCode: APP_ERROR_CODE.BOOKING_CHANGE_DISABLED };
  }
  if (action === "cancel" && !policy.guestCancelEnabled) {
    return { ok: false, errorCode: APP_ERROR_CODE.BOOKING_CHANGE_DISABLED };
  }
  if (action === "reschedule" && !policy.guestRescheduleEnabled) {
    return { ok: false, errorCode: APP_ERROR_CODE.BOOKING_CHANGE_DISABLED };
  }
  const startMs = Date.parse(booking.start_time);
  const cutoffMs = policy.guestChangeCutoffMinutes * 60 * 1000;
  if (!Number.isNaN(startMs) && startMs - Date.now() < cutoffMs) {
    return { ok: false, errorCode: APP_ERROR_CODE.BOOKING_CHANGE_CUTOFF };
  }
  return { ok: true };
}

export function summarizeBookingCandidates(
  rows: OwnedBookingRow[],
  opts?: {
    businessTimeZone?: string;
    fallbackGuestTimeZone?: string | null;
    /** Onsite: never surface stored bookings.guest_timezone (may be stale/wrong). */
    ignoreStoredGuestTz?: boolean;
  },
) {
  const businessTz = opts?.businessTimeZone;
  return rows.map((row) => {
    const storedGuestTz = opts?.ignoreStoredGuestTz
      ? null
      : row.guest_timezone;
    const base = {
      bookingUid: row.cal_booking_uid,
      start: row.start_time,
      guestName: row.guest_name,
      service: row.service,
      claimTier: row.claimTier,
      guestTimeZone: storedGuestTz,
    };
    if (!businessTz) return base;
    const display = formatSlotForGuest(
      row.start_time,
      storedGuestTz ?? opts?.fallbackGuestTimeZone ?? null,
      businessTz,
    );
    return { ...base, display: display.combined };
  });
}

export function toolError(errorCode: string): {
  ok: false;
  error: string;
  errorCode: string;
} {
  const known = Object.values(APP_ERROR_CODE) as string[];
  const code = known.includes(errorCode)
    ? (errorCode as import("@/lib/errors").AppErrorCode)
    : APP_ERROR_CODE.INVALID_INPUT;
  return {
    ok: false,
    error: appErrorMessage(code),
    errorCode: code,
  };
}

export async function markBookingVerified(input: {
  workspaceId: string;
  chatSessionId: string;
  bookingId: string;
  channel: "manage_code" | "email_otp" | "phone_last4" | "manage_link";
  codeHash: string;
  destination?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const now = Date.now();
  const { error } = await supabase.from("booking_verifications").insert({
    workspace_id: input.workspaceId,
    chat_session_id: input.chatSessionId,
    booking_id: input.bookingId,
    channel: input.channel,
    destination: input.destination ?? null,
    code_hash: input.codeHash,
    attempts: 0,
    expires_at: new Date(now + VERIFIED_UNTIL_MS).toISOString(),
    consumed_at: new Date(now).toISOString(),
    verified_until: new Date(now + VERIFIED_UNTIL_MS).toISOString(),
  });

  // This row *is* the proof of ownership. Silently losing it means the guest
  // passes verification and is then asked to verify all over again.
  if (error) throw new Error(error.message);
}

/** Clear verified_until for a chat session (forget visitor). */
export async function clearSessionVerifications(
  chatSessionId: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("booking_verifications")
    .update({ verified_until: new Date().toISOString() })
    .eq("chat_session_id", chatSessionId)
    .not("verified_until", "is", null);

  // "Forget me" must not report success while the session keeps its claims.
  if (error) throw new Error(error.message);
}
