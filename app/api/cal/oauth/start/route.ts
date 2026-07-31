import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildCalOAuthAuthorizeUrl, validateOAuthEnv } from "@/lib/cal-oauth";
import { createOAuthState, OAUTH_STATE_COOKIE, STATE_TTL_MS } from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";

export async function GET(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    validateOAuthEnv();
  } catch {
    return NextResponse.json({ error: "cal_oauth_not_configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? "/dashboard/setup";

  const { token } = createOAuthState(auth.workspaceId, returnTo);

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(STATE_TTL_MS / 1000),
  });

  const authorizeUrl = buildCalOAuthAuthorizeUrl(token);
  return NextResponse.redirect(authorizeUrl);
}
