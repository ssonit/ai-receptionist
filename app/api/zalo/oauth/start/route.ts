import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildZaloOAuthUrl, validateZaloEnv } from "@/lib/zalo";
import { createPkcePair, resolveZaloRedirectUri } from "@/lib/zalo-oauth";
import {
  createOAuthState,
  STATE_TTL_MS,
  ZALO_OAUTH_STATE_COOKIE,
} from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { assertWorkspaceFeature, PLAN_FEATURE } from "@/lib/plan-features";
import { appErrorMessage, isAppError, APP_ERROR_CODE } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

export async function GET(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    await assertWorkspaceFeature(auth.workspaceId, PLAN_FEATURE.ZALO);
  } catch (error) {
    if (isAppError(error, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)) {
      return NextResponse.json(
        { error: appErrorMessage(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED) },
        { status: 403 },
      );
    }
    throw error;
  }

  try {
    validateZaloEnv();
  } catch {
    return NextResponse.json(
      { error: appErrorMessage(APP_ERROR_CODE.ZALO_NOT_CONFIGURED) },
      { status: 500 },
    );
  }

  const redirectUri = resolveZaloRedirectUri(request.url);
  if (!redirectUri) {
    return NextResponse.json(
      { error: appErrorMessage(APP_ERROR_CODE.ZALO_NOT_CONFIGURED) },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? ROUTES.DASHBOARD_SETTINGS;

  const { verifier, challenge } = createPkcePair();
  const { token } = createOAuthState(auth.workspaceId, returnTo, verifier);

  const cookieStore = await cookies();
  cookieStore.set(ZALO_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(STATE_TTL_MS / 1000),
  });

  return NextResponse.redirect(buildZaloOAuthUrl(token, challenge, redirectUri));
}

