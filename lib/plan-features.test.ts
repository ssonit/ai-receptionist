import { describe, expect, it } from "vitest";
import type { WorkspaceBilling } from "@/lib/billing";
import {
  PLAN_FEATURE,
  PLAN_PRICE_USD,
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
