/**
 * createWorkspaceBooking unit tests. Supabase is mocked globally via
 * tests/setup.ts. Cal.com's createBooking is mocked here — this is the
 * layer below withCalApiKey, so no API key handling to fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock, QueryBuilder } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    createBooking: vi.fn(),
  };
});
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/analytics-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads", () => ({
  upsertLeadAsBooked: vi.fn().mockResolvedValue(undefined),
}));

const WS = "00000000-0000-4000-8000-000000000001";
const SLOT = "2026-08-05T09:00:00.000Z";

function baseInput(overrides?: Record<string, unknown>) {
  return {
    workspaceId: WS,
    eventRef: { eventTypeId: 123, eventTypeSlug: "consultation-30", username: "biz" },
    eventTitle: "Consultation",
    start: SLOT,
    guestName: "Nguyen Van A",
    phone: "+84123456789",
    email: "a@example.com",
    timeZone: "Asia/Ho_Chi_Minh",
    source: "chat" as const,
    ...overrides,
  };
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("createWorkspaceBooking", () => {
  it("creates the booking and mirrors it with source: chat leaving created_by_staff_id null", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_1",
      start: SLOT,
      status: "confirmed",
      meetingUrl: "https://cal.com/meeting/cal_uid_1",
      raw: { id: 1 },
    });

    const { createWorkspaceBooking } = await import("./booking-create");
    const result = await createWorkspaceBooking(baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_1");
      expect(result.manageCode.length).toBeGreaterThanOrEqual(6);
    }

    const inserts = supabaseMock.insertsFor("bookings");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      workspace_id: WS,
      cal_booking_uid: "cal_uid_1",
      guest_name: "Nguyen Van A",
      created_by_staff_id: null,
    });
  });

  it("sets created_by_staff_id when source is staff", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_2",
      start: SLOT,
      status: "confirmed",
      meetingUrl: undefined,
      raw: {},
    });

    const { createWorkspaceBooking } = await import("./booking-create");
    await createWorkspaceBooking(
      baseInput({ source: "staff", staffUserId: "staff-42" }),
    );

    const inserts = supabaseMock.insertsFor("bookings");
    expect(inserts[0]).toMatchObject({ created_by_staff_id: "staff-42" });
  });

  it("returns ok:true with a warning when Cal.com succeeds but the Supabase mirror fails", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_3",
      start: SLOT,
      status: "confirmed",
      meetingUrl: undefined,
      raw: {},
    });

    vi.spyOn(QueryBuilder.prototype, "upsert").mockRejectedValueOnce(
      new Error("DB connection lost"),
    );

    const { createWorkspaceBooking } = await import("./booking-create");
    const result = await createWorkspaceBooking(baseInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_3");
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("mirror");
    }
  });
});
