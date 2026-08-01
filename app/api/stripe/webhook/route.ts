import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { getBillingMode, getStripe, type PlanTier, type SubscriptionStatus } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_PLAN_TIERS = new Set<PlanTier>(["free", "starter", "pro"]);

function validatePlanTier(v: unknown): PlanTier | null {
  if (typeof v === "string" && VALID_PLAN_TIERS.has(v as PlanTier)) {
    return v as PlanTier;
  }
  return null;
}

function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const mapping: Record<string, SubscriptionStatus> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    trialing: "trialing",
    unpaid: "past_due",
    paused: "canceled",
    incomplete_expired: "incomplete",
  };
  return mapping[stripeStatus] ?? "canceled";
}

export async function POST(request: NextRequest) {
  const mode = getBillingMode();
  if (mode === "test") {
    return NextResponse.json({ ok: true, mode: "test" });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 500 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.client_reference_id ?? session.metadata?.workspace_id;

      if (!workspaceId) break;

      const planTier = validatePlanTier(session.metadata?.plan_tier);
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      const updateData: Record<string, unknown> = {
        subscription_status: "active",
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscriptionId,
      };
      if (planTier) {
        updateData.plan_tier = planTier;
      }

      const { error } = await supabase
        .from("workspaces")
        .update(updateData)
        .eq("id", workspaceId);

      if (error) {
        console.error("[stripe-webhook] checkout.session.completed update failed:", error);
        return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
      }
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const meta = (sub.metadata as Record<string, string> | null) ?? null;

      const subscriptionStatus = mapStripeStatus(sub.status);
      const planTier =
        validatePlanTier(meta?.plan_tier) ??
        validatePlanTier(sub.items?.data?.[0]?.price?.lookup_key);

      const updateData: Record<string, unknown> = {
        subscription_status: subscriptionStatus,
      };
      if (planTier) {
        updateData.plan_tier = planTier;
      }

      const { error } = await supabase
        .from("workspaces")
        .update(updateData)
        .eq("stripe_subscription_id", sub.id);

      if (error) {
        console.error("[stripe-webhook] customer.subscription.updated update failed:", error);
        return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const { error } = await supabase
        .from("workspaces")
        .update({
          subscription_status: "canceled",
          plan_tier: "free",
        })
        .eq("stripe_subscription_id", sub.id);

      if (error) {
        console.error("[stripe-webhook] customer.subscription.deleted update failed:", error);
        return NextResponse.json({ error: "db_update_failed" }, { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
