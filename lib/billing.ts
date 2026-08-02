import {
  createPolarCheckoutSession,
  createPolarPortalSession,
} from "@/lib/billing/polar";
import { createSepayCheckoutSession } from "@/lib/billing/sepay";
import { getBillingMode, isBillingEnabled } from "@/lib/billing/mode";
import type {
  CreateBillingPortalParams,
  CreateCheckoutParams,
  WorkspaceBilling,
} from "@/lib/billing/types";

export type {
  BillingMode,
  BillingProvider,
  BillingRail,
  CreateBillingPortalParams,
  CreateCheckoutParams,
  PlanTier,
  SubscriptionStatus,
  WorkspaceBilling,
} from "@/lib/billing/types";

export { getBillingMode, isBillingEnabled };

export function isSubActive(ws: WorkspaceBilling): boolean {
  const mode = getBillingMode();
  if (mode === "none" || mode === "test") return true;

  if (
    ws.planTier === "free" &&
    ws.trialEndsAt &&
    new Date(ws.trialEndsAt) > new Date()
  ) {
    return true;
  }

  if (
    ws.subscriptionStatus === "active" ||
    ws.subscriptionStatus === "trialing"
  ) {
    if (ws.billingProvider === "sepay") {
      if (!ws.periodEndsAt) return false;
      return new Date(ws.periodEndsAt) > new Date();
    }
    return true;
  }

  return false;
}

export function formatTrialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function daysUntilPeriodEnd(periodEndsAt: string | null): number {
  if (!periodEndsAt) return 0;
  const diff = new Date(periodEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<{ url: string; rail: CreateCheckoutParams["rail"] }> {
  if (getBillingMode() === "none") {
    throw new Error("BILLING_DISABLED");
  }

  if (params.rail === "polar") {
    const url = await createPolarCheckoutSession(params);
    return { url, rail: "polar" };
  }

  const sepay = await createSepayCheckoutSession(params);
  return { url: sepay.url, rail: "sepay" };
}

export async function createBillingPortalSession(
  params: CreateBillingPortalParams,
): Promise<string> {
  if (getBillingMode() === "none") {
    throw new Error("BILLING_DISABLED");
  }
  return createPolarPortalSession(params);
}

/** Empty billing snapshot for UI / gates when no workspace row is loaded. */
export function emptyWorkspaceBilling(): WorkspaceBilling {
  return {
    planTier: "free",
    subscriptionStatus: null,
    billingProvider: null,
    billingCustomerId: null,
    billingSubscriptionId: null,
    periodEndsAt: null,
    trialEndsAt: null,
  };
}
