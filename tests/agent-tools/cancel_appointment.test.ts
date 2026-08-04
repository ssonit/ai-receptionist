/**
 * cancel_appointment tool integration tests.
 * Mocks: eve/tools, calcom (cancelCalBooking), agent-booking-auth,
 * agent-tool-log, notifications-write.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../helpers/supabase-mock";

vi.mock("eve/tools", () => ({
  defineTool: (t: unknown) => t,
}));

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    cancelCalBooking: vi.fn(),
  };
});

vi.mock("@/lib/agent-booking-auth", () => ({
  resolveGuestBookingActor: vi.fn(),
  findClaimableBookings: vi.fn(),
  resolveOwnedBooking: vi.fn(),
  assertBookingChangeAllowed: vi.fn(),
  getWorkspaceGuestPolicy: vi.fn(),
  summarizeBookingCandidates: vi.fn(),
  toolError: vi.fn(),
}));

vi.mock("@/lib/agent-tool-log", () => ({
  logAgentToolEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

const PILOT_ID = "00000000-0000-4000-8000-000000000001";

const mockBooking = {
  id: "booking-1",
  workspace_id: PILOT_ID,
  cal_booking_uid: "cal_uid_1",
  guest_name: "Nguyen Van A",
  guest_email: "a@example.com",
  guest_phone: "+84123456789",
  service: "Khám răng",
  start_time: "2026-08-05T09:00:00.000Z",
  status: "accepted",
  list_status: "upcoming",
  visitor_id: "vis-1",
  chat_session_id: "cs-1",
  session_id: "test-session",
  manage_code_hash: "abc123",
  guest_timezone: null,
  claimTier: "A1" as const,
};

type ToolResult =
  | { ok: true; booking: Record<string, unknown> }
  | { ok: false; error: string };

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("cancel_appointment tool", () => {
  it("cancels a claimable booking on happy path", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-1",
        visitorId: "vis-1",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.findClaimableBookings).mockResolvedValue({
      auto: [mockBooking],
      needsPhoneLast4: [],
    });
    vi.mocked(authMod.resolveOwnedBooking).mockResolvedValue({
      ok: true,
      booking: mockBooking,
    });
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({ ok: true });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.cancelCalBooking).mockResolvedValue({
      uid: "cal_uid_1",
      start: "2026-08-05T09:00:00.000Z",
      status: "cancelled",
      raw: { id: 1 },
    });

    // Seed bookings table so the update has a target
    supabaseMock.seed("bookings", [mockBooking]);

    const tool = (await import("../../agent/tools/cancel_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      { bookingUid: "cal_uid_1", reason: "Bận đột xuất" },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_1");
      expect(result.booking.status).toBe("cancelled");
    }
  });

  it("returns error when resolveGuestBookingActor fails", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: false,
      errorCode: "WORKSPACE_RESOLVE_FAILED",
      workspaceId: null,
    });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    const tool = (await import("../../agent/tools/cancel_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      { bookingUid: "cal_uid_1" },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
  });

  it("returns error when booking change not allowed (cutoff)", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-1",
        visitorId: "vis-1",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.findClaimableBookings).mockResolvedValue({
      auto: [mockBooking],
      needsPhoneLast4: [],
    });
    vi.mocked(authMod.resolveOwnedBooking).mockResolvedValue({
      ok: true,
      booking: mockBooking,
    });
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({
      ok: false,
      errorCode: "BOOKING_CHANGE_CUTOFF",
    });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    const tool = (await import("../../agent/tools/cancel_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      { bookingUid: "cal_uid_1" },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("BOOKING_CHANGE_CUTOFF");
    }
  });

  it("returns error when cal key is missing", async () => {
    const nonPilotId = "cccccccc-cccc-4000-8000-cccccccccccc";
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: nonPilotId,
        chatSessionId: "cs-1",
        visitorId: "vis-1",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.findClaimableBookings).mockResolvedValue({
      auto: [{ ...mockBooking }],
      needsPhoneLast4: [],
    });
    vi.mocked(authMod.resolveOwnedBooking).mockResolvedValue({
      ok: true,
      booking: { ...mockBooking },
    });
    vi.mocked(authMod.getWorkspaceGuestPolicy).mockResolvedValue({
      guestCancelEnabled: true,
      guestRescheduleEnabled: true,
      guestChangeCutoffMinutes: 120,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({ ok: true });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    // Non-pilot workspace without cal_api_key_encrypted → getCalApiKeyForWorkspace will throw
    supabaseMock.seed("workspaces", [
      {
        id: nonPilotId,
        name: "NoKey",
        slug: "nokey",
        timezone: "Asia/Ho_Chi_Minh",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);

    const tool = (await import("../../agent/tools/cancel_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      { bookingUid: "cal_uid_1" },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("cal_not_configured");
    }
  });
});
