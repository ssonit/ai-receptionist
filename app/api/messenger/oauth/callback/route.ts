import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  getPagesForUser,
  subscribePageToApp,
} from "@/lib/messenger";
import { resolveMessengerRedirectUri, persistMessengerTokens } from "@/lib/messenger-oauth";
import { OAUTH_STATE_COOKIE, parseOAuthState } from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  // Clear the state cookie immediately.
  cookieStore.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.redirect(
      new URL(`/login?error=${auth.error}`, request.url),
    );
  }

  const returnTo = "/dashboard/settings";
  const failure = (reason: string) => {
    const redirect = new URL(returnTo, request.url);
    redirect.searchParams.set("messenger_oauth_error", reason);
    return NextResponse.redirect(redirect);
  };

  if (error || !code) return failure("denied");

  if (!stateCookie) return failure("state_invalid");

  const state = parseOAuthState(stateCookie, auth.workspaceId);
  if (!state) return failure("state_invalid");

  const redirectUri = resolveMessengerRedirectUri(request.url);

  // 1. Exchange code → short-lived user token
  let userToken: string;
  try {
    userToken = await exchangeCodeForUserToken(code, redirectUri);
  } catch {
    return failure("exchange_failed");
  }

  // 2. Exchange for long-lived user token
  let longLivedToken: string;
  try {
    longLivedToken = await exchangeForLongLivedUserToken(userToken);
  } catch {
    return failure("exchange_failed");
  }

  // 3. List pages → pick first
  let pages;
  try {
    pages = await getPagesForUser(longLivedToken);
  } catch {
    return failure("page_list_failed");
  }

  if (pages.length === 0) return failure("no_pages");

  // Pick the first page (or let user choose v2)
  const page = pages[0];

  // 4. Subscribe the page to the app (best-effort). Non-fatal — the page can
  // be subscribed by hand in the Meta App dashboard.
  const subscribed = await subscribePageToApp(page.id, page.accessToken);
  if (!subscribed.ok) {
    console.error(
      `[messenger] page ${page.id} not subscribed to app: ${subscribed.error}`,
    );
  }

  // 5. Persist
  try {
    await persistMessengerTokens({
      workspaceId: auth.workspaceId,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.accessToken,
    });
  } catch {
    return failure("persist_failed");
  }

  const redirect = new URL(state.returnTo, request.url);
  redirect.searchParams.set("messenger_oauth_ok", "1");
  redirect.searchParams.set("messenger_page_name", page.name);
  return NextResponse.redirect(redirect);
}
