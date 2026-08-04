/**
 * Dashboard manual-booking actions. Workspace/staff identity is mocked via
 * getDashboardUser — never trust a client-supplied workspaceId. Supabase is
 * mocked globally via tests/setup.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../tests/helpers/supabase-mock";

const WS = "00000000-0000-4000-8000-000000000001";
const OTHER_WS = "00000000-0000-4000-8000-000000000002";
const SLOT = "2026-08-05T09:00:00.000Z";

const mocks = vi.hoisted(() => ({
  getDashboardUser: vi.fn(),
  getAvailableSlots: vi.fn(),
  createWorkspaceBooking: vi.fn(),
}));

vi.mock("@/lib/dashboard-user", () => ({
  getDashboardUser: mocks.getDashboardUser,
}));
vi.mock("@/lib/calcom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/calcom")>()),
  getAvailableSlots: mocks.getAvailableSlots,
}));
vi.mock("@/lib/booking-create", () => ({
  createWorkspaceBooking: mocks.createWorkspaceBooking,
}));

function seedMeetingType(overrides?: Record<string, unknown>) {
  supabaseMock.seed("workspace_event_types", [
    {
      id: "evt-1",
      workspace_id: WS,
      cal_event_type_id: 123,
      title: "Consultation",
      slug: "consultation-30",
      length_minutes: 30,
      minimum_notice_minutes: 60,
      is_ai_booking: false,
      ...overrides,
    },
  ]);
  supabaseMock.seed("workspaces", [
    {
      id: WS,
      name: "Acme",
      slug: "acme",
      timezone: "Asia/Ho_Chi_Minh",
      cal_username: "acme-biz",
      cal_event_type_id: null,
      cal_event_type_slug: null,
      cal_api_key_encrypted: "encrypted-key",
      service_mode: "onsite",
    },
  ]);
}

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  mocks.getDashboardUser.mockResolvedValue({
    navUser: { name: "Staff One", email: "staff@acme.test", avatar: "" },
    userId: "staff-1",
    workspaceId: WS,
    workspaceSlug: "acme",
    bookingPagePath: "/b/acme",
    role: "owner",
  });
});

describe("getAvailableSlotsAction", () => {
  it("returns slots for a meeting type in the caller's workspace", async () => {
    seedMeetingType();
    mocks.getAvailableSlots.mockResolvedValue([{ start: SLOT }]);

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2026-08-05",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.slots).toHaveLength(1);
      expect(result.slots[0]?.start).toBe(SLOT);
    }
  });

  it("refuses a meeting type id from another workspace", async () => {
    seedMeetingType({ workspace_id: OTHER_WS });

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2026-08-05",
    });

    expect(result.ok).toBe(false);
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });

  it("rejects a past date without calling Cal.com", async () => {
    seedMeetingType();

    const { getAvailableSlotsAction } = await import("./actions");
    const result = await getAvailableSlotsAction({
      meetingTypeId: "evt-1",
      date: "2020-01-01",
    });

    expect(result.ok).toBe(false);
    expect(mocks.getAvailableSlots).not.toHaveBeenCalled();
  });
});

describe("createManualBookingAction", () => {
  it("creates a booking with source: staff and the caller's staffUserId", async () => {
    seedMeetingType();
    mocks.createWorkspaceBooking.mockResolvedValue({
      ok: true,
      booking: { uid: "cal_uid_9", start: SLOT, status: "confirmed", meetingUrl: null, display: SLOT },
      manageCode: "ABC123",
    });

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Nguyen Van A",
      phone: "+84123456789",
      email: "a@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bookingUid).toBe("cal_uid_9");
    expect(mocks.createWorkspaceBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        source: "staff",
        staffUserId: "staff-1",
        guestName: "Nguyen Van A",
      }),
    );
  });

  it("rejects a meeting type id from another workspace without calling Cal.com", async () => {
    seedMeetingType({ workspace_id: OTHER_WS });

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Test",
      phone: "+84123456789",
      email: "test@example.com",
    });

    expect(result.ok).toBe(false);
    expect(mocks.createWorkspaceBooking).not.toHaveBeenCalled();
  });

  it("wraps a Cal.com failure in the generic error code, not the raw message", async () => {
    seedMeetingType();
    mocks.createWorkspaceBooking.mockRejectedValue(
      new Error("Cal.com says: no_available_users_found_error"),
    );

    const { createManualBookingAction } = await import("./actions");
    const result = await createManualBookingAction({
      meetingTypeId: "evt-1",
      start: SLOT,
      guestName: "Test",
      phone: "+84123456789",
      email: "test@example.com",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).not.toContain("no_available_users_found_error");
    }
  });
});
