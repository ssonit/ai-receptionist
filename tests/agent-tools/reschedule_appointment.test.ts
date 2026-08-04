/**
 * reschedule_appointment tool integration tests.
 * Mocks: eve/tools, calcom (getAvailableSlots + rescheduleCalBooking),
 * agent-booking-auth, guest-timezone-resolve, agent-tool-log, notifications-write.
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
    getAvailableSlots: vi.fn(),
    rescheduleCalBooking: vi.fn(),
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

vi.mock("@/lib/guest-timezone-resolve", () => ({
  resolveGuestTimeZone: vi.fn(),
}));

vi.mock("@/lib/agent-tool-log", () => ({
  logAgentToolEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const OLD_SLOT = "2026-08-05T09:00:00.000Z";
const NEW_SLOT = "2026-08-06T14:00:00.000Z";

const mockBooking = {
  id: "booking-2",
  workspace_id: PILOT_ID,
  cal_booking_uid: "cal_uid_2",
  guest_name: "Nguyen Van B",
  guest_email: "b@example.com",
  guest_phone: "+84987654321",
  service: "Tư vấn",
  start_time: OLD_SLOT,
  status: "accepted",
  list_status: "upcoming",
  visitor_id: "vis-2",
  chat_session_id: "cs-2",
  session_id: "test-session",
  manage_code_hash: "def456",
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

describe("reschedule_appointment tool", () => {
  it("reschedules to new slot on happy path", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-2",
        visitorId: "vis-2",
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
      guestEmailRequired: true,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({ ok: true });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    // Seed workspace + AI event type for getAiBookingEventType
    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
      },
    ]);
    supabaseMock.seed("bookings", [mockBooking]);

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: NEW_SLOT },
    ]);
    vi.mocked(calcom.rescheduleCalBooking).mockResolvedValue({
      uid: "cal_uid_2",
      start: NEW_SLOT,
      status: "confirmed",
      meetingUrl: "https://cal.com/meeting/cal_uid_2",
      raw: { id: 2 },
    });

    const tzMod = await import("@/lib/guest-timezone-resolve");
    vi.mocked(tzMod.resolveGuestTimeZone).mockResolvedValue({
      guestTimeZone: "Asia/Ho_Chi_Minh",
      source: "session",
    });

    const tool = (await import("../../agent/tools/reschedule_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        bookingUid: "cal_uid_2",
        currentStart: OLD_SLOT,
        newStart: NEW_SLOT,
        reason: "Bận họp",
      },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.start).toBe(NEW_SLOT);
      expect(result.booking.previousUid).toBe("cal_uid_2");
    }
  });

  it("returns error when booking change not allowed (cutoff)", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-2",
        visitorId: "vis-2",
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
      guestEmailRequired: true,
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

    const tool = (await import("../../agent/tools/reschedule_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      { newStart: NEW_SLOT },
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

  it("returns error when new slot is no longer available", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-2",
        visitorId: "vis-2",
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
      guestEmailRequired: true,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({ ok: true });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
      },
    ]);

    const calcom = await import("@/lib/calcom");
    // Return different slots that don't include the requested newStart
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: "2026-08-07T09:00:00.000Z" },
    ]);

    const tool = (await import("../../agent/tools/reschedule_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        bookingUid: "cal_uid_2",
        currentStart: OLD_SLOT,
        newStart: NEW_SLOT,
      },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no longer available");
    }
  });

  it("handles UID change when Cal.com returns new booking UID", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-2",
        visitorId: "vis-2",
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
      guestEmailRequired: true,
      isPilot: false,
    });
    vi.mocked(authMod.assertBookingChangeAllowed).mockReturnValue({ ok: true });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: 123,
        cal_event_type_slug: "consultation-30",
        cal_username: "test-cal-user",
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-1",
        workspace_id: PILOT_ID,
        cal_event_type_id: 123,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
      },
    ]);
    supabaseMock.seed("bookings", [mockBooking]);

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: NEW_SLOT },
    ]);
    // Cal.com returns a NEW uid on reschedule
    vi.mocked(calcom.rescheduleCalBooking).mockResolvedValue({
      uid: "cal_uid_3", // different from old uid
      start: NEW_SLOT,
      status: "confirmed",
      raw: { id: 3 },
    });

    const tzMod = await import("@/lib/guest-timezone-resolve");
    vi.mocked(tzMod.resolveGuestTimeZone).mockResolvedValue({
      guestTimeZone: "Asia/Ho_Chi_Minh",
      source: "session",
    });

    const tool = (await import("../../agent/tools/reschedule_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        bookingUid: "cal_uid_2",
        currentStart: OLD_SLOT,
        newStart: NEW_SLOT,
      },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // New booking has new UID
      expect(result.booking.uid).toBe("cal_uid_3");
      expect(result.booking.previousUid).toBe("cal_uid_2");
    }

    // Old booking should be marked cancelled
    const updatedBooking = supabaseMock
      .insertsFor("bookings")
      .find((r) => r._upsert && r.cal_booking_uid === "cal_uid_3");
    expect(updatedBooking).toBeDefined();
    expect(updatedBooking).toMatchObject({
      guest_name: "Nguyen Van B",
      cal_booking_uid: "cal_uid_3",
    });
  });
});
