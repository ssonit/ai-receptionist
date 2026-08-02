import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getBillingMode } from "@/lib/billing";
import { applyEntitlement } from "@/lib/billing/apply-entitlement";
import {
  extendPeriodEndsAt,
  extractSepayPaymentCode,
  verifySepayWebhookAuth,
} from "@/lib/billing/sepay";
import { createAdminClient } from "@/lib/supabase/admin";

type SepayWebhookBody = {
  id?: number | string;
  transferType?: string;
  transferAmount?: number;
  amount?: number;
  code?: string;
  content?: string;
  description?: string;
};

export async function POST(request: NextRequest) {
  if (getBillingMode() === "test") {
    return NextResponse.json({ success: true, mode: "test" });
  }

  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  if (!verifySepayWebhookAuth(authHeader)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  let body: SepayWebhookBody;
  try {
    body = (await request.json()) as SepayWebhookBody;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  if (body.transferType && body.transferType !== "in") {
    return NextResponse.json({ success: true });
  }

  const paymentCode =
    extractSepayPaymentCode(body.code) ??
    extractSepayPaymentCode(body.content) ??
    extractSepayPaymentCode(body.description);

  if (!paymentCode) {
    return NextResponse.json({ success: true });
  }

  const amount = Number(body.transferAmount ?? body.amount ?? 0);
  const supabase = createAdminClient();

  const { data: payment, error: findError } = await supabase
    .from("billing_payments")
    .select("id, workspace_id, plan_tier, amount, status")
    .eq("provider", "sepay")
    .eq("external_id", paymentCode)
    .maybeSingle();

  if (findError || !payment) {
    console.warn("[sepay-webhook] payment not found:", paymentCode, findError);
    return NextResponse.json({ success: true });
  }

  if (payment.status === "paid") {
    return NextResponse.json({ success: true });
  }

  if (amount > 0 && amount < (payment.amount as number)) {
    console.warn(
      "[sepay-webhook] amount too low:",
      amount,
      "expected",
      payment.amount,
    );
    return NextResponse.json({ success: true });
  }

  const webhookTxnId = body.id != null ? String(body.id) : null;
  if (webhookTxnId) {
    const { data: dup } = await supabase
      .from("billing_payments")
      .select("id")
      .eq("provider", "sepay")
      .contains("metadata", { sepay_txn_id: webhookTxnId })
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ success: true });
    }
  }

  const { data: ws } = await supabase
    .from("workspaces")
    .select("period_ends_at")
    .eq("id", payment.workspace_id)
    .maybeSingle();

  const periodStartsAt = new Date().toISOString();
  const periodEndsAt = extendPeriodEndsAt(
    (ws?.period_ends_at as string | null) ?? null,
    30,
  );

  const { error: payUpdateError } = await supabase
    .from("billing_payments")
    .update({
      status: "paid",
      period_starts_at: periodStartsAt,
      period_ends_at: periodEndsAt,
      updated_at: periodStartsAt,
      metadata: {
        payment_code: paymentCode,
        sepay_txn_id: webhookTxnId,
      },
    })
    .eq("id", payment.id)
    .eq("status", "pending");

  if (payUpdateError) {
    console.error("[sepay-webhook] payment update failed:", payUpdateError);
    return NextResponse.json({ success: false }, { status: 500 });
  }

  const planTier =
    payment.plan_tier === "pro" || payment.plan_tier === "starter"
      ? payment.plan_tier
      : "starter";

  const result = await applyEntitlement({
    workspaceId: payment.workspace_id as string,
    planTier,
    status: "active",
    provider: "sepay",
    periodEndsAt,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
