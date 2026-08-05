/**
 * handle_new_user's OAuth invite email-fallback. Runs against local Postgres
 * (`npx supabase start`). Skipped when no database is reachable.
 *
 * The OAuth signup is created via a direct INSERT into auth.users (see
 * tests/helpers/raw-pg.ts) rather than the Admin API's createUser(), because
 * createUser() always writes raw_app_meta_data.provider = "email" on the
 * initial INSERT and only applies a caller-supplied app_metadata.provider via
 * a later UPDATE — which the `after insert on auth.users` trigger being
 * tested here never observes (supabase/auth#975, supabase/auth#1280). The
 * password-signup path below is unaffected by that quirk and still uses
 * createUser(), matching how password signups really happen.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { closeRawPgPool, insertAuthUserRaw } from "./helpers/raw-pg";

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
    await admin.auth.admin.deleteUser(id); // cascades to profiles (on delete cascade)
  }
  for (const id of createdWorkspaceIds.splice(0)) {
    await admin.from("workspaces").delete().eq("id", id);
  }
});

afterAll(async () => {
  if (!dbUp) return;
  await closeRawPgPool();
});

async function seedInvite(email: string) {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .insert({ name: "OAuth Invite Test WS", slug: `oauth-invite-test-${Date.now()}` })
    .select("id")
    .single();
  const workspaceId = ws!.id as string;
  createdWorkspaceIds.push(workspaceId);

  await admin.from("workspace_invites").insert({
    workspace_id: workspaceId,
    email,
    token: `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: "staff",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });

  return workspaceId;
}

/**
 * Direct INSERT into auth.users with raw_app_meta_data.provider already
 * "google" — see the header comment for why this can't go through
 * admin.auth.admin.createUser().
 */
async function createOAuthUser(email: string) {
  const userId = await insertAuthUserRaw({
    email,
    appMetaData: { provider: "google", providers: ["google"] },
    userMetaData: { full_name: "Test Google User" },
  });
  createdUserIds.push(userId);
  return userId;
}

async function createPasswordUser(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "test-password-not-used-123",
    email_confirm: true,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Test Password User" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  createdUserIds.push(data.user.id);
  return data.user.id;
}

describe.skipIf(!dbUp)("handle_new_user OAuth invite fallback", () => {
  it("joins a brand-new Google signup to the invited workspace, no throwaway workspace", async () => {
    const admin = createAdminClient();
    const email = `oauth-invite-${Date.now()}@example.com`;
    const invitedWorkspaceId = await seedInvite(email);

    const userId = await createOAuthUser(email);

    const { data: profile } = await admin
      .from("profiles")
      .select("workspace_id, role")
      .eq("id", userId)
      .single();

    expect(profile?.workspace_id).toBe(invitedWorkspaceId);
    expect(profile?.role).toBe("staff");

    const { data: invites } = await admin
      .from("workspace_invites")
      .select("accepted_at")
      .eq("workspace_id", invitedWorkspaceId);
    expect(invites?.[0]?.accepted_at).not.toBeNull();

    // No throwaway workspace was created for this user — only the one we seeded.
    const { data: allWs } = await admin
      .from("workspaces")
      .select("id")
      .eq("name", "OAuth Invite Test WS");
    expect(allWs?.length).toBe(1);
  });

  it("takes the normal owner path when there is no matching invite", async () => {
    const admin = createAdminClient();
    const email = `oauth-no-invite-${Date.now()}@example.com`;

    const userId = await createOAuthUser(email);

    const { data: profile } = await admin
      .from("profiles")
      .select("workspace_id, role")
      .eq("id", userId)
      .single();

    expect(profile?.role).toBe("owner");
    expect(profile?.workspace_id).toBeTruthy();
    createdWorkspaceIds.push(profile!.workspace_id as string);
  });

  it("does not auto-join a password signup even with a matching invite (provider must not be email)", async () => {
    const admin = createAdminClient();
    const email = `password-invite-${Date.now()}@example.com`;
    const invitedWorkspaceId = await seedInvite(email);

    const userId = await createPasswordUser(email);

    const { data: profile } = await admin
      .from("profiles")
      .select("workspace_id, role")
      .eq("id", userId)
      .single();

    // Owner path, NOT the invited workspace — password signups are
    // unaffected by this migration (they already pass invite_token
    // explicitly via signUp()'s `data` option when the user opts in).
    expect(profile?.workspace_id).not.toBe(invitedWorkspaceId);
    expect(profile?.role).toBe("owner");
    createdWorkspaceIds.push(profile!.workspace_id as string);

    // The invite is untouched.
    const { data: invites } = await admin
      .from("workspace_invites")
      .select("accepted_at")
      .eq("workspace_id", invitedWorkspaceId);
    expect(invites?.[0]?.accepted_at).toBeNull();
  });
});
