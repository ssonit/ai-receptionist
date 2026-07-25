"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
} from "@/lib/errors";
import {
  generateInviteToken,
  inviteExpiresAt,
  invitePath,
  requireOwnerWorkspace,
} from "@/lib/workspace-invites";

export type InviteActionState = {
  error?: string;
  success?: string;
  inviteUrl?: string;
};

function mapAcceptError(code: string): string {
  switch (code) {
    case "sign_in_required":
      return appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED);
    case "not_found":
    case "invalid_token":
      return appErrorMessage(APP_ERROR_CODE.INVITE_INVALID);
    case "expired":
      return appErrorMessage(APP_ERROR_CODE.INVITE_EXPIRED);
    case "already_accepted":
      return appErrorMessage(APP_ERROR_CODE.INVITE_ACCEPTED);
    case "email_mismatch":
      return appErrorMessage(APP_ERROR_CODE.INVITE_EMAIL_MISMATCH);
    case "already_in_workspace":
      return appErrorMessage(APP_ERROR_CODE.INVITE_ALREADY_IN_WORKSPACE);
    default:
      return appErrorMessage(APP_ERROR_CODE.INVITE_ACCEPT_FAILED);
  }
}

export async function createWorkspaceInvite(
  _prev: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return {
      error:
        auth.error === "owner_required"
          ? appErrorMessage(APP_ERROR_CODE.OWNER_REQUIRED)
          : auth.error === "no_workspace"
            ? appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE)
            : appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED),
    };
  }

  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = emailRaw || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const token = generateInviteToken();
  const { error } = await auth.supabase.from("workspace_invites").insert({
    workspace_id: auth.workspaceId,
    email,
    token,
    role: "staff",
    invited_by: auth.userId,
    expires_at: inviteExpiresAt(),
  });

  if (error) {
    return { error: formatDbError(error, APP_ERROR_CODE.INVITE_CREATE_FAILED) };
  }

  revalidatePath("/dashboard/settings");
  return {
    success: email
      ? `Invite created for ${email}.`
      : "Invite link created.",
    inviteUrl: invitePath(token),
  };
}

export async function revokeWorkspaceInvite(
  inviteId: string,
): Promise<{ error?: string; success?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return {
      error:
        auth.error === "owner_required"
          ? appErrorMessage(APP_ERROR_CODE.OWNER_REQUIRED)
          : appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED),
    };
  }

  const id = inviteId.trim();
  if (!id) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const { error } = await auth.supabase
    .from("workspace_invites")
    .delete()
    .eq("id", id)
    .eq("workspace_id", auth.workspaceId);

  if (error) {
    return { error: formatDbError(error, APP_ERROR_CODE.INVITE_REVOKE_FAILED) };
  }

  revalidatePath("/dashboard/settings");
  return { success: "Invite revoked." };
}

export async function acceptWorkspaceInviteAction(
  token: string,
): Promise<{ error?: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_INVALID) };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  const { data, error } = await supabase.rpc("accept_workspace_invite", {
    p_token: trimmed,
  });

  if (error) {
    return { error: formatDbError(error, APP_ERROR_CODE.INVITE_ACCEPT_FAILED) };
  }

  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    return { error: mapAcceptError(String(row?.error ?? "accept_failed")) };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard");
}
