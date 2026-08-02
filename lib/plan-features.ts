/**
 * Which plan tier grants which capability.
 *
 * This table is the single source for BOTH enforcement and the plan copy shown
 * to customers (dashboard billing card + landing page pricing). Adding a feature
 * here without assigning tiers is a compile error, and the pricing UI can only
 * advertise what appears here — so copy cannot drift away from what the code
 * actually enforces, which it repeatedly did before this module existed.
 *
 * Only capabilities that exist in the codebase belong here. Zalo and WhatsApp are
 * deliberately absent: they are not built.
 */
import type { PlanTier, WorkspaceBilling } from "@/lib/billing";

export const PLAN_FEATURE = {
  WEB_EMBED: "web_embed",
  CAL_BOOKING: "cal_booking",
  FAQ_INTAKE: "faq_intake",
  BILINGUAL_AGENT: "bilingual_agent",
  REMINDERS: "reminders",
  MESSENGER: "messenger",
} as const;

export type PlanFeature = (typeof PLAN_FEATURE)[keyof typeof PLAN_FEATURE];

/**
 * `free` intentionally appears in no list. A free workspace either has a live
 * trial — in which case `effectiveTier` resolves it to `pro` before any lookup —
 * or its trial expired, in which case `assertWorkspaceSubscriptionActive` has
 * already blocked it globally. There is no state where a bare `free` tier should
 * grant a feature.
 */
export const PLAN_FEATURE_TIERS: Record<PlanFeature, readonly PlanTier[]> = {
  web_embed: ["starter", "pro"],
  cal_booking: ["starter", "pro"],
  faq_intake: ["starter", "pro"],
  bilingual_agent: ["starter", "pro"],
  reminders: ["starter", "pro"],
  messenger: ["pro"],
};

/** Monthly USD list price. The landing page and billing card both read this. */
export const PLAN_PRICE_USD: Record<Exclude<PlanTier, "free">, number> = {
  starter: 19,
  pro: 49,
};

/** Display order for the pricing UI. */
const FEATURE_ORDER: readonly PlanFeature[] = [
  PLAN_FEATURE.WEB_EMBED,
  PLAN_FEATURE.CAL_BOOKING,
  PLAN_FEATURE.FAQ_INTAKE,
  PLAN_FEATURE.BILINGUAL_AGENT,
  PLAN_FEATURE.REMINDERS,
  PLAN_FEATURE.MESSENGER,
];

/**
 * The tier to evaluate entitlements against. A `free` workspace inside its trial
 * is treated as `pro` so the trial demonstrates the feature that drives upgrades.
 *
 * Mirrors the trial window used by `isSubActive` (`lib/billing.ts`).
 */
export function effectiveTier(billing: WorkspaceBilling): PlanTier {
  if (
    billing.planTier === "free" &&
    billing.trialEndsAt &&
    new Date(billing.trialEndsAt) > new Date()
  ) {
    return "pro";
  }
  return billing.planTier;
}

export function canUseFeature(
  billing: WorkspaceBilling,
  feature: PlanFeature,
): boolean {
  return PLAN_FEATURE_TIERS[feature].includes(effectiveTier(billing));
}

export function featuresForTier(tier: PlanTier): readonly PlanFeature[] {
  return FEATURE_ORDER.filter((feature) =>
    PLAN_FEATURE_TIERS[feature].includes(tier),
  );
}
