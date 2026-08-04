/**
 * The single place that turns a confirmed Cal.com slot into a real booking:
 * calls Cal.com, mirrors the row into Supabase, upserts the matching lead,
 * notifies the workspace, and tracks analytics. `agent/tools/book_appointment.ts`
 * (the AI agent) and the dashboard's manual-booking action both call this
 * instead of duplicating the sequence.
 *
 * Caller must already be inside `withCalApiKey(apiKey, () => ...)` — this
 * function does not touch the API key itself.
 */
import { createBooking, type CreateBookingResult } from "@/lib/calcom";
import {
  generateManageCode,
  hashBookingCode,
} from "@/lib/booking-manage-code";
import { normalizeCalApiStatus } from "@/lib/booking-status";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { upsertLeadAsBooked } from "@/lib/leads";
import { createNotification } from "@/lib/notifications-write";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";

export type CreateWorkspaceBookingInput = {
  workspaceId: string;
  eventRef: { eventTypeId?: number; eventTypeSlug: string; username: string };
  eventTitle: string;
  /** ISO start time — caller has already confirmed it is still open. */
  start: string;
  guestName: string;
  phone: string;
  email: string;
  timeZone: string;
  locale?: string;
  notes?: string;
  service?: string;
  sessionId?: string | null;
  visitorId?: string | null;
  chatSessionId?: string | null;
  guestTimeZone?: string | null;
  source: "chat" | "staff";
  /** Required when source === "staff"; ignored otherwise. */
  staffUserId?: string | null;
};

export type CreateWorkspaceBookingResult =
  | {
      ok: true;
      booking: {
        uid: string;
        start: string;
        status: string;
        meetingUrl: string | null;
        display: string;
      };
      manageCode: string;
      warning?: string;
    }
  | { ok: false; error: string };

function buildBookingRow(
  input: CreateWorkspaceBookingInput,
  booking: CreateBookingResult,
  manageCodeHash: string,
) {
  return {
    workspace_id: input.workspaceId,
    cal_booking_uid: booking.uid,
    guest_name: input.guestName,
    guest_phone: input.phone,
    guest_email: input.email,
    service: input.service ?? input.eventTitle ?? null,
    start_time: booking.start,
    status: normalizeCalApiStatus(booking.status),
    list_status: "upcoming",
    notes: input.notes ?? null,
    session_id: input.sessionId ?? null,
    visitor_id: input.visitorId ?? null,
    chat_session_id: input.chatSessionId ?? null,
    manage_code_hash: manageCodeHash,
    guest_timezone: input.guestTimeZone ?? null,
    created_by_staff_id:
      input.source === "staff" ? (input.staffUserId ?? null) : null,
    raw: booking.raw,
  };
}

export async function createWorkspaceBooking(
  input: CreateWorkspaceBookingInput,
): Promise<CreateWorkspaceBookingResult> {
  const booking = await createBooking({
    start: input.start,
    attendeeName: input.guestName,
    attendeeEmail: input.email,
    attendeePhone: input.phone,
    timeZone: input.timeZone,
    language: input.locale,
    notes:
      [input.service, input.notes].filter(Boolean).join(" | ") || undefined,
    ...input.eventRef,
  });

  const manageCode = generateManageCode();
  const manageCodeHash = hashBookingCode(manageCode);
  const startDisplay = formatSlotForGuest(
    booking.start,
    input.guestTimeZone ?? null,
    input.timeZone,
  );
  const row = buildBookingRow(input, booking, manageCodeHash);

  try {
    const supabase = createAdminClient();
    await supabase
      .from("bookings")
      .upsert(row, { onConflict: "workspace_id,cal_booking_uid" });

    await upsertLeadAsBooked({
      workspaceId: input.workspaceId,
      fullName: input.guestName,
      phone: input.phone,
      email: input.email,
      service: input.service ?? input.eventTitle ?? null,
      notes: input.notes ?? null,
      sessionId: input.sessionId,
    });

    await createNotification({
      type: "booking_created",
      title: `New booking: ${input.guestName}`,
      body: [input.service ?? input.eventTitle, booking.start, input.phone]
        .filter(Boolean)
        .join(" · "),
      severity: "high",
      href: "/dashboard/bookings",
      entityType: "booking",
      entityId: booking.uid,
      workspaceId: input.workspaceId,
    });
    await trackServer(ANALYTICS_EVENT.BOOKING_CREATED, input.workspaceId, {
      workspaceId: input.workspaceId,
      service: input.service ?? input.eventTitle ?? null,
      source: input.source,
    });
  } catch (dbError) {
    const warning =
      dbError instanceof Error
        ? `Saved on Cal.com but failed to mirror to Supabase: ${dbError.message}`
        : "Saved on Cal.com but failed to mirror to Supabase";
    try {
      const supabase = createAdminClient();
      await supabase
        .from("bookings")
        .upsert(row, { onConflict: "workspace_id,cal_booking_uid" });
    } catch {
      // ignore second failure — still return manageCode below
    }
    await createNotification({
      type: "booking_mirror_failed",
      title: `Cal.com booking saved but not mirrored to DB`,
      body: `${input.guestName} · ${booking.start} · ${warning}`,
      severity: "medium",
      href: "/dashboard/bookings",
      entityType: "booking",
      entityId: booking.uid,
      workspaceId: input.workspaceId,
    });
    return {
      ok: true,
      booking: {
        uid: booking.uid,
        start: booking.start,
        status: booking.status,
        meetingUrl: booking.meetingUrl ?? null,
        display: startDisplay.combined,
      },
      manageCode,
      warning,
    };
  }

  return {
    ok: true,
    booking: {
      uid: booking.uid,
      start: booking.start,
      status: booking.status,
      meetingUrl: booking.meetingUrl ?? null,
      display: startDisplay.combined,
    },
    manageCode,
  };
}
