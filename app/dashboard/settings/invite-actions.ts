"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appOrigin } from "@/lib/app-origin";
import {
  sendTransactionalEmail,
  workspaceInviteEmailCopy,
} from "@/lib/email";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
} from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
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
    case "already_member":
      return appErrorMessage(APP_ERROR_CODE.INVITE_ALREADY_MEMBER);
    case "cannot_remove_owner":
      return appErrorMessage(APP_ERROR_CODE.CANNOT_REMOVE_OWNER);
    case "owner_required":
      return appErrorMessage(APP_ERROR_CODE.OWNER_REQUIRED);
    default:
      return appErrorMessage(APP_ERROR_CODE.INVITE_ACCEPT_FAILED);
  }
}

async function sendInviteEmail(input: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  userId: string;
  workspaceId: string;
  email: string;
  token: string;
}): Promise<boolean> {
  const [{ data: workspace }, { data: inviter }] = await Promise.all([
    input.supabase
      .from("workspaces")
      .select("name, agent_reply_locale")
      .eq("id", input.workspaceId)
      .maybeSingle(),
    input.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", input.userId)
      .maybeSingle(),
  ]);

  const origin = appOrigin();
  const acceptUrl = `${origin}${invitePath(input.token)}`;
  const locale = workspace?.agent_reply_locale === "vi" ? "vi" : "en";

  const copy = workspaceInviteEmailCopy({
    locale,
    workspaceName: workspace?.name ?? "Eve workspace",
    inviterName: inviter?.full_name?.trim() || inviter?.email || null,
    acceptUrl,
  });

  const result = await sendTransactionalEmail({
    to: input.email,
    subject: copy.subject,
    html: copy.html,
    text: copy.text,
    locale,
  });

  if (result.ok) {
    const admin = createAdminClient();
    await admin
      .from("workspace_invites")
      .update({ last_sent_at: new Date().toISOString() })
      .eq("token", input.token);
  }

  return result.ok;
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

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_EMAIL_REQUIRED) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

  const sent = await sendInviteEmail({
    supabase: auth.supabase,
    userId: auth.userId,
    workspaceId: auth.workspaceId,
    email,
    token,
  });

  revalidatePath("/dashboard/settings");
  return {
    success: sent ? `Invite sent to ${email}.` : undefined,
    error: sent ? undefined : appErrorMessage(APP_ERROR_CODE.INVITE_SEND_FAILED),
    inviteUrl: invitePath(token),
  };
}

export async function resendWorkspaceInvite(
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

  const { data: invite } = await auth.supabase
    .from("workspace_invites")
    .select("id, email, token, last_sent_at, accepted_at, expires_at")
    .eq("id", inviteId.trim())
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();

  if (!invite || invite.accepted_at) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_INVALID) };
  }
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_EXPIRED) };
  }
  if (
    invite.last_sent_at &&
    Date.now() - new Date(invite.last_sent_at).getTime() < 60_000
  ) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_RESEND_TOO_SOON) };
  }

  const sent = await sendInviteEmail({
    supabase: auth.supabase,
    userId: auth.userId,
    workspaceId: auth.workspaceId,
    email: invite.email as string,
    token: invite.token as string,
  });

  if (!sent) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVITE_SEND_FAILED) };
  }

  revalidatePath("/dashboard/settings");
  return { success: `Invite resent to ${invite.email}.` };
}

export async function removeWorkspaceMember(
  userId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data, error } = await supabase.rpc("remove_workspace_member", {
    p_user_id: userId.trim(),
  });

  if (error) {
    return { error: formatDbError(error, APP_ERROR_CODE.MEMBER_REMOVE_FAILED) };
  }
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    return { error: mapAcceptError(String(row?.error ?? "member_remove_failed")) };
  }

  revalidatePath("/dashboard/settings");
  return { success: "Member removed." };
}

export async function transferWorkspaceOwnership(
  userId: string,
): Promise<{ error?: string; success?: string }> {
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data, error } = await supabase.rpc("transfer_workspace_ownership", {
    p_to_user_id: userId.trim(),
  });

  if (error) {
    return {
      error: formatDbError(error, APP_ERROR_CODE.OWNERSHIP_TRANSFER_FAILED),
    };
  }
  const row = data as { ok?: boolean; error?: string } | null;
  if (!row?.ok) {
    return {
      error: mapAcceptError(String(row?.error ?? "ownership_transfer_failed")),
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { success: "Ownership transferred. You are now staff." };
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
