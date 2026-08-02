import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceBilling } from "@/lib/billing";
import { supabaseMock } from "../tests/helpers/supabase-mock";
import { APP_ERROR_CODE, isAppError } from "./errors";
import {
  PLAN_FEATURE,
  PLAN_PRICE_USD,
  assertWorkspaceFeature,
  canUseFeature,
  effectiveTier,
  featuresForTier,
} from "@/lib/plan-features";

function ws(overrides: Partial<WorkspaceBilling> = {}): WorkspaceBilling {
  return {
    planTier: "free",
    subscriptionStatus: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    ...overrides,
  };
}

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function pastIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

describe("effectiveTier", () => {
  it("promotes a free workspace inside its trial to pro", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: futureIso(3) }))).toBe("pro");
  });

  it("leaves a free workspace with an expired trial as free", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: pastIso(1) }))).toBe("free");
  });

  it("leaves a free workspace with no trial date as free", () => {
    expect(effectiveTier(ws({ planTier: "free", trialEndsAt: null }))).toBe("free");
  });

  it("never downgrades or promotes a paid tier", () => {
    expect(effectiveTier(ws({ planTier: "starter", trialEndsAt: futureIso(3) }))).toBe("starter");
    expect(effectiveTier(ws({ planTier: "pro", trialEndsAt: pastIso(9) }))).toBe("pro");
  });
});

describe("canUseFeature", () => {
  it("denies messenger on starter", () => {
    expect(canUseFeature(ws({ planTier: "starter" }), PLAN_FEATURE.MESSENGER)).toBe(false);
  });

  it("allows messenger on pro", () => {
    expect(canUseFeature(ws({ planTier: "pro" }), PLAN_FEATURE.MESSENGER)).toBe(true);
  });

  it("allows messenger during an active trial", () => {
    expect(
      canUseFeature(ws({ planTier: "free", trialEndsAt: futureIso(5) }), PLAN_FEATURE.MESSENGER),
    ).toBe(true);
  });

  it("denies messenger once the trial has expired", () => {
    expect(
      canUseFeature(ws({ planTier: "free", trialEndsAt: pastIso(1) }), PLAN_FEATURE.MESSENGER),
    ).toBe(false);
  });

  it("allows the web embed on starter", () => {
    expect(canUseFeature(ws({ planTier: "starter" }), PLAN_FEATURE.WEB_EMBED)).toBe(true);
  });
});

describe("featuresForTier", () => {
  it("gives pro every starter feature plus messenger", () => {
    const starter = featuresForTier("starter");
    const pro = featuresForTier("pro");

    for (const feature of starter) {
      expect(pro).toContain(feature);
    }
    expect(pro).toContain(PLAN_FEATURE.MESSENGER);
    expect(starter).not.toContain(PLAN_FEATURE.MESSENGER);
  });

  it("grants a bare free tier nothing", () => {
    expect(featuresForTier("free")).toEqual([]);
  });
});

describe("PLAN_PRICE_USD", () => {
  it("matches the advertised prices", () => {
    expect(PLAN_PRICE_USD.starter).toBe(19);
    expect(PLAN_PRICE_USD.pro).toBe(49);
  });
});

const PILOT_ID = "00000000-0000-4000-8000-000000000001";
const TENANT_ID = "11111111-1111-4111-8111-111111111111";

describe("assertWorkspaceFeature", () => {
  beforeEach(() => {
    // No vi.resetModules(): a fresh module graph would mint a second AppError
    // class and break the instanceof checks. BILLING_MODE is read per call.
    vi.unstubAllEnvs();
    vi.stubEnv("BILLING_MODE", "live");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows messenger for a pro workspace", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "pro",
        subscription_status: "active",
        trial_ends_at: pastIso(30),
      },
    ]);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("blocks messenger for a starter workspace", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "starter",
        subscription_status: "active",
        trial_ends_at: pastIso(30),
      },
    ]);

    const rejection = await assertWorkspaceFeature(
      TENANT_ID,
      PLAN_FEATURE.MESSENGER,
    ).catch((error: unknown) => error);
    expect(isAppError(rejection, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)).toBe(true);
  });

  it("allows messenger during an active trial", async () => {
    supabaseMock.seed("workspaces", [
      {
        id: TENANT_ID,
        plan_tier: "free",
        subscription_status: null,
        trial_ends_at: futureIso(4),
      },
    ]);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("fails closed when the workspace row cannot be read", async () => {
    supabaseMock.seed("workspaces", []);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const rejection = await assertWorkspaceFeature(
      TENANT_ID,
      PLAN_FEATURE.MESSENGER,
    ).catch((error: unknown) => error);
    expect(isAppError(rejection, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)).toBe(true);
  });

  it("never gates the Pilot demo workspace", async () => {
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(PILOT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("never gates when BILLING_MODE=test", async () => {
    vi.stubEnv("BILLING_MODE", "test");
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });

  it("never gates when BILLING_MODE=none", async () => {
    vi.stubEnv("BILLING_MODE", "none");
    supabaseMock.seed("workspaces", []);

    await expect(
      assertWorkspaceFeature(TENANT_ID, PLAN_FEATURE.MESSENGER),
    ).resolves.toBeUndefined();
  });
});
