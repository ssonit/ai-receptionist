"use server";

import { redirect } from "next/navigation";
import {
  APP_ERROR_CODE,
  AUTH_ERROR_CODE,
  appErrorMessage,
  authErrorMessage,
  formatAuthError,
} from "@/lib/errors";
import { isPublicSignupOpen } from "@/lib/signup-mode";
import { createClient } from "@/lib/supabase/server";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { identifyUserServer, trackServer } from "@/lib/analytics-server";

export type AuthState = {
  error?: string;
  success?: string;
};

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();

  if (!email || !password) {
    return {
      error: authErrorMessage(AUTH_ERROR_CODE.EMAIL_PASSWORD_REQUIRED),
    };
  }
  if (password.length < 6) {
    return { error: authErrorMessage(AUTH_ERROR_CODE.WEAK_PASSWORD) };
  }
  if (!inviteToken && !isPublicSignupOpen()) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGNUP_CLOSED) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: inviteToken ? "staff" : "owner",
        // Temporary workspace label until setup wizard sets the business name.
        workspace_name: inviteToken ? undefined : fullName || undefined,
        ...(inviteToken ? { invite_token: inviteToken } : {}),
      },
    },
  });

  if (error) {
    return { error: formatAuthError(error, "signUp") };
  }

  if (data.user) {
    await identifyUserServer(data.user.id, {
      email: data.user.email,
      name: fullName,
    });
    await trackServer(ANALYTICS_EVENT.SIGNUP_COMPLETED, data.user.id, {
      isInvite: Boolean(inviteToken),
      plan: "starter",
    });
  }

  redirect(inviteToken ? "/dashboard" : "/dashboard/setup");
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return {
      error: authErrorMessage(AUTH_ERROR_CODE.EMAIL_PASSWORD_REQUIRED),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: formatAuthError(error, "signIn") };
  }

  if (data.user) {
    await identifyUserServer(data.user.id, {
      email: data.user.email,
    });
    await trackServer(ANALYTICS_EVENT.SIGNIN_COMPLETED, data.user.id);
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut(nextAfterLogin?: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // After sign-out, /login?next=… is safe — proxy only redirects authed users away from /login.
  if (nextAfterLogin?.startsWith("/")) {
    redirect(`/login?next=${encodeURIComponent(nextAfterLogin)}`);
  }
  redirect("/login");
}
