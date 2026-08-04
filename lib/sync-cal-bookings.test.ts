/**
 * Tenant scoping in upsertCalBookings.
 * Supabase is mocked globally via tests/setup.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { upsertCalBookings } from "./sync-cal-bookings";
import type { CalBookingListItem } from "./calcom";

// Keep the rest of the module — other importers need createNotificationDebounced.
vi.mock("@/lib/notifications-write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications-write")>()),
  createNotification: vi.fn().mockResolvedValue(null),
}));

const WS_A = "aaaaaaaa-0000-4000-8000-000000000001";
const WS_B = "bbbbbbbb-0000-4000-8000-000000000002";
const SHARED_UID = "shared-cal-uid";

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

function calItem(overrides?: Partial<CalBookingListItem>): CalBookingListItem {
  return {
    uid: SHARED_UID,
    start: FUTURE,
    status: "accepted",
    listStatus: "upcoming",
    title: "Consultation",
    attendeeName: "Guest B",
    attendeeEmail: "b@example.com",
    raw: {},
    ...overrides,
  };
}

/** Workspace A already owns a booking carrying guest credentials. */
function seedWorkspaceABooking() {
  supabaseMock.seed("bookings", [
    {
      id: "booking-a",
      workspace_id: WS_A,
      cal_booking_uid: SHARED_UID,
      status: "accepted",
      list_status: "upcoming",
      start_time: FUTURE,
      guest_name: "Guest A",
      guest_email: "a@example.com",
      manage_code_hash: "hash-belonging-to-A",
      visitor_id: "visitor-A",
      chat_session_id: "session-A",
      session_id: "eve-A",
      guest_timezone: "Asia/Ho_Chi_Minh",
      cancelled_by: null,
    },
  ]);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("upsertCalBookings — tenant scoping", () => {
  it("does not adopt another workspace's row for the same Cal.com uid", async () => {
    seedWorkspaceABooking();

    // Both tenants connected the same Cal.com account, so the same uid shows
    // up in workspace B's sync.
    await upsertCalBookings([calItem()], WS_B);

    const rows = supabaseMock.getRows("bookings");
    const a = rows.find((r) => r.id === "booking-a");

    // Workspace A must be untouched — this row used to be taken over, carrying
    // A's manage_code_hash to whichever tenant synced last.
    expect(a?.workspace_id).toBe(WS_A);
    expect(a?.manage_code_hash).toBe("hash-belonging-to-A");
    expect(a?.guest_email).toBe("a@example.com");
  });

  it("never copies guest credentials across workspaces", async () => {
    seedWorkspaceABooking();

    await upsertCalBookings([calItem()], WS_B);

    const upserted = supabaseMock
      .insertsFor("bookings")
      .find((r) => r.workspace_id === WS_B);

    expect(upserted).toBeTruthy();
    // The `prev` lookup is workspace-scoped, so B starts clean.
    expect(upserted?.manage_code_hash).toBeNull();
    expect(upserted?.visitor_id).toBeNull();
    expect(upserted?.chat_session_id).toBeNull();
    expect(upserted?.guest_timezone).toBeNull();
  });

  it("still carries its own workspace's credentials forward", async () => {
    seedWorkspaceABooking();

    await upsertCalBookings([calItem({ attendeeName: "Guest A" })], WS_A);

    const upserted = supabaseMock
      .insertsFor("bookings")
      .find((r) => r.workspace_id === WS_A);

    expect(upserted?.manage_code_hash).toBe("hash-belonging-to-A");
    expect(upserted?.visitor_id).toBe("visitor-A");
    expect(upserted?.chat_session_id).toBe("session-A");
  });

  it("preserves created_by_staff_id across a Cal.com sync", async () => {
    supabaseMock.seed("bookings", [
      {
        id: "booking-manual",
        workspace_id: WS_A,
        cal_booking_uid: SHARED_UID,
        status: "accepted",
        list_status: "upcoming",
        start_time: FUTURE,
        guest_name: "Guest A",
        guest_email: "a@example.com",
        created_by_staff_id: "staff-1",
        cancelled_by: null,
      },
    ]);

    await upsertCalBookings([calItem({ attendeeName: "Guest A" })], WS_A);

    const upserted = supabaseMock
      .insertsFor("bookings")
      .find((r) => r.workspace_id === WS_A);

    expect(upserted?.created_by_staff_id).toBe("staff-1");
  });
});
