/**
 * The four membership-writing SQL functions must keep workspace_members and
 * the legacy profiles columns in agreement. Runs against local Postgres.
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

async function newUser(email: string) {
  const userId = await insertAuthUserRaw({
    email,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: "Dual Write Test" },
  });
  createdUserIds.push(userId);
  return userId;
}

/** Read both sources for a user and return them side by side. */
async function readBoth(userId: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_id, role")
    .eq("id", userId)
    .maybeSingle();
  const { data: members } = await admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);
  return { profile, members: members ?? [] };
}

/** An owner with their own workspace, plus a staff member who joined by invite. */
async function seedOwnerAndStaff() {
  const admin = createAdminClient();

  const ownerId = await newUser(`${uniq("owner")}@example.com`);
  const { profile: ownerProfile } = await readBoth(ownerId);
  const workspaceId = ownerProfile!.workspace_id as string;
  createdWorkspaceIds.push(workspaceId);

  const staffEmail = `${uniq("staff")}@example.com`;
  const token = uniq("token-bbbbbbbb");
  await admin.from("workspace_invites").insert({
    workspace_id: workspaceId,
    email: staffEmail,
    token,
    role: "staff",
    invited_by: ownerId,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });

  const staffId = await insertAuthUserRaw({
    email: staffEmail,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: "Staff", invite_token: token },
  });
  createdUserIds.push(staffId);

  return { ownerId, staffId, workspaceId };
}

describe.skipIf(!dbUp)("membership dual-write", () => {
  it("handle_new_user creates a membership for a fresh owner signup", async () => {
    const userId = await newUser(`${uniq("owner")}@example.com`);

    const { profile, members } = await readBoth(userId);
    createdWorkspaceIds.push(profile!.workspace_id as string);

    expect(members).toHaveLength(1);
    expect(members[0].workspace_id).toBe(profile!.workspace_id);
    expect(members[0].role).toBe("owner");
    expect(profile!.role).toBe("owner");
  });

  it("handle_new_user creates a staff membership when joining by invite token", async () => {
    const admin = createAdminClient();
    const inviterEmail = `${uniq("inviter")}@example.com`;
    const inviterId = await newUser(inviterEmail);
    const { profile: inviterProfile } = await readBoth(inviterId);
    const workspaceId = inviterProfile!.workspace_id as string;
    createdWorkspaceIds.push(workspaceId);

    const inviteeEmail = `${uniq("invitee")}@example.com`;
    const token = uniq("token-aaaaaaaa");
    await admin.from("workspace_invites").insert({
      workspace_id: workspaceId,
      email: inviteeEmail,
      token,
      role: "staff",
      invited_by: inviterId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const inviteeId = await insertAuthUserRaw({
      email: inviteeEmail,
      appMetaData: { provider: "email", providers: ["email"] },
      userMetaData: { full_name: "Invited Staff", invite_token: token },
    });
    createdUserIds.push(inviteeId);

    const { profile, members } = await readBoth(inviteeId);
    expect(profile!.workspace_id).toBe(workspaceId);
    expect(members).toHaveLength(1);
    expect(members[0].workspace_id).toBe(workspaceId);
    expect(members[0].role).toBe("staff");
  });

  it("remove_workspace_member deletes the membership as well as clearing the profile", async () => {
    const { ownerId, staffId } = await seedOwnerAndStaff();

    // The RPC reads auth.uid(), so it must be called as the owner rather than
    // through the service-role client (which has no auth.uid() at all). The
    // transaction is rolled back, so the writes are read back inside it.
    const result = await withUser(ownerId, async (run) => {
      const [rpc] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.remove_workspace_member($1) as result",
        [staffId],
      );
      const members = await run(
        "select workspace_id from public.workspace_members where user_id = $1",
        [staffId],
      );
      const visibleProfiles = await run(
        "select id from public.profiles where id = $1",
        [staffId],
      );
      return { rpc: rpc.result, members, visibleProfiles };
    });

    expect(result.rpc.ok).toBe(true);
    expect(result.members).toHaveLength(0);
    // Removal also drops them out of the teammate policy's reach.
    expect(result.visibleProfiles).toHaveLength(0);
  });

  it("transfer_workspace_ownership swaps the role in both tables", async () => {
    const { ownerId, staffId, workspaceId } = await seedOwnerAndStaff();

    const result = await withUser(ownerId, async (run) => {
      const [rpc] = await run<{ result: { ok?: boolean; error?: string } }>(
        "select public.transfer_workspace_ownership($1) as result",
        [staffId],
      );
      const members = await run<{ user_id: string; role: string }>(
        "select user_id, role from public.workspace_members where workspace_id = $1 order by role",
        [workspaceId],
      );
      const profiles = await run<{ id: string; role: string }>(
        "select id, role from public.profiles where workspace_id = $1 order by role",
        [workspaceId],
      );
      return { rpc: rpc.result, members, profiles };
    });

    expect(result.rpc.ok).toBe(true);

    const memberRole = new Map(result.members.map((m) => [m.user_id, m.role]));
    expect(memberRole.get(staffId)).toBe("owner");
    expect(memberRole.get(ownerId)).toBe("staff");

    const profileRole = new Map(result.profiles.map((p) => [p.id, p.role]));
    expect(profileRole.get(staffId)).toBe("owner");
    expect(profileRole.get(ownerId)).toBe("staff");
  });

  it("keeps profiles.role and workspace_members.role equal for every user", async () => {
    const admin = createAdminClient();
    const userId = await newUser(`${uniq("parity")}@example.com`);
    const { profile } = await readBoth(userId);
    // Only ever queue this test's own workspace for cleanup. Queuing every
    // workspace found below would delete seed.sql's Eve Pilot in afterEach.
    createdWorkspaceIds.push(profile!.workspace_id as string);

    const { data: rows } = await admin
      .from("profiles")
      .select("id, workspace_id, role")
      .not("workspace_id", "is", null);
    const { data: members } = await admin
      .from("workspace_members")
      .select("user_id, workspace_id, role");

    const byKey = new Map(
      (members ?? []).map((m) => [`${m.user_id}:${m.workspace_id}`, m.role]),
    );
    for (const r of rows ?? []) {
      expect(byKey.get(`${r.id}:${r.workspace_id}`)).toBe(r.role);
    }
  });
});
