// app/api/cal/webhook/route.test.ts
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../../tests/helpers/supabase-mock";
import { POST } from "./route";

vi.mock("@/lib/analytics-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notification-digests", () => ({
  ensureDigestNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
// getWebhookSecretForWorkspace decrypts a real column — stub it directly so
// the fixture secret below doesn't need real AES-GCM ciphertext.
// Literal inside factory avoids vi.mock hoist referencing SECRET before init.
vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace")>();
  return {
    ...actual,
    getWebhookSecretForWorkspace: vi
      .fn()
      .mockResolvedValue("test-webhook-secret"),
  };
});

const WS_ID = "33333333-3333-4333-8333-333333333333";
const SECRET = "test-webhook-secret";
const BOOKING_UID = "cal_uid_dup_1";

function signedRequest(body: string, secret: string): NextRequest {
  const sig = createHmac("sha256", secret).update(body).digest("hex");
  return new NextRequest(
    `http://localhost/api/cal/webhook?workspace_id=${WS_ID}`,
    {
      method: "POST",
      headers: { "x-cal-signature-256": sig },
      body,
    },
  );
}

function cancelledPayload() {
  return JSON.stringify({
    triggerEvent: "BOOKING_CANCELLED",
    payload: {
      uid: BOOKING_UID,
      startTime: "2026-08-10T09:00:00.000Z",
      status: "CANCELLED",
      attendees: [{ name: "Guest", email: "guest@example.com" }],
    },
  });
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  supabaseMock.seed("workspaces", [
    { id: WS_ID, webhook_secret_encrypted: "irrelevant-mocked-decrypt" },
  ]);
  supabaseMock.seed("bookings", [
    {
      id: "booking-row-1",
      workspace_id: WS_ID,
      cal_booking_uid: BOOKING_UID,
      status: "confirmed",
      start_time: "2026-08-10T09:00:00.000Z",
      guest_name: "Guest",
      guest_email: "guest@example.com",
    },
  ]);
});

describe("POST /api/cal/webhook — idempotent analytics", () => {
  it("fires BOOKING_CANCELLED_BY_GUEST exactly once across two identical deliveries", async () => {
    const analytics = await import("@/lib/analytics-server");
    const body = cancelledPayload();

    await POST(signedRequest(body, SECRET));
    await POST(signedRequest(body, SECRET));

    const cancelCalls = vi
      .mocked(analytics.trackServer)
      .mock.calls.filter(([event]) => event === "booking_cancelled_by_guest");
    expect(cancelCalls.length).toBe(1);
  });
});
