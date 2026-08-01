import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildMessengerOAuthUrl, validateMessengerEnv } from "@/lib/messenger";
import { resolveMessengerRedirectUri } from "@/lib/messenger-oauth";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  STATE_TTL_MS,
} from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";

export async function GET(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    validateMessengerEnv();
  } catch {
    return NextResponse.json(
      { error: "messenger_not_configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? "/dashboard/settings";
  const redirectUri = resolveMessengerRedirectUri(request.url);
  if (!redirectUri) {
    return NextResponse.json(
      { error: "messenger_not_configured" },
      { status: 500 },
    );
  }

  const { token } = createOAuthState(auth.workspaceId, returnTo);

  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(STATE_TTL_MS / 1000),
  });

  const authorizeUrl = buildMessengerOAuthUrl(token, redirectUri);
  return NextResponse.redirect(authorizeUrl);
}
