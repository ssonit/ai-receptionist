/**
 * cancelWorkspaceBooking unit tests. Supabase is mocked globally via
 * tests/setup.ts. Cal.com's cancelCalBooking is mocked here — this is the
 * layer below withCalApiKey, so no API key handling to fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryBuilder, supabaseMock } from "../tests/helpers/supabase-mock";

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    cancelCalBooking: vi.fn(),
  };
});

const BOOKING_ID = "booking-1";
const CAL_UID = "cal_uid_1";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  supabaseMock.seed("bookings", [
    {
      id: BOOKING_ID,
      workspace_id: "ws-1",
      cal_booking_uid: CAL_UID,
      status: "accepted",
      list_status: "upcoming",
    },
  ]);
});

describe("cancelWorkspaceBooking", () => {
  it("cancels on Cal.com and mirrors the status with the given cancelledBy", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockResolvedValue({
      uid: CAL_UID,
      start: "2026-08-05T09:00:00.000Z",
      status: "cancelled",
      raw: { id: 1 },
    });

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    const result = await cancelWorkspaceBooking({
      bookingId: BOOKING_ID,
      calBookingUid: CAL_UID,
      reason: "Guest asked to reschedule",
      cancelledBy: "owner",
    });

    expect(result).toEqual({ status: "cancelled" });
    expect(calcom.cancelCalBooking).toHaveBeenCalledWith({
      bookingUid: CAL_UID,
      cancellationReason: "Guest asked to reschedule",
    });

    const row = supabaseMock.getRows("bookings").find((r) => r.id === BOOKING_ID);
    expect(row?.status).toBe("cancelled");
    expect(row?.list_status).toBe("cancelled");
    expect(row?.cancelled_by).toBe("owner");
  });

  it("propagates a Cal.com failure instead of swallowing it", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockRejectedValue(
      new Error("Cal.com: booking already cancelled"),
    );

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    await expect(
      cancelWorkspaceBooking({
        bookingId: BOOKING_ID,
        calBookingUid: CAL_UID,
        cancelledBy: "owner",
      }),
    ).rejects.toThrow("already cancelled");

    // Cal.com never confirmed the cancel, so the mirror must not change.
    const row = supabaseMock.getRows("bookings").find((r) => r.id === BOOKING_ID);
    expect(row?.status).toBe("accepted");
  });

  it("still resolves when the Supabase mirror update fails", async () => {
    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockResolvedValue({
      uid: CAL_UID,
      start: "2026-08-05T09:00:00.000Z",
      status: "cancelled",
      raw: {},
    });

    vi.spyOn(QueryBuilder.prototype, "update").mockImplementationOnce(() => {
      throw new Error("DB connection lost");
    });

    const { cancelWorkspaceBooking } = await import("./booking-cancel");
    const result = await cancelWorkspaceBooking({
      bookingId: BOOKING_ID,
      calBookingUid: CAL_UID,
      cancelledBy: "guest",
    });

    // Cal.com already cancelled — a mirror hiccup is not this caller's failure.
    expect(result).toEqual({ status: "cancelled" });
  });
});
