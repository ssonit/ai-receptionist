import type { PlanTier, SubscriptionStatus } from "@/lib/billing/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type ApplyEntitlementInput = {
  workspaceId: string;
  planTier: Exclude<PlanTier, "free">;
  status: SubscriptionStatus;
  provider: "polar" | "sepay";
  customerId?: string | null;
  subscriptionId?: string | null;
  periodEndsAt?: string | null;
};

export type RevokeEntitlementInput = {
  workspaceId?: string;
  subscriptionId?: string | null;
  provider?: "polar" | "sepay";
};

/** Activate or refresh a paid workspace entitlement from a provider webhook. */
export async function applyEntitlement(
  input: ApplyEntitlementInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const updateData: Record<string, unknown> = {
    plan_tier: input.planTier,
    subscription_status: input.status,
    billing_provider: input.provider,
  };
  if (input.customerId !== undefined) {
    updateData.billing_customer_id = input.customerId;
  }
  if (input.subscriptionId !== undefined) {
    updateData.billing_subscription_id = input.subscriptionId;
  }
  if (input.periodEndsAt !== undefined) {
    updateData.period_ends_at = input.periodEndsAt;
  }

  const { error } = await supabase
    .from("workspaces")
    .update(updateData)
    .eq("id", input.workspaceId);

  if (error) {
    console.error("[billing] applyEntitlement failed:", error);
    return { ok: false, error: "db_update_failed" };
  }
  return { ok: true };
}

/** Downgrade workspace after cancel / revoke. */
export async function revokeEntitlement(
  input: RevokeEntitlementInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const updateData: Record<string, unknown> = {
    subscription_status: "canceled",
    plan_tier: "free",
    period_ends_at: null,
  };

  let query = supabase.from("workspaces").update(updateData);
  if (input.workspaceId) {
    query = query.eq("id", input.workspaceId);
  } else if (input.subscriptionId) {
    query = query.eq("billing_subscription_id", input.subscriptionId);
  } else {
    return { ok: false, error: "missing_lookup" };
  }

  const { error } = await query;
  if (error) {
    console.error("[billing] revokeEntitlement failed:", error);
    return { ok: false, error: "db_update_failed" };
  }
  return { ok: true };
}

export async function syncSubscriptionStatus(params: {
  subscriptionId: string;
  status: SubscriptionStatus;
  planTier?: Exclude<PlanTier, "free"> | null;
  periodEndsAt?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const updateData: Record<string, unknown> = {
    subscription_status: params.status,
  };
  if (params.planTier) updateData.plan_tier = params.planTier;
  if (params.periodEndsAt !== undefined) {
    updateData.period_ends_at = params.periodEndsAt;
  }

  const { error } = await supabase
    .from("workspaces")
    .update(updateData)
    .eq("billing_subscription_id", params.subscriptionId);

  if (error) {
    console.error("[billing] syncSubscriptionStatus failed:", error);
    return { ok: false, error: "db_update_failed" };
  }
  return { ok: true };
}
