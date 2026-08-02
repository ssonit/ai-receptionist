import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  connectZaloWorkspace,
} from "@/lib/zalo-oauth";
import {
  parseOAuthState,
  ZALO_OAUTH_STATE_COOKIE,
} from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { ROUTES, loginWithNext } from "@/lib/routes";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(ZALO_OAUTH_STATE_COOKIE)?.value;

  // Clear the state cookie immediately — it is single-use either way.
  cookieStore.set(ZALO_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.redirect(
      new URL(loginWithNext(ROUTES.DASHBOARD_SETTINGS), request.url),
    );
  }

  const failure = (reason: string) => {
    const redirect = new URL(ROUTES.DASHBOARD_SETTINGS, request.url);
    redirect.searchParams.set("zalo_oauth_error", reason);
    return NextResponse.redirect(redirect);
  };

  if (oauthError || !code) return failure("denied");
  if (!stateCookie || !stateParam || stateParam !== stateCookie) {
    return failure("state_invalid");
  }

  const state = parseOAuthState(stateCookie, auth.workspaceId);
  if (!state?.codeVerifier) return failure("state_invalid");

  let connected: { oaId: string; oaName: string };
  try {
    connected = await connectZaloWorkspace({
      workspaceId: auth.workspaceId,
      code,
      codeVerifier: state.codeVerifier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === CHANNEL_EXTERNAL_ID_TAKEN) {
      return failure("already_linked");
    }
    console.error("[zalo] oauth connect failed", error);
    return failure("exchange_failed");
  }

  const redirect = new URL(state.returnTo, request.url);
  redirect.searchParams.set("zalo_oauth_ok", "1");
  redirect.searchParams.set("zalo_oa_name", connected.oaName);
  return NextResponse.redirect(redirect);
}

