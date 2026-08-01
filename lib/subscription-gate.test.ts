/**
 * Subscription gate for the AI receptionist.
 * Supabase is mocked globally via tests/setup.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { APP_ERROR_CODE, isAppError } from "./errors";
import { assertWorkspaceSubscriptionActive } from "./workspace";

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function pastIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("assertWorkspaceSubscriptionActive", () => {
  beforeEach(() => {
    // No vi.resetModules() here: a fresh module graph would mint a second
    // AppError class and break the `instanceof` checks below. BILLING_MODE is
    // read per call, so stubbing the env is enough.
    vi.unstubAllEnvs();
    // The suite runs with BILLING_MODE=test, which short-circuits the gate.
    vi.stubEnv("BILLING_MODE", "live");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes an active subscription", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: pastIso(30),
      },
    ]);

    await expect(assertWorkspaceSubscriptionActive(TENANT_ID)).resolves.toBeUndefined();
  });

  it("passes a free workspace still inside its trial", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "free",
        subscription_status: null,
        trial_ends_at: futureIso(3),
      },
    ]);

    await expect(assertWorkspaceSubscriptionActive(TENANT_ID)).resolves.toBeUndefined();
  });

  it("blocks an expired trial with no subscription", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "free",
        subscription_status: null,
        trial_ends_at: pastIso(1),
      },
    ]);

    const rejection = await assertWorkspaceSubscriptionActive(TENANT_ID).catch(
      (error: unknown) => error,
    );
    expect(isAppError(rejection, APP_ERROR_CODE.SUBSCRIPTION_INACTIVE)).toBe(true);
  });

  it("blocks a past_due subscription", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "starter",
        subscription_status: "past_due",
        trial_ends_at: pastIso(30),
      },
    ]);

    await expect(assertWorkspaceSubscriptionActive(TENANT_ID)).rejects.toThrow();
  });

  it("fails closed when the workspace row cannot be read", async () => {
    // No seed, so the row is missing. An unreadable billing state must not unlock the
    // agent; the guest sees the same "booking paused" copy.
    supabaseMock.seed("workspaces", []);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const rejection = await assertWorkspaceSubscriptionActive(TENANT_ID).catch(
      (error: unknown) => error,
    );
    expect(isAppError(rejection, APP_ERROR_CODE.SUBSCRIPTION_INACTIVE)).toBe(true);
  });

  it("never gates the Pilot demo workspace", async () => {
    supabaseMock.seed("workspaces", []);

    await expect(assertWorkspaceSubscriptionActive(PILOT_ID)).resolves.toBeUndefined();
  });

  it("never gates when BILLING_MODE=test", async () => {
    vi.stubEnv("BILLING_MODE", "test");
    supabaseMock.seed("workspaces", []);

    await expect(assertWorkspaceSubscriptionActive(TENANT_ID)).resolves.toBeUndefined();
  });
});

