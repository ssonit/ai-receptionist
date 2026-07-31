import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  getBillingMode,
  isSubActive,
  formatTrialDaysLeft,
} from "@/lib/billing";
import type { WorkspaceBilling } from "@/lib/billing";

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

describe("getBillingMode", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns test when BILLING_MODE is test", () => {
    vi.stubEnv("BILLING_MODE", "test");
    expect(getBillingMode()).toBe("test");
  });

  it("returns test when BILLING_MODE is unset", () => {
    vi.stubEnv("BILLING_MODE", undefined);
    expect(getBillingMode()).toBe("test");
  });

  it("returns test for unknown values", () => {
    vi.stubEnv("BILLING_MODE", "staging");
    expect(getBillingMode()).toBe("test");
  });

  it("returns live when BILLING_MODE is live", () => {
    vi.stubEnv("BILLING_MODE", "live");
    expect(getBillingMode()).toBe("live");
  });
});

describe("isSubActive", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("always true in test mode", () => {
    vi.stubEnv("BILLING_MODE", "test");
    expect(isSubActive(ws({ subscriptionStatus: "canceled" }))).toBe(true);
    expect(isSubActive(ws({ subscriptionStatus: null, trialEndsAt: "2020-01-01" }))).toBe(true);
    expect(isSubActive(ws())).toBe(true);
  });

  it("true with active subscription in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    expect(isSubActive(ws({ subscriptionStatus: "active" }))).toBe(true);
    expect(isSubActive(ws({ subscriptionStatus: "trialing" }))).toBe(true);
  });

  it("true for free plan within trial in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isSubActive(ws({ planTier: "free", trialEndsAt: future }))).toBe(true);
  });

  it("false for expired trial + no sub in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isSubActive(ws({ trialEndsAt: past }))).toBe(false);
  });

  it("false for canceled sub in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    expect(isSubActive(ws({ subscriptionStatus: "canceled" }))).toBe(false);
  });

  it("false for past_due sub in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    expect(isSubActive(ws({ subscriptionStatus: "past_due" }))).toBe(false);
  });

  it("false for paid plan with no active sub in live mode", () => {
    vi.stubEnv("BILLING_MODE", "live");
    expect(isSubActive(ws({ planTier: "starter", subscriptionStatus: null }))).toBe(false);
  });
});

describe("formatTrialDaysLeft", () => {
  it("returns rounded-up days remaining", () => {
    const future = new Date(Date.now() + 2.5 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTrialDaysLeft(future)).toBe(3);
  });

  it("returns 0 for null", () => {
    expect(formatTrialDaysLeft(null)).toBe(0);
  });

  it("returns 0 for past date", () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatTrialDaysLeft(past)).toBe(0);
  });
});
