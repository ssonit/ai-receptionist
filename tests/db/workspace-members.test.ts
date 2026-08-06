/**
 * workspace_members: backfill parity with profiles, and RLS on the membership
 * table itself. Runs against local Postgres (`npx supabase start`).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeRawPgPool, insertAuthUserRaw } from "../helpers/raw-pg";
import { queryAsUser } from "../helpers/rls-client";

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

/** A workspace with one owner user, created without going through signup. */
async function seedWorkspaceWithOwner(label: string) {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .insert({ name: label, slug: `${label.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })
    .select("id")
    .single();
  const workspaceId = ws!.id as string;
  createdWorkspaceIds.push(workspaceId);

  const userId = await insertAuthUserRaw({
    email: `${label.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: `${label} Owner` },
  });
  createdUserIds.push(userId);

  // insertAuthUserRaw fires handle_new_user, which creates its own workspace.
  // Repoint the profile at the workspace this test controls, and mirror that
  // into workspace_members the same way the trigger will once Task 2 lands.
  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .single();
  const autoWorkspaceId = profile!.workspace_id as string;

  await admin.from("profiles").update({ workspace_id: workspaceId, role: "owner" }).eq("id", userId);
  await admin.from("workspace_members").delete().eq("user_id", userId);
  await admin.from("workspace_members").insert({ user_id: userId, workspace_id: workspaceId, role: "owner" });
  await admin.from("workspaces").delete().eq("id", autoWorkspaceId);

  return { workspaceId, userId };
}

describe.skipIf(!dbUp)("workspace_members", () => {
  it("backfilled one membership per profile that has a workspace, with the same role", async () => {
    const admin = createAdminClient();

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, workspace_id, role")
      .not("workspace_id", "is", null);

    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id, workspace_id, role");

    const memberKey = new Map(
      (members ?? []).map((m) => [`${m.user_id}:${m.workspace_id}`, m.role]),
    );

    for (const p of profiles ?? []) {
      const key = `${p.id}:${p.workspace_id}`;
      expect(memberKey.has(key)).toBe(true);
      expect(memberKey.get(key)).toBe(p.role);
    }
  });

  it("lets a member read memberships of their own workspace", async () => {
    const a = await seedWorkspaceWithOwner("Alpha");

    const rows = await queryAsUser<{ user_id: string }>(
      a.userId,
      "select user_id from public.workspace_members",
    );

    expect(rows.map((r) => r.user_id)).toContain(a.userId);
  });

  it("hides another workspace's memberships", async () => {
    const a = await seedWorkspaceWithOwner("Alpha");
    const b = await seedWorkspaceWithOwner("Bravo");

    const rows = await queryAsUser<{ user_id: string }>(
      a.userId,
      "select user_id from public.workspace_members",
    );

    expect(rows.map((r) => r.user_id)).not.toContain(b.userId);
  });

  it("refuses a direct membership insert from an authenticated user", async () => {
    const a = await seedWorkspaceWithOwner("Alpha");
    const b = await seedWorkspaceWithOwner("Bravo");

    // No insert policy exists for `authenticated` — membership writes must go
    // through the security definer RPCs. Self-promotion into another
    // workspace has to fail.
    await expect(
      queryAsUser(
        a.userId,
        "insert into public.workspace_members (user_id, workspace_id, role) values ($1, $2, 'owner')",
        [a.userId, b.workspaceId],
      ),
    ).rejects.toThrow();
  });
});
