import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Stripe from "stripe";
import { getBillingMode, getStripe, type PlanTier } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

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
      const planTier = (session.metadata?.plan_tier ?? "starter") as PlanTier;

      if (!workspaceId) break;

      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;

      await supabase
        .from("workspaces")
        .update({
          plan_tier: planTier,
          subscription_status: "active",
          stripe_customer_id: customerId ?? null,
          stripe_subscription_id:
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id ?? null,
        })
        .eq("id", workspaceId);
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const workspaceId =
        (sub.metadata as Record<string, string> | null)?.workspace_id ?? null;

      if (!workspaceId) break;

      await supabase
        .from("workspaces")
        .update({
          subscription_status: sub.status,
          plan_tier:
            (sub.metadata as Record<string, string> | null)?.plan_tier ??
            (sub.items?.data?.[0]?.price?.lookup_key as string | undefined) ??
            "starter",
        })
        .eq("stripe_subscription_id", sub.id);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await supabase
        .from("workspaces")
        .update({
          subscription_status: "canceled",
          plan_tier: "free",
        })
        .eq("stripe_subscription_id", sub.id);
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
