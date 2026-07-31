/**
 * book_appointment tool integration tests.
 * Mocks: eve/tools, calcom (getAvailableSlots + createBooking), agent-booking-auth,
 * guest-timezone-resolve, leads, agent-tool-log, notifications-write, analytics-server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock, QueryBuilder } from "../../tests/helpers/supabase-mock";

// eve/tools mock — avoid loading 18MB runtime
vi.mock("eve/tools", () => ({
  defineTool: (t: unknown) => t,
}));

// calcom mock — stub getAvailableSlots + createBooking; keep withCalApiKey real
vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    getAvailableSlots: vi.fn(),
    createBooking: vi.fn(),
  };
});

// agent-booking-auth mock — avoid cascading DB queries
vi.mock("@/lib/agent-booking-auth", () => ({
  resolveGuestBookingActor: vi.fn(),
}));

// guest-timezone-resolve mock
vi.mock("@/lib/guest-timezone-resolve", () => ({
  resolveGuestTimeZone: vi.fn(),
}));

// Stub heavy side-effect modules
vi.mock("@/lib/agent-tool-log", () => ({
  logAgentToolEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/analytics-server", () => ({
  trackServer: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/leads", () => ({
  upsertLeadAsBooked: vi.fn().mockResolvedValue(undefined),
}));

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const SLOT = "2026-08-05T09:00:00.000Z";

/** Seed a minimal viable workspace + AI event type for the happy path. */
function seedPilotWithAiEventType(overrides?: Record<string, unknown>) {
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
      ...overrides,
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
}

type ToolResult =
  | { ok: true; booking: Record<string, unknown>; manageCode: string; warning?: string }
  | { ok: false; error: string };

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("book_appointment tool", () => {
  it("creates booking and returns manageCode on happy path", async () => {
    seedPilotWithAiEventType();

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: SLOT },
      { start: "2026-08-05T10:00:00.000Z" },
    ]);
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_123",
      start: SLOT,
      status: "confirmed",
      meetingUrl: "https://cal.com/meeting/cal_uid_123",
      raw: { id: 1 },
    });

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

    const tzMod = await import("@/lib/guest-timezone-resolve");
    vi.mocked(tzMod.resolveGuestTimeZone).mockResolvedValue({
      guestTimeZone: "Asia/Ho_Chi_Minh",
      source: "session",
    });

    const tool = (await import("./book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Nguyen Van A",
        phone: "+84123456789",
        email: "a@example.com",
        start: SLOT,
        service: "Khám răng",
        notes: "Đau răng hàm",
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
      expect(result.booking.uid).toBe("cal_uid_123");
      expect(result.booking.start).toBe(SLOT);
      expect(result.booking.status).toBe("confirmed");
      expect(result.manageCode).toBeDefined();
      expect(result.manageCode.length).toBeGreaterThanOrEqual(6);
    }

    // Verify DB upsert was called
    const bookingInserts = supabaseMock.insertsFor("bookings");
    expect(bookingInserts.length).toBeGreaterThanOrEqual(1);
    expect(bookingInserts[0]).toMatchObject({
      workspace_id: PILOT_ID,
      cal_booking_uid: "cal_uid_123",
      guest_name: "Nguyen Van A",
      guest_email: "a@example.com",
      guest_phone: "+84123456789",
    });
  });

  it("returns {ok:false} when no AI event type configured", async () => {
    const nonPilotId = "bbbbbbbb-bbbb-4000-8000-eeeeeeeeeeee";
    supabaseMock.seed("workspaces", [
      {
        id: nonPilotId,
        name: "NoCal",
        slug: "nocal",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: null,
        cal_event_type_slug: null,
        cal_username: null,
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    // No workspace_event_types row → getAiBookingEventType returns null for non-pilot

    const tool = (await import("./book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Test",
        phone: "+84123456789",
        email: "test@example.com",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-2",
          auth: {
            current: {
              attributes: { workspaceSlug: "nocal" },
            },
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not configured");
    }
  });

  it("returns {ok:false} when Cal key is missing for non-pilot workspace", async () => {
    const tenantId = "cccccccc-cccc-4000-8000-cccccccccccc";
    supabaseMock.seed("workspaces", [
      {
        id: tenantId,
        name: "NoKey",
        slug: "nokey",
        timezone: "Asia/Ho_Chi_Minh",
        cal_event_type_id: null,
        cal_event_type_slug: null,
        cal_username: null,
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    // Has AI event type but no cal_api_key_encrypted → getCalApiKeyForWorkspace throws
    supabaseMock.seed("workspace_event_types", [
      {
        id: "evt-nokey",
        workspace_id: tenantId,
        cal_event_type_id: 456,
        title: "Consultation",
        slug: "consultation-30",
        length_minutes: 30,
        minimum_notice_minutes: 120,
        is_ai_booking: true,
      },
    ]);

    const tool = (await import("./book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Test",
        phone: "+84123456789",
        email: "test@example.com",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-3",
          auth: {
            current: {
              attributes: { workspaceSlug: "nokey" },
            },
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not available right now");
    }
  });

  it("returns {ok:false} when slot is no longer available", async () => {
    seedPilotWithAiEventType();

    const calcom = await import("@/lib/calcom");
    // Return slots that don't include the requested one
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: "2026-08-05T11:00:00.000Z" },
      { start: "2026-08-05T12:00:00.000Z" },
    ]);

    const tool = (await import("./book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Test",
        phone: "+84123456789",
        email: "test@example.com",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-4",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("no longer available");
    }
  });

  it("returns {ok:true, warning} when DB mirror fails but Cal.com succeeds", async () => {
    seedPilotWithAiEventType();

    const calcom = await import("@/lib/calcom");
    vi.mocked(calcom.getAvailableSlots).mockResolvedValue([
      { start: SLOT },
    ]);
    vi.mocked(calcom.createBooking).mockResolvedValue({
      uid: "cal_uid_mirror",
      start: SLOT,
      status: "confirmed",
      meetingUrl: "https://cal.com/meeting/cal_uid_mirror",
      raw: { id: 2 },
    });

    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-mirror",
        visitorId: "vis-mirror",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });

    const tzMod = await import("@/lib/guest-timezone-resolve");
    vi.mocked(tzMod.resolveGuestTimeZone).mockResolvedValue({
      guestTimeZone: "Asia/Ho_Chi_Minh",
      source: "session",
    });

    // First upsert throws, second (retry) succeeds
    vi.spyOn(QueryBuilder.prototype, "upsert")
      .mockRejectedValueOnce(new Error("DB connection lost"));

    const tool = (await import("./book_appointment")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {
        guestName: "Nguyen Van B",
        phone: "+84987654321",
        email: "b@example.com",
        start: SLOT,
      },
      {
        session: {
          id: "test-session-mirror",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.uid).toBe("cal_uid_mirror");
      expect(result.manageCode).toBeDefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("mirror");
    }
  });
});
