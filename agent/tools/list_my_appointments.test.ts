/**
 * list_my_appointments tool integration tests.
 * Mocks: eve/tools, agent-booking-auth, guest-timezone-resolve, agent-tool-log.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../tests/helpers/supabase-mock";

vi.mock("eve/tools", () => ({
  defineTool: (t: unknown) => t,
}));

vi.mock("@/lib/agent-booking-auth", () => ({
  resolveGuestBookingActor: vi.fn(),
  findClaimableBookings: vi.fn(),
  summarizeBookingCandidates: vi.fn(),
  toolError: vi.fn(),
}));

vi.mock("@/lib/guest-timezone-resolve", () => ({
  resolveGuestTimeZone: vi.fn(),
}));

vi.mock("@/lib/agent-tool-log", () => ({
  logAgentToolEvent: vi.fn().mockResolvedValue(undefined),
}));

const PILOT_ID = "00000000-0000-4000-8000-000000000001";

type ToolResult =
  | { ok: true; appointments: unknown[]; needsPhoneLast4: unknown[]; businessTimeZone: string }
  | { ok: false; error: string };

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("list_my_appointments tool", () => {
  it("lists claimable appointments on happy path", async () => {
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

    const mockAuto = [
      {
        id: "b-1",
        cal_booking_uid: "uid_1",
        start_time: "2026-08-10T09:00:00.000Z",
        guest_name: "Nguyen Van A",
        guest_email: "a@example.com",
        guest_phone: "+84123456789",
        status: "accepted",
        list_status: "upcoming",
        visitor_id: "vis-1",
        chat_session_id: "cs-1",
        session_id: "sess-1",
        manage_code_hash: null,
        service: "Khám răng",
        claimTier: "A1" as const,
        guest_timezone: null,
      },
    ];
    const mockNeedsPhone = [
      {
        id: "b-2",
        cal_booking_uid: "uid_2",
        start_time: "2026-08-11T10:00:00.000Z",
        guest_name: "Nguyen Van A",
        guest_email: "a@example.com",
        guest_phone: "+84123456789",
        status: "accepted",
        list_status: "upcoming",
        visitor_id: "vis-1",
        chat_session_id: "cs-2",
        session_id: "sess-2",
        manage_code_hash: null,
        service: "Tư vấn",
        claimTier: "A2" as const,
        guest_timezone: null,
      },
    ];

    vi.mocked(authMod.findClaimableBookings).mockResolvedValue({
      auto: mockAuto as any,
      needsPhoneLast4: mockNeedsPhone as any,
    });
    vi.mocked(authMod.summarizeBookingCandidates).mockImplementation(
      (rows) => rows.map((r) => ({
        bookingUid: r.cal_booking_uid,
        start: r.start_time,
        guestName: r.guest_name,
        service: r.service,
        claimTier: r.claimTier,
        guestTimeZone: r.guest_timezone,
        display: `${r.start_time} (ICT)`,
      })),
    );
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    // Seed workspace for getWorkspaceById
    supabaseMock.seed("workspaces", [
      {
        id: PILOT_ID,
        name: "Pilot",
        slug: "pilot",
        timezone: "Asia/Ho_Chi_Minh",
        service_mode: "onsite",
      },
    ]);

    const tool = (await import("./list_my_appointments")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {},
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointments).toHaveLength(1);
      expect(result.appointments[0]).toMatchObject({ bookingUid: "uid_1", claimTier: "A1" });
      expect(result.needsPhoneLast4).toHaveLength(1);
      expect(result.needsPhoneLast4[0]).toMatchObject({ bookingUid: "uid_2", claimTier: "A2" });
      expect(result.businessTimeZone).toBe("Asia/Ho_Chi_Minh");
    }
  });

  it("returns empty lists when no claimable bookings exist", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-empty",
        visitorId: "vis-empty",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: false,
      },
    });
    vi.mocked(authMod.findClaimableBookings).mockResolvedValue({
      auto: [],
      needsPhoneLast4: [],
    });
    vi.mocked(authMod.summarizeBookingCandidates).mockReturnValue([]);
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
        service_mode: "onsite",
      },
    ]);

    const tool = (await import("./list_my_appointments")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {},
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.appointments).toHaveLength(0);
      expect(result.needsPhoneLast4).toHaveLength(0);
    }
  });

  it("returns error when guest is rate limited", async () => {
    const authMod = await import("@/lib/agent-booking-auth");
    vi.mocked(authMod.resolveGuestBookingActor).mockResolvedValue({
      ok: true,
      actor: {
        workspaceId: PILOT_ID,
        chatSessionId: "cs-rate",
        visitorId: "vis-rate",
        eveSessionId: null,
        profileEmail: null,
        rateLimited: true,
      },
    });
    vi.mocked(authMod.toolError).mockImplementation((code: string) => ({
      ok: false as const,
      error: `ERROR: ${code}`,
      errorCode: code,
    }));

    const tool = (await import("./list_my_appointments")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {},
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("agent_rate_limited");
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

    const tool = (await import("./list_my_appointments")).default as unknown as {
      execute: (input: Record<string, unknown>, ctx: unknown) => Promise<ToolResult>;
    };

    const result = await tool.execute(
      {},
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(false);
  });
});
