import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { upsertCalBookings, type CalWebhookPayload } from "@/lib/sync-cal-bookings";
import { getCalBookingView, normalizeCalApiStatus } from "@/lib/booking-status";
import type { CalBookingListItem } from "@/lib/calcom";
import { getCalApiKeyForWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/** Cal.com sends these trigger events — @see https://cal.com/docs/webhooks */
const RELEVANT_EVENTS = new Set([
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
  "BOOKING_REQUESTED",
  "BOOKING_NO_SHOW",
]);

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Convert a Cal.com webhook payload into a CalBookingListItem for upsert. */
function webhookToBookingItem(event: CalWebhookPayload): CalBookingListItem | null {
  const p = event.payload;
  if (!p.uid) return null;

  const attendee = p.attendees?.[0];
  const rawStatus = normalizeCalApiStatus(p.status ?? "ACCEPTED");
  const start = p.startTime ?? "";

  return {
    uid: p.uid,
    start,
    end: p.endTime,
    status: rawStatus,
    listStatus: getCalBookingView(rawStatus, start),
    title: p.title,
    attendeeName: attendee?.name ?? "Guest",
    attendeeEmail: attendee?.email ?? "unknown@local.invalid",
    attendeePhone: attendee?.phoneNumber,
    raw: p,
  };
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id")?.trim();

  if (!workspaceId) {
    return NextResponse.json(
      { error: "missing_workspace_id" },
      { status: 400 },
    );
  }

  // Verify the workspace exists and has a Cal key configured.
  try {
    await getCalApiKeyForWorkspace(workspaceId);
  } catch {
    return NextResponse.json(
      { error: "workspace_not_found_or_no_cal_key" },
      { status: 404 },
    );
  }

  const webhookSecret = (process.env.CALCOM_WEBHOOK_SECRET ?? "").trim();
  if (webhookSecret) {
    const sig = request.headers.get("x-cal-signature-256")?.trim() ?? "";
    if (!sig) {
      return NextResponse.json(
        { error: "missing_signature" },
        { status: 401 },
      );
    }

    const rawBody = await request.text();
    if (!verifySignature(rawBody, sig, webhookSecret)) {
      return NextResponse.json(
        { error: "invalid_signature" },
        { status: 401 },
      );
    }

    let event: CalWebhookPayload;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "invalid_json" },
        { status: 400 },
      );
    }

    if (!RELEVANT_EVENTS.has(event.triggerEvent)) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const item = webhookToBookingItem(event);
    if (!item) {
      return NextResponse.json(
        { error: "invalid_payload" },
        { status: 400 },
      );
    }

    const result = await upsertCalBookings([item], workspaceId);
    return NextResponse.json({ ok: true, ...result });
  }

  // No webhook secret configured — accept unsigned (dev/test only).
  const rawBody = await request.text();
  let event: CalWebhookPayload;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!RELEVANT_EVENTS.has(event.triggerEvent)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const item = webhookToBookingItem(event);
  if (!item) {
    return NextResponse.json(
      { error: "invalid_payload" },
      { status: 400 },
    );
  }

  const result = await upsertCalBookings([item], workspaceId);
  return NextResponse.json({ ok: true, ...result });
}
