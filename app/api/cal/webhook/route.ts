import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { upsertCalBookings, type CalWebhookPayload } from "@/lib/sync-cal-bookings";
import { getCalBookingView, normalizeCalApiStatus } from "@/lib/booking-status";
import { CAL_WEBHOOK_TRIGGER_EVENTS, type CalBookingListItem } from "@/lib/calcom";
import { getWebhookSecretForWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const RELEVANT_EVENTS = new Set<string>(CAL_WEBHOOK_TRIGGER_EVENTS);

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

async function processEvent(rawBody: string, workspaceId: string) {
  let event: CalWebhookPayload;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!RELEVANT_EVENTS.has(event.triggerEvent)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const item = webhookToBookingItem(event);
  if (!item) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await upsertCalBookings([item], workspaceId);
  return NextResponse.json({ ok: true, ...result });
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

  const secret = await getWebhookSecretForWorkspace(workspaceId);
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[webhook] No webhook secret configured for workspace ${workspaceId} — accepting unsigned payload (dev only)`,
      );
    } else {
      return NextResponse.json(
        { error: "webhook_not_configured" },
        { status: 501 },
      );
    }
  }

  const sig = request.headers.get("x-cal-signature-256")?.trim() ?? "";

  if (secret) {
    if (!sig) {
      return NextResponse.json(
        { error: "missing_signature" },
        { status: 401 },
      );
    }

    const rawBody = await request.text();
    if (!verifySignature(rawBody, sig, secret)) {
      return NextResponse.json(
        { error: "invalid_signature" },
        { status: 401 },
      );
    }

    return processEvent(rawBody, workspaceId);
  }

  // Dev-only unsigned path — never reached in production (secret is always
  // required above, and the dev fallback sets secret="" not null).
  // Keeping the block for clarity: in dev without any secret configured,
  // we process unsigned payloads with a loud console warning.
  const rawBody2 = await request.text();
  return processEvent(rawBody2, workspaceId);
}
