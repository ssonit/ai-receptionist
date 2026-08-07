/**
 * Settings working-hours action. Owner auth is mocked via requireOwnerWorkspace;
 * Cal.com schedule calls are mocked; Supabase is the global supabaseMock.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../../../tests/helpers/supabase-mock";

const WS_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  requireOwnerWorkspace: vi.fn(),
  getCalAccessTokenForWorkspace: vi.fn(),
  getDefaultSchedule: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/calcom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calcom")>();
  return {
    ...actual,
    getDefaultSchedule: mocks.getDefaultSchedule,
    createSchedule: mocks.createSchedule,
    updateSchedule: mocks.updateSchedule,
    withCalApiKey: (_key: string, fn: () => unknown) => fn(),
  };
});

vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace")>();
  return {
    ...actual,
    getCalAccessTokenForWorkspace: mocks.getCalAccessTokenForWorkspace,
  };
});

vi.mock("@/lib/workspace-invites", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-invites")>();
  return {
    ...actual,
    requireOwnerWorkspace: mocks.requireOwnerWorkspace,
  };
});

beforeEach(() => {
  supabaseMock.clear();
  vi.clearAllMocks();
  mocks.requireOwnerWorkspace.mockResolvedValue({
    ok: true,
    workspaceId: WS_ID,
    userId: "owner-1",
    supabase: supabaseMock.client,
  });
  mocks.getCalAccessTokenForWorkspace.mockResolvedValue("token");
});

describe("saveWorkingHoursAction", () => {
  it("updates the existing default schedule and refreshes business_hours", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    mocks.getDefaultSchedule.mockResolvedValue({
      id: 42,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [],
    });
    mocks.updateSchedule.mockResolvedValue({
      id: 42,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [
        {
          days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          startTime: "09:00",
          endTime: "17:00",
        },
      ],
    });

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [
        { day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Tuesday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Wednesday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Thursday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Friday", enabled: true, startTime: "09:00", endTime: "17:00" },
        { day: "Saturday", enabled: false, startTime: "09:00", endTime: "17:00" },
        { day: "Sunday", enabled: false, startTime: "09:00", endTime: "17:00" },
      ],
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.updateSchedule).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        availability: [
          {
            days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
            startTime: "09:00",
            endTime: "17:00",
          },
        ],
      }),
    );
    const ws = supabaseMock.getRows("workspaces")[0];
    expect(ws.business_hours).toContain("09:00");
  });

  it("creates a schedule when the account has none yet", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    mocks.getDefaultSchedule.mockResolvedValue(null);
    mocks.createSchedule.mockResolvedValue({
      id: 99,
      name: "Working Hours",
      timeZone: "Asia/Ho_Chi_Minh",
      isDefault: true,
      availability: [{ days: ["Monday"], startTime: "09:00", endTime: "17:00" }],
    });

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [{ day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" }],
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        timeZone: "Asia/Ho_Chi_Minh",
        isDefault: true,
      }),
    );
    expect(mocks.updateSchedule).not.toHaveBeenCalled();
  });

  it("returns ok:false without throwing when Cal.com rejects (e.g. missing OAuth scope)", async () => {
    supabaseMock.seed("workspaces", [{ id: WS_ID, timezone: "Asia/Ho_Chi_Minh" }]);
    mocks.getDefaultSchedule.mockRejectedValue(
      new Error("Cal.com request failed (403)"),
    );

    const { saveWorkingHoursAction } = await import("./actions");
    const result = await saveWorkingHoursAction(WS_ID, {
      days: [{ day: "Monday", enabled: true, startTime: "09:00", endTime: "17:00" }],
    });

    expect(result.ok).toBe(false);
  });
});
