"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<{ error?: string } | void> {
  const id = workspaceId.trim();
  if (!id) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  // The authorization check. Never trust the id coming from the client: it is
  // only accepted if the caller genuinely has a membership row for it.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", id)
    .maybeSingle();

  if (!membership) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Remember it as last-used so the choice survives losing the cookie.
  await supabase.from("profiles").update({ workspace_id: id }).eq("id", user.id);

  revalidatePath(DASHBOARD_PATH.root, "layout");
}
