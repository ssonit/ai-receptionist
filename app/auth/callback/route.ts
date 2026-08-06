import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ERROR_CODE } from "@/lib/errors";
import {
  GOOGLE_INVITE_STATE_COOKIE,
  parseGoogleInviteState,
} from "@/lib/google-invite-state";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? ROUTES.DASHBOARD;
  // Same guard as signIn/signOut; also reject protocol-relative "//evil.com".
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : ROUTES.DASHBOARD;

  const cookieStore = await cookies();
  const inviteStateCookie = cookieStore.get(GOOGLE_INVITE_STATE_COOKIE)?.value;
  // Single-use: clear immediately, regardless of outcome.
  cookieStore.set(GOOGLE_INVITE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  if (!code) {
    return NextResponse.redirect(
      `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_FAILED}`,
    );
  }

  const supabase = await createClient();
  const { data: sessionData, error } =
    await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_FAILED}`,
    );
  }

  if (inviteStateCookie) {
    const state = parseGoogleInviteState(inviteStateCookie);
    if (state) {
      const { data, error: rpcError } = await supabase.rpc(
        "accept_workspace_invite",
        { p_token: state.inviteToken },
      );
      const row = rpcError
        ? null
        : (data as { ok?: boolean; error?: string } | null);
      const rpcSucceeded = row?.ok === true;
      // handle_new_user (Task 5) already joins a brand-new Google signup to the
      // invited workspace and stamps `accepted_at`, so this confirmation pass
      // gets "already_accepted" back, not ok — while a returning member of the
      // same workspace gets "already_member". Neither is a failure. Since
      // accept_workspace_invite is intentionally left untouched, membership is
      // confirmed here from the caller's own profile row instead.
      const maybeJoinedAlready =
        !rpcSucceeded &&
        (row?.error === "already_accepted" || row?.error === "already_member");
      let alreadyJoined = false;
      if (maybeJoinedAlready && sessionData?.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("workspace_id")
          .eq("id", sessionData.user.id)
          .maybeSingle();
        alreadyJoined = Boolean(profile?.workspace_id);
      }

      if (!rpcSucceeded && !alreadyJoined) {
        return NextResponse.redirect(
          `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_INVITE_INVALID}`,
        );
      }

      return NextResponse.redirect(`${origin}${state.next}`);
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
