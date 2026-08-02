import { NextResponse } from "next/server";
import {
  createCheckoutSession,
  emptyWorkspaceBilling,
  isSubActive,
  type BillingRail,
  type WorkspaceBilling,
} from "@/lib/billing";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { absoluteAppOrigin } from "@/lib/app-origin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { planTier?: string; rail?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const planTier = body.planTier;
  if (planTier !== "starter" && planTier !== "pro") {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  const rail = body.rail as BillingRail | undefined;
  if (rail !== "polar" && rail !== "sepay") {
    return NextResponse.json({ error: "invalid_rail" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select(
      "plan_tier, subscription_status, billing_provider, billing_customer_id, billing_subscription_id, period_ends_at, trial_ends_at",
    )
    .eq("id", auth.workspaceId)
    .maybeSingle();

  const billing: WorkspaceBilling = ws
    ? {
        planTier: (ws.plan_tier as WorkspaceBilling["planTier"]) ?? "free",
        subscriptionStatus:
          (ws.subscription_status as WorkspaceBilling["subscriptionStatus"]) ??
          null,
        billingProvider:
          (ws.billing_provider as WorkspaceBilling["billingProvider"]) ?? null,
        billingCustomerId: (ws.billing_customer_id as string | null) ?? null,
        billingSubscriptionId:
          (ws.billing_subscription_id as string | null) ?? null,
        periodEndsAt: (ws.period_ends_at as string | null) ?? null,
        trialEndsAt: (ws.trial_ends_at as string | null) ?? null,
      }
    : emptyWorkspaceBilling();

  if (
    isSubActive(billing) &&
    billing.planTier !== "free" &&
    billing.billingProvider &&
    billing.billingProvider !== rail
  ) {
    return NextResponse.json(
      { error: "provider_mismatch", provider: billing.billingProvider },
      { status: 409 },
    );
  }

  const origin = await absoluteAppOrigin();
  const successUrl = `${origin}/dashboard/billing?checkout=success`;
  const cancelUrl = `${origin}/dashboard/billing?checkout=canceled`;

  try {
    const result = await createCheckoutSession({
      workspaceId: auth.workspaceId,
      planTier,
      rail,
      successUrl,
      cancelUrl,
      billingCustomerId: billing.billingCustomerId,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "BILLING_DISABLED") {
      return NextResponse.json({ error: "billing_disabled" }, { status: 403 });
    }
    if (
      err instanceof Error &&
      (err.message === "POLAR_NOT_CONFIGURED" ||
        err.message === "POLAR_PRODUCT_ID_MISSING" ||
        err.message === "SEPAY_BANK_NOT_CONFIGURED")
    ) {
      return NextResponse.json({ error: "billing_not_configured" }, { status: 503 });
    }
    throw err;
  }
}
