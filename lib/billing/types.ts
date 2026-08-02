export type BillingMode = "none" | "test" | "live";

export type PlanTier = "free" | "starter" | "pro";

export type BillingProvider = "polar" | "sepay";

export type BillingRail = BillingProvider;

export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "trialing";

export type WorkspaceBilling = {
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus | null;
  billingProvider: BillingProvider | null;
  billingCustomerId: string | null;
  billingSubscriptionId: string | null;
  periodEndsAt: string | null;
  trialEndsAt: string | null;
};

export type CreateCheckoutParams = {
  workspaceId: string;
  planTier: "starter" | "pro";
  rail: BillingRail;
  successUrl: string;
  cancelUrl: string;
  billingCustomerId?: string | null;
};

export type CreateBillingPortalParams = {
  billingCustomerId: string;
  externalCustomerId?: string | null;
};
