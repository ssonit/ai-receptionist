import Stripe from "stripe";

export type BillingMode = "test" | "live";

export type PlanTier = "free" | "starter" | "pro";

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

export type WorkspaceBilling = {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: string | null;
};

export type CreateCheckoutParams = {
  workspaceId: string;
  planTier: "starter" | "pro";
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
};

export type CreateBillingPortalParams = {
  stripeCustomerId: string;
  returnUrl: string;
};

export function getBillingMode(): BillingMode {
  const raw = process.env.BILLING_MODE?.trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "test") return "test";

  // No explicit BILLING_MODE — infer from environment.
  // In production, never silently default to test (fail-open paywall + dead Stripe).
  if (process.env.NODE_ENV === "production") {
    console.warn("[billing] BILLING_MODE not set — defaulting to live in production");
    return "live";
  }
  return "test";
}

let _stripe: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;

  if (getBillingMode() === "test") {
    _stripe = null;
    return null;
  }

  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) {
    _stripe = null;
    return null;
  }

  _stripe = new Stripe(key, { apiVersion: "2025-06-30.basil" as unknown as Stripe.LatestApiVersion });
  return _stripe;
}

export function isSubActive(ws: WorkspaceBilling): boolean {
  if (getBillingMode() === "test") return true;

  if (
    ws.subscriptionStatus === "active" ||
    ws.subscriptionStatus === "trialing"
  ) {
    return true;
  }

  if (
    ws.planTier === "free" &&
    ws.trialEndsAt &&
    new Date(ws.trialEndsAt) > new Date()
  ) {
    return true;
  }

  return false;
}

export function formatTrialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const diff = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    if (getBillingMode() === "test") {
      return `/dashboard/billing?test_checkout=ok&plan=${params.planTier}`;
    }
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const priceId =
    params.planTier === "pro"
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_STARTER_PRICE_ID;

  if (!priceId) {
    throw new Error("STRIPE_PRICE_ID_MISSING");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(params.stripeCustomerId ? { customer: params.stripeCustomerId } : {}),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.workspaceId,
    metadata: { workspace_id: params.workspaceId, plan_tier: params.planTier },
    subscription_data: {
      metadata: { workspace_id: params.workspaceId, plan_tier: params.planTier },
    },
  });

  if (!session.url) {
    throw new Error("STRIPE_CHECKOUT_URL_MISSING");
  }

  return session.url;
}

export async function createBillingPortalSession(
  params: CreateBillingPortalParams,
): Promise<string> {
  const stripe = getStripe();
  if (!stripe) {
    if (getBillingMode() === "test") {
      return `/dashboard/billing?test_portal=ok`;
    }
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });

  return session.url;
}
