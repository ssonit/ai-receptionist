import { NextResponse } from "next/server";
import {
  validateEvent,
  WebhookVerificationError,
} from "@polar-sh/sdk/webhooks";
import { getBillingMode, type PlanTier, type SubscriptionStatus } from "@/lib/billing";
import {
  applyEntitlement,
  revokeEntitlement,
  syncSubscriptionStatus,
} from "@/lib/billing/apply-entitlement";

const VALID_PLAN_TIERS = new Set<PlanTier>(["free", "starter", "pro"]);

function validatePlanTier(v: unknown): Exclude<PlanTier, "free"> | null {
  if (v === "starter" || v === "pro") return v;
  if (typeof v === "string" && VALID_PLAN_TIERS.has(v as PlanTier) && v !== "free") {
    return v as Exclude<PlanTier, "free">;
  }
  return null;
}

function mapPolarStatus(status: string): SubscriptionStatus {
  const mapping: Record<string, SubscriptionStatus> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    incomplete: "incomplete",
    unpaid: "past_due",
  };
  return mapping[status] ?? "canceled";
}

function metaString(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = meta?.[key];
  return typeof v === "string" ? v : null;
}

export async function POST(request: Request) {
  const mode = getBillingMode();
  if (mode === "test") {
    return NextResponse.json({ ok: true, mode: "test" });
  }

  const webhookSecret = (process.env.POLAR_WEBHOOK_SECRET ?? "").trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook_secret_missing" }, { status: 500 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let event: ReturnType<typeof validateEvent>;
  try {
    event = validateEvent(rawBody, headers, webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }
    console.error("[polar-webhook] validate failed:", err);
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.updated": {
      const checkout = event.data;
      if (checkout.status !== "succeeded") break;
      const workspaceId =
        metaString(checkout.metadata as Record<string, unknown>, "workspace_id") ??
        checkout.externalCustomerId ??
        null;
      if (!workspaceId) break;
      const planTier =
        validatePlanTier(
          metaString(checkout.metadata as Record<string, unknown>, "plan_tier"),
        ) ?? "starter";
      const customerId =
        typeof checkout.customerId === "string" ? checkout.customerId : null;
      const subscriptionId =
        typeof checkout.subscriptionId === "string"
          ? checkout.subscriptionId
          : null;
      const result = await applyEntitlement({
        workspaceId,
        planTier,
        status: "active",
        provider: "polar",
        customerId,
        subscriptionId,
        periodEndsAt: null,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      break;
    }

    case "subscription.active":
    case "subscription.updated":
    case "subscription.past_due": {
      const sub = event.data;
      const subscriptionId = sub.id as string;
      const status = mapPolarStatus(String(sub.status));
      const planTier = validatePlanTier(
        metaString(sub.metadata as Record<string, unknown>, "plan_tier"),
      );
      const periodEndsAt = sub.currentPeriodEnd
        ? new Date(sub.currentPeriodEnd as string | number | Date).toISOString()
        : null;

      const workspaceId = metaString(
        sub.metadata as Record<string, unknown>,
        "workspace_id",
      );

      if (workspaceId && (event.type === "subscription.active" || status === "active")) {
        const result = await applyEntitlement({
          workspaceId,
          planTier: planTier ?? "starter",
          status,
          provider: "polar",
          customerId:
            typeof sub.customerId === "string" ? sub.customerId : null,
          subscriptionId,
          periodEndsAt,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }
      } else {
        const result = await syncSubscriptionStatus({
          subscriptionId,
          status,
          planTier,
          periodEndsAt,
        });
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: 500 });
        }
      }
      break;
    }

    case "subscription.revoked":
    case "subscription.canceled": {
      const sub = event.data;
      // End-of-period cancel still has active status until revoked.
      if (event.type === "subscription.canceled" && sub.status === "active") {
        break;
      }
      const result = await revokeEntitlement({
        subscriptionId: sub.id as string,
        provider: "polar",
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
