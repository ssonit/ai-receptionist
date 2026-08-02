import { Polar } from "@polar-sh/sdk";
import { getBillingMode } from "@/lib/billing/mode";
import type { CreateBillingPortalParams, CreateCheckoutParams } from "@/lib/billing/types";

let _polar: Polar | null | undefined;

export function getPolar(): Polar | null {
  if (_polar !== undefined) return _polar;

  if (getBillingMode() === "test") {
    _polar = null;
    return null;
  }

  const token = (process.env.POLAR_ACCESS_TOKEN ?? "").trim();
  if (!token) {
    _polar = null;
    return null;
  }

  const server =
    (process.env.POLAR_SERVER ?? "").trim().toLowerCase() === "sandbox"
      ? "sandbox"
      : "production";

  _polar = new Polar({ accessToken: token, server });
  return _polar;
}

function productIdForTier(planTier: "starter" | "pro"): string {
  const id =
    planTier === "pro"
      ? process.env.POLAR_PRO_PRODUCT_ID
      : process.env.POLAR_STARTER_PRODUCT_ID;
  if (!id?.trim()) {
    throw new Error("POLAR_PRODUCT_ID_MISSING");
  }
  return id.trim();
}

export async function createPolarCheckoutSession(
  params: CreateCheckoutParams,
): Promise<string> {
  const polar = getPolar();
  if (!polar) {
    if (getBillingMode() === "test") {
      return `/dashboard/billing?test_checkout=ok&plan=${params.planTier}&rail=polar`;
    }
    throw new Error("POLAR_NOT_CONFIGURED");
  }

  const checkout = await polar.checkouts.create({
    products: [productIdForTier(params.planTier)],
    successUrl: params.successUrl,
    returnUrl: params.cancelUrl,
    externalCustomerId: params.workspaceId,
    metadata: {
      workspace_id: params.workspaceId,
      plan_tier: params.planTier,
    },
  });

  if (!checkout.url) {
    throw new Error("POLAR_CHECKOUT_URL_MISSING");
  }
  return checkout.url;
}

export async function createPolarPortalSession(
  params: CreateBillingPortalParams,
): Promise<string> {
  const polar = getPolar();
  if (!polar) {
    if (getBillingMode() === "test") {
      return `/dashboard/billing?test_portal=ok`;
    }
    throw new Error("POLAR_NOT_CONFIGURED");
  }

  const session = await polar.customerSessions.create(
    params.externalCustomerId
      ? { externalCustomerId: params.externalCustomerId }
      : { customerId: params.billingCustomerId },
  );

  return session.customerPortalUrl;
}
