import { NextResponse } from "next/server";
import { createCheckoutSession } from "@/lib/billing";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { absoluteAppOrigin } from "@/lib/app-origin";

export async function POST(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  let body: { planTier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const planTier = body.planTier;
  if (planTier !== "starter" && planTier !== "pro") {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  const origin = await absoluteAppOrigin();
  const successUrl = `${origin}/dashboard/billing?checkout=success`;
  const cancelUrl = `${origin}/dashboard/billing?checkout=canceled`;

  const url = await createCheckoutSession({
    workspaceId: auth.workspaceId,
    planTier,
    successUrl,
    cancelUrl,
  });

  return NextResponse.json({ url });
}
