import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForToken,
  getCalMeProfileWithToken,
  persistOAuthTokens,
} from "@/lib/cal-oauth";
import { OAUTH_STATE_COOKIE, parseOAuthState } from "@/lib/cal-oauth-state";
import { canonicalizeTimezone } from "@/lib/timezones";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  // Clear the state cookie immediately — single-use.
  cookieStore.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });

  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.redirect(new URL(`/login?error=${auth.error}`, request.url));
  }

  if (error || !code) {
    const returnTo = "/dashboard/setup";
    const redirect = new URL(returnTo, request.url);
    redirect.searchParams.set("cal_oauth_error", "denied");
    return NextResponse.redirect(redirect);
  }

  if (!stateCookie) {
    const redirect = new URL("/dashboard/setup", request.url);
    redirect.searchParams.set("cal_oauth_error", "state_invalid");
    return NextResponse.redirect(redirect);
  }

  const state = parseOAuthState(stateCookie, auth.workspaceId);
  if (!state) {
    const redirect = new URL("/dashboard/setup", request.url);
    redirect.searchParams.set("cal_oauth_error", "state_invalid");
    return NextResponse.redirect(redirect);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch {
    const redirect = new URL(state.returnTo, request.url);
    redirect.searchParams.set("cal_oauth_error", "exchange_failed");
    return NextResponse.redirect(redirect);
  }

  const store = persistOAuthTokens(tokens);

  let calUsername: string | null = null;
  let calTimezone: string | null = null;
  try {
    const me = await getCalMeProfileWithToken(tokens.access_token);
    calUsername = me.username;
    calTimezone = me.timeZone ? canonicalizeTimezone(me.timeZone) : null;
  } catch {
    // Profile fetch is best-effort — tokens are already persisted.
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    cal_oauth_access_encrypted: store.accessEncrypted,
    cal_oauth_refresh_encrypted: store.refreshEncrypted,
    cal_oauth_expires_at: store.expiresAt,
    cal_oauth_scope: store.scope,
    cal_auth_mode: "oauth",
    cal_api_key_encrypted: null,
  };
  if (calUsername) update.cal_username = calUsername;
  if (calTimezone) update.timezone = calTimezone;

  await admin.from("workspaces").update(update).eq("id", auth.workspaceId);

  const redirect = new URL(state.returnTo, request.url);
  redirect.searchParams.set("cal_oauth_ok", "1");
  return NextResponse.redirect(redirect);
}
