import { customAlphabet } from "nanoid";
import { getBillingMode } from "@/lib/billing/mode";
import type { CreateCheckoutParams } from "@/lib/billing/types";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_VND = { starter: 499_000, pro: 1_299_000 } as const;

const paymentCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

export function sepayAmountVnd(planTier: "starter" | "pro"): number {
  const envKey =
    planTier === "pro" ? "SEPAY_PRO_AMOUNT_VND" : "SEPAY_STARTER_AMOUNT_VND";
  const raw = (process.env[envKey] ?? "").trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_VND[planTier];
}

export function buildSepayQrUrl(params: {
  amount: number;
  paymentCode: string;
}): string {
  const acc = (process.env.SEPAY_BANK_ACCOUNT ?? "").trim();
  const bank = (process.env.SEPAY_BANK_NAME ?? "").trim();
  if (!acc || !bank) {
    throw new Error("SEPAY_BANK_NOT_CONFIGURED");
  }
  const q = new URLSearchParams({
    acc,
    bank,
    amount: String(params.amount),
    des: params.paymentCode,
  });
  const name = (process.env.SEPAY_ACCOUNT_NAME ?? "").trim();
  if (name) q.set("template", "compact");
  return `https://qr.sepay.vn/img?${q.toString()}`;
}

export function verifySepayWebhookAuth(headerValue: string | null): boolean {
  const expected = (process.env.SEPAY_WEBHOOK_API_KEY ?? "").trim();
  if (!expected) return false;
  if (!headerValue) return false;
  const normalized = headerValue.replace(/^Apikey\s+/i, "").trim();
  return normalized === expected || headerValue === `Apikey ${expected}`;
}

/** Extract Eve payment code from SePay transfer content / code field. */
export function extractSepayPaymentCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.toUpperCase().match(/EVE[A-Z0-9]{6,16}/);
  return match?.[0] ?? null;
}

export type SepayCheckoutResult = {
  url: string;
  paymentId: string;
  paymentCode: string;
  qrUrl: string;
  amount: number;
};

export async function createSepayCheckoutSession(
  params: CreateCheckoutParams,
): Promise<SepayCheckoutResult> {
  if (getBillingMode() === "none") {
    throw new Error("BILLING_DISABLED");
  }

  const amount = sepayAmountVnd(params.planTier);
  const paymentCode = `EVE${paymentCodeAlphabet()}`;

  if (getBillingMode() === "test") {
    const paymentId = "test-payment";
    return {
      url: `/dashboard/billing/pay?id=${paymentId}&test=1&plan=${params.planTier}`,
      paymentId,
      paymentCode,
      qrUrl: buildSepayQrUrlSafe(amount, paymentCode),
      amount,
    };
  }

  const acc = (process.env.SEPAY_BANK_ACCOUNT ?? "").trim();
  const bank = (process.env.SEPAY_BANK_NAME ?? "").trim();
  if (!acc || !bank) {
    throw new Error("SEPAY_BANK_NOT_CONFIGURED");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("billing_payments")
    .insert({
      workspace_id: params.workspaceId,
      provider: "sepay",
      external_id: paymentCode,
      plan_tier: params.planTier,
      amount,
      currency: "VND",
      status: "pending",
      metadata: { payment_code: paymentCode },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[sepay] insert billing_payments failed:", error);
    throw new Error("SEPAY_PAYMENT_CREATE_FAILED");
  }

  const qrUrl = buildSepayQrUrl({ amount, paymentCode });
  return {
    url: `/dashboard/billing/pay?id=${data.id}`,
    paymentId: data.id as string,
    paymentCode,
    qrUrl,
    amount,
  };
}

function buildSepayQrUrlSafe(amount: number, paymentCode: string): string {
  try {
    return buildSepayQrUrl({ amount, paymentCode });
  } catch {
    return `https://qr.sepay.vn/img?acc=0000000000&bank=Vietcombank&amount=${amount}&des=${paymentCode}`;
  }
}

export function periodEndsAtFromNow(days = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function extendPeriodEndsAt(
  current: string | null | undefined,
  days = 30,
): string {
  const base =
    current && new Date(current) > new Date()
      ? new Date(current).getTime()
      : Date.now();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}
