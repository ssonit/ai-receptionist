import { NextResponse } from "next/server";
import { createBillingPortalSession } from "@/lib/billing";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("billing_provider, billing_customer_id")
    .eq("id", auth.workspaceId)
    .maybeSingle();

  if (ws?.billing_provider && ws.billing_provider !== "polar") {
    return NextResponse.json(
      { error: "portal_polar_only" },
      { status: 400 },
    );
  }

  const customerId = (ws?.billing_customer_id as string | null) ?? null;
  if (!customerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  try {
    const url = await createBillingPortalSession({
      billingCustomerId: customerId,
      externalCustomerId: auth.workspaceId,
    });
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof Error && err.message === "BILLING_DISABLED") {
      return NextResponse.json({ error: "billing_disabled" }, { status: 403 });
    }
    throw err;
  }
}
