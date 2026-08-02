import type { BillingMode } from "@/lib/billing/types";

export function getBillingMode(): BillingMode {
  const raw = process.env.BILLING_MODE?.trim().toLowerCase();
  if (raw === "none") return "none";
  if (raw === "live") return "live";
  if (raw === "test") return "test";

  if (process.env.NODE_ENV === "production") {
    console.warn("[billing] BILLING_MODE not set — defaulting to live in production");
    return "live";
  }
  return "test";
}

export function isBillingEnabled(): boolean {
  return getBillingMode() !== "none";
}
