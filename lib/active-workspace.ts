import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceRole, type WorkspaceRole } from "@/lib/workspace-roles";

/**
 * Which workspace the dashboard is currently showing.
 *
 * Named in full rather than following the terse guest cookie `eve_w`, so the
 * two are not mistaken for one another: `eve_w` is the public booking tenant,
 * this is the operator's active workspace.
 */
export const ACTIVE_WORKSPACE_COOKIE = "eve_active_workspace";

export type WorkspaceMembership = {
  workspaceId: string;
  role: WorkspaceRole;
};

export type MyWorkspace = {
  id: string;
  name: string;
  slug: string | null;
  role: WorkspaceRole;
};

export type ActiveWorkspace = {
  workspaceId: string;
  role: WorkspaceRole;
  memberships: WorkspaceMembership[];
};

/**
 * Decide which workspace is active. Pure — all IO happens in the callers.
 *
 * Security rule: the result is always one of `memberships`, so a forged or
 * stale cookie can never widen access. Preference order is cookie, then the
 * last-used workspace from `profiles.workspace_id`, then the first membership.
 */
export function pickActiveWorkspace(
  cookieValue: string | null | undefined,
  lastUsedWorkspaceId: string | null | undefined,
  memberships: readonly WorkspaceMembership[],
): WorkspaceMembership | null {
  if (memberships.length === 0) return null;

  const byId = new Map(memberships.map((m) => [m.workspaceId, m]));

  const fromCookie = cookieValue?.trim();
  if (fromCookie) {
    const hit = byId.get(fromCookie);
    if (hit) return hit;
  }

  const lastUsed = lastUsedWorkspaceId?.trim();
  if (lastUsed) {
    const hit = byId.get(lastUsed);
    if (hit) return hit;
  }

  return memberships[0];
}

/**
 * Resolve the caller's active workspace.
 *
 * `.eq("user_id", user.id)` is not optional: the workspace_members select
 * policy also exposes teammates' rows (that is what powers Settings -> Team),
 * so without it a user would be handed their colleagues' memberships as their
 * own.
 */
export async function getActiveWorkspace(): Promise<ActiveWorkspace | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null;

  const [membersResult, profileResult] = await Promise.all([
    supabase
      .from("workspace_members")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("profiles")
      .select("workspace_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const memberships: WorkspaceMembership[] = (membersResult.data ?? [])
    .filter((row) => isWorkspaceRole(row.role))
    .map((row) => ({
      workspaceId: row.workspace_id as string,
      role: row.role as WorkspaceRole,
    }));

  const picked = pickActiveWorkspace(
    cookieValue,
    (profileResult.data?.workspace_id as string | null) ?? null,
    memberships,
  );
  if (!picked) return null;

  return { workspaceId: picked.workspaceId, role: picked.role, memberships };
}

/** The caller's workspaces with display names, for the switcher. */
export async function listMyWorkspaces(): Promise<MyWorkspace[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name, slug)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[active-workspace] listMyWorkspaces failed", error.message);
    return [];
  }

  return (data ?? [])
    .filter((row) => isWorkspaceRole(row.role))
    .map((row) => {
      // PostgREST returns a single object for a many-to-one embed but an array
      // when the relationship is inferred as to-many. Accept both — proxy.ts
      // already carries this same guard for profiles -> workspaces.
      const rel = row.workspaces as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined;
      const ws = (Array.isArray(rel) ? rel[0] : rel) ?? undefined;

      return {
        id: row.workspace_id as string,
        name: (ws?.name as string) || "Workspace",
        slug: (ws?.slug as string | null) ?? null,
        role: row.role as WorkspaceRole,
      };
    });
}
