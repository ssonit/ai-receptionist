/**
 * check_availability tool integration tests.
 * Mocks: eve/tools (identity), calcom (getAvailableSlots), workspace resolution, supabase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../helpers/supabase-mock";

// eve/tools mock — avoid loading 18MB runtime
vi.mock("eve/tools", () => ({
  defineTool: (t: unknown) => t,
}));

// calcom mock — only stub getAvailableSlots; keep withCalApiKey real via importOriginal
vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    getAvailableSlots: vi.fn(),
  };
});

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

const PILOT_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
});

describe("check_availability tool", () => {
  it("returns slots grouped by day on happy path", async () => {
    // Seed workspace
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
    // Seed AI event type
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

    const mod = await import("@/lib/calcom");
    const mockGetSlots = vi.mocked(mod.getAvailableSlots);
    mockGetSlots.mockResolvedValue([
      { start: "2026-08-05T09:00:00.000Z" },
      { start: "2026-08-05T10:00:00.000Z" },
      { start: "2026-08-06T09:00:00.000Z" },
    ]);

    // Import the tool (which re-exports the defineTool result)
    type CheckResult =
      | { ok: true; count: number; slotsByDay: Record<string, unknown>; timezone: string }
      | { ok: false; error: string };

    const tool = (await import("../../agent/tools/check_availability")).default as {
      execute: (input: { startDate: string; endDate: string }, ctx: unknown) => Promise<CheckResult>;
    };

    const result = await tool.execute(
      { startDate: "2026-08-05", endDate: "2026-08-10" },
      {
        session: {
          id: "test-session",
          auth: { current: null, initiator: null },
        },
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(3);
      expect(result.slotsByDay).toBeDefined();
      expect(Object.keys(result.slotsByDay)).toContain("2026-08-05");
      expect(Object.keys(result.slotsByDay)).toContain("2026-08-06");
      expect(result.timezone).toBe("Asia/Ho_Chi_Minh");
    }
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
        cal_api_key_encrypted: null,
        service_mode: "onsite",
      },
    ]);
    // No workspace_event_types seeded, and non-pilot → no env bootstrap
    // But resolveWorkspaceIdFromAgentContext will throw since no session hint points to this workspace
    // and it falls back to pilot. We need to seed a chat_session.

    const tool = (await import("../../agent/tools/check_availability")).default as {
      execute: (input: { startDate: string; endDate: string }, ctx: unknown) => Promise<unknown>;
    };

    type CheckResult =
      | { ok: true; count: number }
      | { ok: false; error: string };

    const result = await tool.execute(
      { startDate: "2026-08-05", endDate: "2026-08-10" },
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
    ) as CheckResult;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not configured");
    }
  });
});
