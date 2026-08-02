import { NextResponse } from "next/server";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingMode } from "@/lib/billing";
import { buildSepayQrUrl, sepayAmountVnd } from "@/lib/billing/sepay";

export async function GET(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  if (getBillingMode() === "test" && id === "test-payment") {
    const plan =
      url.searchParams.get("plan") === "pro" ? "pro" : "starter";
    const amount = sepayAmountVnd(plan);
    const paymentCode = "EVETESTCODE01";
    let qrUrl: string | null = null;
    try {
      qrUrl = buildSepayQrUrl({ amount, paymentCode });
    } catch {
      qrUrl = `https://qr.sepay.vn/img?acc=0000000000&bank=Vietcombank&amount=${amount}&des=${paymentCode}`;
    }
    return NextResponse.json({
      id,
      status: "pending",
      planTier: plan,
      amount,
      currency: "VND",
      paymentCode,
      qrUrl,
      periodEndsAt: null,
    });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_payments")
    .select(
      "id, workspace_id, plan_tier, amount, currency, status, external_id, period_ends_at, metadata",
    )
    .eq("id", id)
    .eq("provider", "sepay")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (data.workspace_id !== auth.workspaceId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const paymentCode = data.external_id as string;
  let qrUrl: string | null = null;
  try {
    qrUrl = buildSepayQrUrl({
      amount: data.amount as number,
      paymentCode,
    });
  } catch {
    qrUrl = null;
  }

  return NextResponse.json({
    id: data.id,
    status: data.status,
    planTier: data.plan_tier,
    amount: data.amount,
    currency: data.currency,
    paymentCode,
    qrUrl,
    periodEndsAt: data.period_ends_at,
  });
}
