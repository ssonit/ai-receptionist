/**
 * Proves the tenant policies source membership from workspace_members rather
 * than profiles, and that cross-workspace isolation still holds.
 *
 * The first test creates a state the dual-writing RPCs would never produce
 * (profiles and workspace_members disagreeing) precisely because that is the
 * only way to observe which table the policies actually read.
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

function uniq(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Bare workspace with one lead in it, owned by nobody in particular. */
async function seedWorkspaceWithLead(label: string) {
  const admin = createAdminClient();
  const { data: ws } = await admin
    .from("workspaces")
    .insert({ name: label, slug: uniq(label.toLowerCase()) })
    .select("id")
    .single();
  const workspaceId = ws!.id as string;
  createdWorkspaceIds.push(workspaceId);

  await admin.from("leads").insert({
    workspace_id: workspaceId,
    full_name: `${label} Lead`,
    phone: "0900000000",
  });

  return workspaceId;
}

/** A user whose profile and membership can be pointed at different workspaces. */
async function seedUser(profileWorkspaceId: string, memberWorkspaceId: string) {
  const admin = createAdminClient();
  const userId = await insertAuthUserRaw({
    email: `${uniq("rls")}@example.com`,
    appMetaData: { provider: "email", providers: ["email"] },
    userMetaData: { full_name: "RLS Probe" },
  });
  createdUserIds.push(userId);

  const { data: profile } = await admin
    .from("profiles")
    .select("workspace_id")
    .eq("id", userId)
    .single();
  createdWorkspaceIds.push(profile!.workspace_id as string);

  await admin.from("profiles").update({ workspace_id: profileWorkspaceId, role: "owner" }).eq("id", userId);
  await admin.from("workspace_members").delete().eq("user_id", userId);
  await admin
    .from("workspace_members")
    .insert({ user_id: userId, workspace_id: memberWorkspaceId, role: "owner" });

  return userId;
}

describe.skipIf(!dbUp)("RLS sources membership from workspace_members", () => {
  it("honours workspace_members, not profiles.workspace_id", async () => {
    const alpha = await seedWorkspaceWithLead("Alpha");
    const bravo = await seedWorkspaceWithLead("Bravo");
    // Profile says Alpha; membership says Bravo. Policies must follow Bravo.
    const userId = await seedUser(alpha, bravo);

    const rows = await queryAsUser<{ workspace_id: string }>(
      userId,
      "select workspace_id from public.leads",
    );

    expect(rows.map((r) => r.workspace_id)).toEqual([bravo]);
  });

  it("shows a member only their own workspace's leads", async () => {
    const alpha = await seedWorkspaceWithLead("Alpha");
    const bravo = await seedWorkspaceWithLead("Bravo");
    const userId = await seedUser(alpha, alpha);

    const rows = await queryAsUser<{ workspace_id: string }>(
      userId,
      "select workspace_id from public.leads",
    );

    expect(rows.map((r) => r.workspace_id)).toEqual([alpha]);
    expect(rows.map((r) => r.workspace_id)).not.toContain(bravo);
  });

  it("isolates bookings, notifications and workspaces the same way", async () => {
    const admin = createAdminClient();
    const alpha = await seedWorkspaceWithLead("Alpha");
    const bravo = await seedWorkspaceWithLead("Bravo");
    const userId = await seedUser(alpha, alpha);

    await admin.from("notifications").insert([
      { workspace_id: alpha, type: "lead_new", title: "Alpha note", body: "", severity: "low" },
      { workspace_id: bravo, type: "lead_new", title: "Bravo note", body: "", severity: "low" },
    ]);

    // bookings requires guest_name, guest_email and start_time (all NOT NULL).
    const startTime = new Date(Date.now() + 86_400_000).toISOString();
    await admin.from("bookings").insert([
      { workspace_id: alpha, guest_name: "Alpha Guest", guest_email: "alpha@example.com", start_time: startTime },
      { workspace_id: bravo, guest_name: "Bravo Guest", guest_email: "bravo@example.com", start_time: startTime },
    ]);

    const notes = await queryAsUser<{ title: string }>(
      userId,
      "select title from public.notifications",
    );
    expect(notes.map((n) => n.title)).toEqual(["Alpha note"]);

    const bookings = await queryAsUser<{ guest_name: string }>(
      userId,
      "select guest_name from public.bookings",
    );
    expect(bookings.map((b) => b.guest_name)).toEqual(["Alpha Guest"]);

    const workspaces = await queryAsUser<{ id: string }>(
      userId,
      "select id from public.workspaces",
    );
    expect(workspaces.map((w) => w.id)).toEqual([alpha]);
  });

  it("scopes invite reads to workspaces the caller owns", async () => {
    const admin = createAdminClient();
    const alpha = await seedWorkspaceWithLead("Alpha");
    const bravo = await seedWorkspaceWithLead("Bravo");
    const ownerId = await seedUser(alpha, alpha);

    await admin.from("workspace_invites").insert([
      {
        workspace_id: alpha,
        email: `${uniq("a")}@example.com`,
        token: uniq("token-alpha-aa"),
        role: "staff",
        invited_by: ownerId,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
      {
        workspace_id: bravo,
        email: `${uniq("b")}@example.com`,
        token: uniq("token-bravo-bb"),
        role: "staff",
        invited_by: ownerId,
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      },
    ]);

    const invites = await queryAsUser<{ workspace_id: string }>(
      ownerId,
      "select workspace_id from public.workspace_invites",
    );

    expect(invites.map((i) => i.workspace_id)).toEqual([alpha]);
  });

  it("hides invites entirely from a staff member", async () => {
    const admin = createAdminClient();
    const alpha = await seedWorkspaceWithLead("Alpha");
    const staffId = await seedUser(alpha, alpha);
    // Demote to staff in both places, mirroring the dual-write invariant.
    await admin.from("profiles").update({ role: "staff" }).eq("id", staffId);
    await admin.from("workspace_members").update({ role: "staff" }).eq("user_id", staffId);

    await admin.from("workspace_invites").insert({
      workspace_id: alpha,
      email: `${uniq("s")}@example.com`,
      token: uniq("token-staff-cc"),
      role: "staff",
      invited_by: staffId,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
    });

    const invites = await queryAsUser(
      staffId,
      "select workspace_id from public.workspace_invites",
    );

    expect(invites).toHaveLength(0);
  });
});
