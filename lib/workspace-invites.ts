import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceRole = "owner" | "staff";

export type WorkspaceInviteRow = {
  id: string;
  email: string | null;
  token: string;
  role: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

export type WorkspaceMemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: WorkspaceRole;
  created_at: string;
};

export function invitePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`;
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

/** Default invite TTL: 14 days. */
export function inviteExpiresAt(from = new Date()): string {
  return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
}

export async function requireOwnerWorkspace(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; workspaceId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "sign_in_required" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { ok: false, error: "no_workspace" };
  }
  if (profile.role !== "owner") {
    return { ok: false, error: "owner_required" };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    workspaceId: profile.workspace_id as string,
  };
}

export async function listWorkspaceMembers(
  workspaceId: string,
): Promise<WorkspaceMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as WorkspaceMemberRow[];
}

export async function listPendingInvites(
  workspaceId: string,
): Promise<WorkspaceInviteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, email, token, role, expires_at, accepted_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WorkspaceInviteRow[];
}

export type InvitePreview =
  | {
      ok: true;
      workspaceName: string;
      email: string | null;
      role: string;
      expiresAt: string;
    }
  | { ok: false; error: string };

export async function getInvitePreview(token: string): Promise<InvitePreview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_workspace_invite_preview", {
    p_token: token.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const row = data as Record<string, unknown> | null;
  if (!row || row.ok !== true) {
    return {
      ok: false,
      error: String(row?.error ?? "not_found"),
    };
  }

  return {
    ok: true,
    workspaceName: String(row.workspaceName ?? "Workspace"),
    email: typeof row.email === "string" ? row.email : null,
    role: String(row.role ?? "staff"),
    expiresAt: String(row.expiresAt ?? ""),
  };
}
