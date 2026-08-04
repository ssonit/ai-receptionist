import { beforeEach, describe, expect, it } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { getWorkspaceGuestPolicy } from "./agent-booking-auth";

const WS = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  supabaseMock.clear();
});

describe("getWorkspaceGuestPolicy — guestEmailRequired", () => {
  it("defaults to true when the column is null/missing", async () => {
    supabaseMock.seed("workspaces", [{ id: WS }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(true);
  });

  it("returns false when explicitly disabled", async () => {
    supabaseMock.seed("workspaces", [{ id: WS, guest_email_required: false }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(false);
  });

  it("returns true when explicitly enabled", async () => {
    supabaseMock.seed("workspaces", [{ id: WS, guest_email_required: true }]);
    const policy = await getWorkspaceGuestPolicy(WS);
    expect(policy.guestEmailRequired).toBe(true);
  });
});
