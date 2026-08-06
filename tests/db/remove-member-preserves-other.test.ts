/**
 * remove_workspace_member must drop exactly one membership and leave the
 * rest intact (spec acceptance #9). Runs against local Postgres.
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

describe.skipIf(!dbUp)("remove_workspace_member preserves other memberships", () => {
  it("keeps the invitee's own workspace after removal from a second one", async () => {
    const admin = createAdminClient();

    const inviteeId = await insertAuthUserRaw({
      email: `${uniq("invitee")}@example.com`,
      appMetaData: { provider: "email", providers: ["email"] },
      userMetaData: { full_name: "Two Space User" },
    });
    createdUserIds.push(inviteeId);

    const { data: inviteeProfile } = await admin
      .from("profiles")
      .select("workspace_id")
      .eq("id", inviteeId)
      .single();
    const ownWorkspaceId = inviteeProfile!.workspace_id as string;
    createdWorkspaceIds.push(ownWorkspaceId);

    const ownerId = await insertAuthUserRaw({
      email: `${uniq("owner")}@example.com`,
      appMetaData: { provider: "email", providers: ["email"] },
      userMetaData: { full_name: "Host Owner" },
    });
    createdUserIds.push(ownerId);

    const { data: ownerProfile } = await admin
      .from("profiles")
      .select("workspace_id")
      .eq("id", ownerId)
      .single();
    const hostWorkspaceId = ownerProfile!.workspace_id as string;
    createdWorkspaceIds.push(hostWorkspaceId);

    await admin.from("workspace_members").insert({
      user_id: inviteeId,
      workspace_id: hostWorkspaceId,
      role: "staff",
    });
    // Last-used points at the host so remove_workspace_member (which reads
    // profiles.workspace_id as the active workspace for the caller) is not
    // what we are probing here — the owner removes; invitee's last-used is
    // the host so the profile rewrite path runs.
    await admin
      .from("profiles")
      .update({ workspace_id: hostWorkspaceId, role: "staff" })
      .eq("id", inviteeId);

    const result = await withUser(ownerId, async (run) => {
      const [rpc] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.remove_workspace_member($1) as result",
        [inviteeId],
      );
      // Owner RLS cannot see the invitee's other workspace. Drop back to the
      // pool role (superuser) for the post-condition read; still rolled back.
      await run("reset role");
      const memberships = await run<{ workspace_id: string; role: string }>(
        "select workspace_id, role from public.workspace_members where user_id = $1",
        [inviteeId],
      );
      const [profile] = await run<{ workspace_id: string | null; role: string }>(
        "select workspace_id, role from public.profiles where id = $1",
        [inviteeId],
      );
      return { rpc: rpc.result, memberships, profile };
    });

    expect(result.rpc.ok).toBe(true);
    expect(result.memberships).toHaveLength(1);
    expect(result.memberships[0].workspace_id).toBe(ownWorkspaceId);
    expect(result.memberships[0].role).toBe("owner");
    expect(result.profile.workspace_id).toBe(ownWorkspaceId);
    expect(result.profile.role).toBe("owner");
  });
});
