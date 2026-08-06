/**
 * accept_workspace_invite must add a second membership rather than refusing
 * anyone who already has a workspace — the dead end this whole project exists
 * to remove. Runs against local Postgres.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeRawPgPool, insertAuthUserRaw } from "../helpers/raw-pg";
import { withUser } from "../helpers/rls-client";

const dbUp = await (async () => {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("workspaces").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
})();

const createdUserIds: string[] = [];
const createdWorkspaceIds: string[] = [];

afterEach(async () => {
  if (!dbUp) return;
  const admin = createAdminClient();
  for (const id of createdUserIds.splice(0)) {
    await admin.auth.admin.deleteUser(id);
  }
  for (const id of createdWorkspaceIds.splice(0)) {
    await admin.from("workspaces").delete().eq("id", id);
  }
});

afterAll(async () => {
  if (!dbUp) return;
  await closeRawPgPool();
});

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A user who signed up on their own, so they already own a workspace. */
async function selfSignedUpUser() {
  const admin = createAdminClient();
  const email = `${uniq("self")}@example.com`;
  const userId = await insertAuthUserRaw({
    email,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: "Accidental Signup" },
  });
  createdUserIds.push(userId);

  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .single();
  const ownWorkspaceId = profile!.workspace_id as string;
  createdWorkspaceIds.push(ownWorkspaceId);

  return { userId, email, ownWorkspaceId };
}

/** A separate workspace with a pending invite addressed to `email`. */
async function workspaceInviting(email: string) {
  const admin = createAdminClient();
  const ownerId = await insertAuthUserRaw({
    email: `${uniq("owner")}@example.com`,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: "Inviting Owner" },
  });
  createdUserIds.push(ownerId);

  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_id")
    .eq("id", ownerId)
    .single();
  const workspaceId = profile!.workspace_id as string;
  createdWorkspaceIds.push(workspaceId);

  const token = uniq("token-invite-xx");
  await admin.from("workspace_invites").insert({
    workspace_id: workspaceId,
    email,
    token,
    role: "staff",
    invited_by: ownerId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });

  return { workspaceId, token };
}

describe.skipIf(!dbUp)("accept_workspace_invite with multi-workspace", () => {
  it("adds a second membership for someone who already has a workspace", async () => {
    const invitee = await selfSignedUpUser();
    const host = await workspaceInviting(invitee.email);

    const result = await withUser(invitee.userId, async (run) => {
      const [rpc] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.accept_workspace_invite($1) as result",
        [host.token],
      );
      const memberships = await run<{ workspace_id: string; role: string }>(
        "select workspace_id, role from public.workspace_members where user_id = $1 order by created_at",
        [invitee.userId],
      );
      return { rpc: rpc.result, memberships };
    });

    // The bug: this used to return { ok: false, error: 'already_in_workspace' }.
    expect(result.rpc.ok).toBe(true);
    expect(result.memberships).toHaveLength(2);

    const ids = result.memberships.map((m) => m.workspace_id);
    expect(ids).toContain(invitee.ownWorkspaceId);
    expect(ids).toContain(host.workspaceId);

    const roleFor = new Map(result.memberships.map((m) => [m.workspace_id, m.role]));
    expect(roleFor.get(invitee.ownWorkspaceId)).toBe("owner");
    expect(roleFor.get(host.workspaceId)).toBe("staff");
  });

  it("never returns already_in_workspace any more", async () => {
    const invitee = await selfSignedUpUser();
    const host = await workspaceInviting(invitee.email);

    const rpc = await withUser(invitee.userId, async (run) => {
      const [row] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.accept_workspace_invite($1) as result",
        [host.token],
      );
      return row.result;
    });

    expect(rpc.error).not.toBe("already_in_workspace");
  });

  it("still refuses a second acceptance of the same workspace", async () => {
    const admin = createAdminClient();
    const invitee = await selfSignedUpUser();
    const host = await workspaceInviting(invitee.email);

    // Create the second invite up front, through the service role. The
    // invitee joins as staff and the "Owners can create workspace invites"
    // policy would reject an insert made as them.
    const secondToken = uniq("token-second-yy");
    await admin.from("workspace_invites").insert({
      workspace_id: host.workspaceId,
      email: invitee.email,
      token: secondToken,
      role: "staff",
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    // Both accepts must happen inside ONE withUser call: the transaction is
    // rolled back at the end, so a membership created in a previous call
    // would not be visible here.
    const second = await withUser(invitee.userId, async (run) => {
      await run("select public.accept_workspace_invite($1)", [host.token]);
      const [row] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.accept_workspace_invite($1) as result",
        [secondToken],
      );
      return row.result;
    });

    expect(second.ok).not.toBe(true);
    expect(second.error).toBe("already_member");
  });

  it("still refuses an invite addressed to a different email", async () => {
    const invitee = await selfSignedUpUser();
    const host = await workspaceInviting(`${uniq("someone-else")}@example.com`);

    const rpc = await withUser(invitee.userId, async (run) => {
      const [row] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.accept_workspace_invite($1) as result",
        [host.token],
      );
      return row.result;
    });

    expect(rpc.ok).not.toBe(true);
    expect(rpc.error).toBe("email_mismatch");
  });
});
