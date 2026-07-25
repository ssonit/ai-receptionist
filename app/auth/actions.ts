"use server";

import { redirect } from "next/navigation";
import {
  AUTH_ERROR_CODE,
  authErrorMessage,
  formatAuthError,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

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

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: formatAuthError(error, "signIn") };
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
