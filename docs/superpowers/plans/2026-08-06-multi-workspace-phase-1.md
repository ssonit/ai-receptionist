# Multi-workspace Phase 1 (invisible refactor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the authoritative source of workspace membership from the single `profiles.workspace_id` column to a `workspace_members` join table, without changing a single thing a user can see.

**Architecture:** Three migrations applied in a deliberate order that keeps every intermediate state working — (1) create the table, backfill it, add read helpers; (2) make the four membership-writing SQL functions write to *both* the new table and the legacy `profiles` columns; (3) only then repoint the 28 RLS policies at the new table. Reversing steps 2 and 3 would leave a window where a newly signed-up user has a `profiles` row but no membership row, and therefore no access to anything.

**Tech Stack:** Supabase Postgres (RLS, `security definer` functions, plpgsql triggers), Vitest with a `pg` connection for DB-integration tests.

Design rationale, rejected alternatives, and the Phase 2 outline live in [`docs/superpowers/specs/2026-08-06-multi-workspace-design.md`](../specs/2026-08-06-multi-workspace-design.md). Read it once before starting.

## Global Constraints

- **Phase 1 changes no behaviour.** Every user still has exactly one membership. No UI changes, no TypeScript changes, no new user-visible capability. If the app behaves differently after this plan, something is wrong.
- **`accept_workspace_invite` keeps rejecting `already_in_workspace` in this phase.** Removing that block is Phase 2's job and is what actually fixes the reported bug. Do not remove it here.
- **Migrations are new files only**, timestamped after `20260805000002`. Never edit an already-applied migration. Test with `npx supabase db reset`.
- **Every `security definer` function**: `set search_path = public`, matching every existing function in `supabase/migrations/`.
- **`createAdminClient()` uses the service-role key, which BYPASSES RLS.** No existing test in this repo exercises a policy. Task 1 adds the helper that makes RLS testable; use it for every RLS assertion in this plan.
- **`describe.skipIf(!dbUp)` makes a suite green while proving nothing.** Local Supabase must be running (`npx supabase start`). After every test run, confirm the count — "3 passed" not "3 skipped".
- **Do not touch guest-side tenancy**: `/b/[slug]`, the `eve_w` cookie, `resolveWorkspaceIdFromAgentContext`. Guests resolve tenants by slug and are unaffected.
- After each task: `graphify update .` before committing (note: the graph is currently corrupt and `graphify query` fails with `Graph.import: serialized node is missing its key` — if `update` also fails, say so in the commit and move on rather than blocking).
- One commit per task.

## File Structure

**Create:**
- `supabase/migrations/20260806000001_workspace_members.sql` — table, index, RLS, read helpers, backfill.
- `supabase/migrations/20260806000002_membership_dual_write.sql` — the four writing functions.
- `supabase/migrations/20260806000003_rls_via_workspace_members.sql` — the 28 policies.
- `tests/helpers/rls-client.ts` — run a query as a given user with RLS enforced.
- `tests/db/workspace-members.test.ts` — backfill parity + membership-table RLS.
- `tests/db/membership-dual-write.test.ts` — the four functions keep both tables in sync.
- `tests/db/rls-source-of-truth.test.ts` — proves policies read `workspace_members`, and that isolation holds.

**Modify:**
- `tests/helpers/raw-pg.ts` — export `getPool` so `rls-client.ts` can reuse the pool.
- `vitest.config.mts` — register `tests/db/**` with the `db-integration` project (once, in Task 1).

---

### Task 1: `workspace_members` table, helpers, backfill, and an RLS-capable test client

**Files:**
- Create: `supabase/migrations/20260806000001_workspace_members.sql`
- Create: `tests/helpers/rls-client.ts`
- Create: `tests/db/workspace-members.test.ts`
- Modify: `tests/helpers/raw-pg.ts:33-38` (export `getPool`)
- Modify: `vitest.config.mts:72-79` (unit `exclude`) and `vitest.config.mts:93-96` (db-integration `include`)

**Interfaces:**
- Consumes: existing `public.profiles` (`id`, `workspace_id`, `role`), `public.workspaces`, `auth.users`. Existing test helper `insertAuthUserRaw({ email, appMetaData, userMetaData })` and `closeRawPgPool()` from `tests/helpers/raw-pg.ts`.
- Produces, for Tasks 2–4:
  - Table `public.workspace_members (user_id uuid, workspace_id uuid, role text, created_at timestamptz)`, PK `(user_id, workspace_id)`.
  - `public.current_user_workspace_ids() returns setof uuid` — every workspace the caller belongs to.
  - `public.current_user_owned_workspace_ids() returns setof uuid` — those where the caller's role is `owner`.
  - `queryAsUser<T>(userId: string, sql: string, params?: unknown[]): Promise<T[]>` from `tests/helpers/rls-client.ts` — one statement, RLS enforced as that user.
  - `withUser<T>(userId: string, fn: (run) => Promise<T>): Promise<T>` from the same file — several statements in one rolled-back transaction, for observing what a `security definer` RPC wrote.
  - `getPool(): Pool` exported from `tests/helpers/raw-pg.ts`.

- [ ] **Step 1: Export the pool from the existing raw-pg helper**

In `tests/helpers/raw-pg.ts`, change the `getPool` declaration from private to exported. Replace:

```ts
function getPool(): Pool {
```

with:

```ts
export function getPool(): Pool {
```

Nothing else in that file changes.

- [ ] **Step 2: Add the RLS-capable test client**

Create `tests/helpers/rls-client.ts`:

```ts
/**
 * Run a query with RLS enforced, as a specific user.
 *
 * Why this exists: every db-integration test in this repo goes through
 * `createAdminClient()`, which uses the service-role key. Service role
 * BYPASSES row-level security entirely, so none of those tests can observe a
 * policy — they would pass identically with every policy dropped. Testing RLS
 * requires connecting as the non-superuser `authenticated` role with the JWT
 * claims that Supabase's `auth.uid()` reads.
 *
 * Everything runs inside a transaction that is always rolled back, so these
 * helpers never mutate state: use the admin client for setup, this for reads.
 */
import { getPool } from "./raw-pg";

type RunFn = <R = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
) => Promise<R[]>;

/**
 * Open one transaction as `userId` and run several statements inside it.
 *
 * Needed for testing the security definer RPCs: the transaction is rolled
 * back, so the only way to observe what an RPC wrote is to read it back
 * before the rollback, in the same transaction.
 */
export async function withUser<T>(
  userId: string,
  fn: (run: RunFn) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // Order matters: set the claim while still superuser, then drop to the
    // `authenticated` role the policies are granted `to`. Doing it the other
    // way round can fail on permissions.
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await client.query("set local role authenticated");

    const run: RunFn = async (sql, params = []) => {
      const { rows } = await client.query(sql, params);
      return rows as never[];
    };

    return await fn(run);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Single-statement convenience wrapper over `withUser`. */
export async function queryAsUser<T = Record<string, unknown>>(
  userId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withUser(userId, (run) => run<T>(sql, params));
}
```

- [ ] **Step 3: Register `tests/db/**` with the db-integration project**

In `vitest.config.mts`, add the glob to the `unit` project's `exclude` array (around line 72):

```ts
          exclude: [
            "node_modules/**",
            "dist/**",
            ".next/**",
            ".output/**",
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
            "tests/db/**",
          ],
```

and to the `db-integration` project's `include` array (around line 93):

```ts
          include: [
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
            "tests/db/**/*.test.ts",
          ],
```

Both edits are required. Without the `exclude`, the new tests also run under the `unit` project, where the admin client is mocked and they fail for an unrelated reason.

- [ ] **Step 4: Write the failing test**

Create `tests/db/workspace-members.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it fails**

Prereq: `npx supabase start`.

Run: `npx vitest run tests/db/workspace-members.test.ts`
Expected: FAIL — `relation "public.workspace_members" does not exist`. If instead it reports "skipped", local Supabase is not reachable; fix that before continuing, because a skipped suite proves nothing.

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20260806000001_workspace_members.sql`:

```sql
-- Multi-workspace membership — phase 1 of 2, step 1 of 3.
--
-- Introduces the join table and the read helpers. Nothing reads it yet:
-- policies still source membership from profiles until 20260806000003, and
-- the writing functions start dual-writing in 20260806000002. Applying this
-- migration alone changes no behaviour.
--
-- See docs/superpowers/specs/2026-08-06-multi-workspace-design.md

create table public.workspace_members (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         text not null default 'staff' check (role in ('owner','staff')),
  created_at   timestamptz not null default now(),
  -- user_id leads the PK deliberately. The RLS hot path filters
  -- `where user_id = auth.uid()` and runs on every query against every tenant
  -- table; a btree keyed (workspace_id, user_id) sorts by workspace first and
  -- cannot seek on user_id alone, degrading to a full index scan.
  primary key (user_id, workspace_id)
);

comment on table public.workspace_members is
  'Workspace membership + per-workspace role. Authoritative for RLS from 20260806000003 onward; profiles.workspace_id/role are kept in sync as last-used/legacy.';

comment on column public.workspace_members.role is
  'Role WITHIN this workspace. A user may be owner of one workspace and staff of another.';

-- Cold path: Settings -> Team lists the members of a single workspace.
create index workspace_members_workspace_idx
  on public.workspace_members (workspace_id);

alter table public.workspace_members enable row level security;

grant select on public.workspace_members to authenticated;
grant all on public.workspace_members to service_role;

-- Backfill. profiles.role is `not null default 'owner' check (role in
-- ('owner','staff'))`, so it is always a legal value here and needs no mapping.
insert into public.workspace_members (user_id, workspace_id, role)
select id, workspace_id, role
from public.profiles
where workspace_id is not null
on conflict (user_id, workspace_id) do nothing;

-- -----------------------------------------------------------------------------
-- Read helpers
-- -----------------------------------------------------------------------------
-- security definer for two reasons:
--   1. Recursion. A policy on workspace_members that asks "am I an owner of
--      this workspace?" must itself read workspace_members. A definer function
--      runs as the table owner and bypasses RLS, breaking the cycle. This is
--      the same reason current_user_workspace_id() was made definer in
--      20260724000008 ("Avoid RLS recursion when policies read profiles").
--   2. It skips a nested RLS evaluation on every check.
--
-- SECURITY DEFINER also prevents Postgres from inlining the function, so
-- ALWAYS call these as `x in (select public.fn())`. That form becomes an
-- InitPlan: evaluated once per statement instead of once per row — the same
-- technique 20260730000002 applied with (select auth.uid()).

create or replace function public.current_user_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members
  where user_id = (select auth.uid())
$$;

comment on function public.current_user_workspace_ids() is
  'Every workspace the caller belongs to. Call as `x in (select public.current_user_workspace_ids())` so it evaluates once per statement.';

create or replace function public.current_user_owned_workspace_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members
  where user_id = (select auth.uid()) and role = 'owner'
$$;

comment on function public.current_user_owned_workspace_ids() is
  'Workspaces the caller owns. Replaces current_user_is_workspace_owner(), whose global boolean is meaningless once a user can be owner of one workspace and staff of another.';

grant execute on function public.current_user_workspace_ids() to authenticated, service_role;
grant execute on function public.current_user_owned_workspace_ids() to authenticated, service_role;

-- current_user_workspace_id() (singular) is deliberately left as-is. After
-- 20260806000003 no policy references it; it survives as the accessor for
-- "last-used workspace" (profiles.workspace_id).
comment on function public.current_user_workspace_id() is
  'LEGACY: the caller''s last-used workspace (profiles.workspace_id). Not a membership check — use current_user_workspace_ids() for that.';

-- -----------------------------------------------------------------------------
-- RLS on the membership table itself
-- -----------------------------------------------------------------------------

-- Read: teammates in any workspace I belong to. Goes through the definer
-- helper, so this policy does not recurse into workspace_members' own RLS.
create policy "Members can read memberships of their workspaces"
on public.workspace_members for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- No insert/update/delete policy for `authenticated`, on purpose. Every
-- membership write goes through a security definer RPC
-- (accept_workspace_invite / remove_workspace_member /
-- transfer_workspace_ownership), exactly how workspace_invites mutations are
-- already gated. Without this, any authenticated user could insert themselves
-- into any workspace.
```

- [ ] **Step 7: Apply the migration**

Run: `npx supabase db reset`
Expected: completes without error (this replays every migration plus `seed.sql` from scratch, which is also the check that nothing earlier broke).

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run tests/db/workspace-members.test.ts`
Expected: PASS, 4 passed (not skipped).

- [ ] **Step 9: Confirm nothing else regressed**

Run: `npm run typecheck && npm test`
Expected: no new failures. `tests/handle-new-user-oauth-invite.test.ts` must still pass — the trigger is untouched so far.

- [ ] **Step 10: Commit**

```bash
graphify update .
git add supabase/migrations/20260806000001_workspace_members.sql tests/helpers/rls-client.ts tests/helpers/raw-pg.ts tests/db/workspace-members.test.ts vitest.config.mts
git commit -m "feat(tenancy): add workspace_members table, read helpers and backfill"
```

---

### Task 2: Dual-write the four membership-writing functions

**Files:**
- Create: `supabase/migrations/20260806000002_membership_dual_write.sql`
- Create: `tests/db/membership-dual-write.test.ts`

**Interfaces:**
- Consumes: `public.workspace_members` and both helpers from Task 1.
- Produces: `handle_new_user()`, `accept_workspace_invite(p_token text)`, `remove_workspace_member(p_user_id uuid)`, `transfer_workspace_ownership(p_to_user_id uuid)` — same signatures and same return shapes as today, now writing `workspace_members` alongside `profiles`. Task 3 depends on this being in place first.

**Why this task comes before the policy rewrite:** if policies read `workspace_members` while these functions still only write `profiles`, any user created in that window gets a profile with no membership row — and therefore no access to anything. Ordering it this way means no intermediate state is broken.

The spec describes this as "6 SQL functions"; precisely, four of them *write* and are handled here. The two read helpers were addressed in Task 1 (`current_user_workspace_ids` added, `current_user_workspace_id` documented as legacy) and Task 3 (`current_user_is_workspace_owner`'s call sites migrated).

- [ ] **Step 1: Write the failing test**

Create `tests/db/membership-dual-write.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/membership-dual-write.test.ts`
Expected: FAIL on the first two tests — `handle_new_user` does not write `workspace_members` yet, so `members` is empty.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806000002_membership_dual_write.sql`. This redefines each function in full (Postgres has no partial redefinition); the bodies are copied from their current definitions with membership writes added.

```sql
-- Multi-workspace membership — phase 1 of 2, step 2 of 3.
--
-- The four functions that create or move a membership now write BOTH
-- workspace_members (authoritative from the next migration) and the legacy
-- profiles.workspace_id / profiles.role, so the two never disagree.
--
-- This must land BEFORE 20260806000003 repoints the policies. The other order
-- leaves a window where a new signup has a profile but no membership row, and
-- therefore no access to anything.
--
-- Behaviour is otherwise unchanged. In particular accept_workspace_invite
-- still rejects already_in_workspace — lifting that is Phase 2.

-- -----------------------------------------------------------------------------
-- handle_new_user — body from 20260805000001, plus membership inserts
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws_id uuid;
  base_slug text;
  final_slug text;
  ws_name text;
  n int := 0;
  invite_token text;
  inv public.workspace_invites%rowtype;
  profile_role text;
  is_oauth boolean;
begin
  invite_token := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_token', '')), '');
  is_oauth := coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'email';

  -- Explicit invite_token (password signup arriving from ?invite=...).
  if invite_token is not null then
    select * into inv
    from public.workspace_invites
    where token = invite_token
      and accepted_at is null
      and expires_at > now()
    for update;

    if not found then
      raise exception 'Invalid or expired invite token';
    end if;

    if inv.email is not null
       and lower(trim(inv.email)) <> lower(trim(coalesce(new.email, ''))) then
      raise exception 'Invite email does not match signup email';
    end if;

    insert into public.profiles (id, email, full_name, role, workspace_id)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      inv.role,
      inv.workspace_id
    );

    insert into public.workspace_members (user_id, workspace_id, role)
    values (new.id, inv.workspace_id, inv.role)
    on conflict (user_id, workspace_id) do update set role = excluded.role;

    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id;

    return new;
  end if;

  -- OAuth fallback: Google cannot carry invite_token, so match by email.
  if is_oauth then
    select * into inv
    from public.workspace_invites
    where lower(email) = lower(coalesce(new.email, ''))
      and accepted_at is null
      and expires_at > now()
    order by created_at desc
    limit 1
    for update;

    if found then
      insert into public.profiles (id, email, full_name, role, workspace_id)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        inv.role,
        inv.workspace_id
      );

      insert into public.workspace_members (user_id, workspace_id, role)
      values (new.id, inv.workspace_id, inv.role)
      on conflict (user_id, workspace_id) do update set role = excluded.role;

      update public.workspace_invites
      set accepted_at = now()
      where id = inv.id;

      return new;
    end if;
  end if;

  -- Owner path: create a workspace.
  ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'workspace_name', '')), '');
  if ws_name is null then
    ws_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  end if;
  if ws_name is null then
    ws_name := split_part(coalesce(new.email, 'workspace'), '@', 1);
  end if;
  if ws_name is null or length(ws_name) < 1 then
    ws_name := 'Workspace';
  end if;

  base_slug := public.slugify_workspace_name(ws_name);
  final_slug := base_slug;

  loop
    begin
      insert into public.workspaces (name, slug, timezone)
      values (ws_name, final_slug, 'Asia/Ho_Chi_Minh')
      returning id into ws_id;
      exit;
    exception when unique_violation then
      n := n + 1;
      if n > 50 then
        raise exception 'Could not allocate a workspace slug for "%"', base_slug;
      end if;
      final_slug := left(base_slug, 40) || '-' || n::text;
    end;
  end loop;

  perform public.seed_workspace_starters(ws_id);

  profile_role := coalesce(nullif(trim(new.raw_user_meta_data ->> 'role'), ''), 'owner');
  if profile_role not in ('owner', 'staff') then
    profile_role := 'owner';
  end if;

  insert into public.profiles (id, email, full_name, role, workspace_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    profile_role,
    ws_id
  );

  insert into public.workspace_members (user_id, workspace_id, role)
  values (new.id, ws_id, profile_role)
  on conflict (user_id, workspace_id) do update set role = excluded.role;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Invite token (explicit, or matched by email for OAuth signups) -> staff joins existing workspace; else create an owner workspace. Writes both workspace_members and legacy profiles columns.';

-- -----------------------------------------------------------------------------
-- accept_workspace_invite — body from 20260726000001, plus membership insert
-- -----------------------------------------------------------------------------
-- The already_in_workspace rejection is intentionally preserved. Phase 2
-- replaces it; changing it here would defeat the point of a no-op refactor.

create or replace function public.accept_workspace_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.workspace_invites%rowtype;
  uid uuid := auth.uid();
  user_email text;
  old_ws uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_token is null or length(trim(p_token)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into inv
  from public.workspace_invites
  where token = trim(p_token)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if inv.accepted_at is not null then
    return jsonb_build_object('ok', false, 'error', 'already_accepted');
  end if;

  if inv.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select email into user_email from auth.users where id = uid;

  if lower(trim(inv.email)) <> lower(trim(coalesce(user_email, ''))) then
    return jsonb_build_object(
      'ok', false,
      'error', 'email_mismatch',
      'inviteEmail', inv.email
    );
  end if;

  select workspace_id into old_ws from public.profiles where id = uid;

  if old_ws is not null and old_ws = inv.workspace_id then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  if old_ws is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_workspace');
  end if;

  update public.profiles
  set workspace_id = inv.workspace_id,
      role = inv.role,
      updated_at = now()
  where id = uid;

  insert into public.workspace_members (user_id, workspace_id, role)
  values (uid, inv.workspace_id, inv.role)
  on conflict (user_id, workspace_id) do update set role = excluded.role;

  update public.workspace_invites
  set accepted_at = now(),
      accepted_by = uid
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- remove_workspace_member — body from 20260726000001, plus membership delete
-- -----------------------------------------------------------------------------

create or replace function public.remove_workspace_member(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_ws uuid;
  target_role text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id, role into target_ws, target_role
  from public.profiles where id = p_user_id;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if target_role = 'owner' then
    return jsonb_build_object('ok', false, 'error', 'cannot_remove_owner');
  end if;

  delete from public.workspace_members
  where user_id = p_user_id and workspace_id = caller_ws;

  update public.profiles
  set workspace_id = null,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- transfer_workspace_ownership — body from 20260726000001, plus membership swap
-- -----------------------------------------------------------------------------
-- Promote-then-demote order is preserved so the workspace is never ownerless.
-- (This is also why no partial unique index enforces one-owner-per-workspace:
-- the intermediate state legitimately has two owners and a unique index cannot
-- be deferred. See the spec's rejected-alternatives table.)

create or replace function public.transfer_workspace_ownership(p_to_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  caller_ws uuid;
  caller_role text;
  target_ws uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  if p_to_user_id = uid then
    return jsonb_build_object('ok', false, 'error', 'invalid_target');
  end if;

  select workspace_id, role into caller_ws, caller_role
  from public.profiles where id = uid for update;

  if caller_ws is null or caller_role <> 'owner' then
    return jsonb_build_object('ok', false, 'error', 'owner_required');
  end if;

  select workspace_id into target_ws
  from public.profiles where id = p_to_user_id for update;

  if target_ws is null or target_ws <> caller_ws then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.profiles
  set role = 'owner', updated_at = now()
  where id = p_to_user_id;

  update public.workspace_members
  set role = 'owner'
  where user_id = p_to_user_id and workspace_id = caller_ws;

  update public.profiles
  set role = 'staff', updated_at = now()
  where id = uid;

  update public.workspace_members
  set role = 'staff'
  where user_id = uid and workspace_id = caller_ws;

  return jsonb_build_object('ok', true);
end;
$$;
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase db reset && npx vitest run tests/db/membership-dual-write.test.ts`
Expected: PASS, 5 passed (not skipped).

- [ ] **Step 5: Confirm nothing else regressed**

Run: `npm run typecheck && npm test`
Expected: no new failures. `tests/handle-new-user-oauth-invite.test.ts` in particular must still pass — it exercises all three `handle_new_user` branches that were just rewritten.

- [ ] **Step 6: Commit**

```bash
graphify update .
git add supabase/migrations/20260806000002_membership_dual_write.sql tests/db/membership-dual-write.test.ts
git commit -m "feat(tenancy): dual-write workspace_members from the membership RPCs"
```

---

### Task 3: Repoint the 28 RLS policies at `workspace_members`

**Files:**
- Create: `supabase/migrations/20260806000003_rls_via_workspace_members.sql`
- Create: `tests/db/rls-source-of-truth.test.ts`

**Interfaces:**
- Consumes: `current_user_workspace_ids()` and `current_user_owned_workspace_ids()` (Task 1); dual-writing functions (Task 2); `queryAsUser` (Task 1).
- Produces: no new callable surface. After this task `workspace_members` is authoritative for every tenant policy, and `current_user_is_workspace_owner()` has no remaining call sites.

The 30 effective policies were inventoried from the migration history; the two `profiles` self-policies (`(select auth.uid()) = id`) need no change, leaving 28.

- [ ] **Step 1: Write the failing test**

Create `tests/db/rls-source-of-truth.test.ts`. The first test is the genuine red/green probe: it deliberately points `profiles.workspace_id` at one workspace and the membership row at another, then asks which one the policies honour.

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/rls-source-of-truth.test.ts`
Expected: the first test FAILS — policies still read `profiles`, so the user sees Alpha's lead while the assertion expects Bravo's. The other tests pass already (single-workspace isolation works today); they are regression guards.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806000003_rls_via_workspace_members.sql`:

```sql
-- Multi-workspace membership — phase 1 of 2, step 3 of 3.
--
-- Repoints every tenant policy at workspace_members. The predicate shape is
-- unchanged: these policies already used `in (...)`, which tolerates multiple
-- rows, so only the source of the id set moves.
--
-- Calls go through `in (select public.current_user_workspace_ids())` rather
-- than inlining the subquery: SECURITY DEFINER blocks function inlining, and
-- this form makes it an InitPlan evaluated once per statement instead of once
-- per row.
--
-- The two profiles self-policies ("Users can view own profile" / "Users can
-- update own profile") use `(select auth.uid()) = id` and are untouched.
--
-- After this migration current_user_is_workspace_owner() has no remaining
-- call sites. It is left defined (dropping it is Phase 2 cleanup) because a
-- drop would fail if any environment still had a policy referencing it.

-- -----------------------------------------------------------------------------
-- workspaces
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspaces" on public.workspaces;
create policy "Users can read workspace workspaces"
on public.workspaces for select to authenticated
using (id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspaces" on public.workspaces;
create policy "Users can update workspace workspaces"
on public.workspaces for update to authenticated
using (id in (select public.current_user_workspace_ids()))
with check (id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace leads" on public.leads;
create policy "Users can read workspace leads"
on public.leads for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace leads" on public.leads;
create policy "Users can insert workspace leads"
on public.leads for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace leads" on public.leads;
create policy "Users can update workspace leads"
on public.leads for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace bookings" on public.bookings;
create policy "Users can read workspace bookings"
on public.bookings for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace bookings" on public.bookings;
create policy "Users can insert workspace bookings"
on public.bookings for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace bookings" on public.bookings;
create policy "Users can update workspace bookings"
on public.bookings for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- conversation_logs
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace conversation_logs" on public.conversation_logs;
create policy "Users can read workspace conversation_logs"
on public.conversation_logs for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_event_types
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can read workspace workspace_event_types"
on public.workspace_event_types for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can insert workspace workspace_event_types"
on public.workspace_event_types for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can update workspace workspace_event_types"
on public.workspace_event_types for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can delete workspace workspace_event_types" on public.workspace_event_types;
create policy "Users can delete workspace workspace_event_types"
on public.workspace_event_types for delete to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_faq_items
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can read workspace workspace_faq_items"
on public.workspace_faq_items for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can insert workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can insert workspace workspace_faq_items"
on public.workspace_faq_items for insert to authenticated
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can update workspace workspace_faq_items"
on public.workspace_faq_items for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can delete workspace workspace_faq_items" on public.workspace_faq_items;
create policy "Users can delete workspace workspace_faq_items"
on public.workspace_faq_items for delete to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- agent_tool_events
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace agent_tool_events" on public.agent_tool_events;
create policy "Users can read workspace agent_tool_events"
on public.agent_tool_events for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- chat
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace chat_sessions" on public.chat_sessions;
create policy "Users can read workspace chat_sessions"
on public.chat_sessions for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- chat_messages reaches workspace_id through chat_sessions; only the inner
-- membership lookup changes.
drop policy if exists "Users can read workspace chat_messages" on public.chat_messages;
create policy "Users can read workspace chat_messages"
on public.chat_messages for select to authenticated
using (
  session_id in (
    select id from public.chat_sessions
    where workspace_id in (select public.current_user_workspace_ids())
  )
);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace notifications" on public.notifications;
create policy "Users can read workspace notifications"
on public.notifications for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

drop policy if exists "Users can update workspace notifications" on public.notifications;
create policy "Users can update workspace notifications"
on public.notifications for update to authenticated
using (workspace_id in (select public.current_user_workspace_ids()))
with check (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- booking_reminders
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace booking_reminders" on public.booking_reminders;
create policy "Users can read workspace booking_reminders"
on public.booking_reminders for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- billing_payments
-- -----------------------------------------------------------------------------

drop policy if exists "Users can read workspace billing_payments" on public.billing_payments;
create policy "Users can read workspace billing_payments"
on public.billing_payments for select to authenticated
using (workspace_id in (select public.current_user_workspace_ids()));

-- -----------------------------------------------------------------------------
-- workspace_invites — owner-gated
-- -----------------------------------------------------------------------------
-- current_user_is_workspace_owner() answered "am I an owner anywhere", which
-- is meaningless once a user can be owner of one workspace and staff of
-- another. The owned-id set is both correct and strictly more precise.

drop policy if exists "Owners can read workspace invites" on public.workspace_invites;
create policy "Owners can read workspace invites"
on public.workspace_invites for select to authenticated
using (workspace_id in (select public.current_user_owned_workspace_ids()));

drop policy if exists "Owners can create workspace invites" on public.workspace_invites;
create policy "Owners can create workspace invites"
on public.workspace_invites for insert to authenticated
with check (
  workspace_id in (select public.current_user_owned_workspace_ids())
  and invited_by = (select auth.uid())
);

drop policy if exists "Owners can delete workspace invites" on public.workspace_invites;
create policy "Owners can delete workspace invites"
on public.workspace_invites for delete to authenticated
using (workspace_id in (select public.current_user_owned_workspace_ids()));

-- -----------------------------------------------------------------------------
-- profiles — teammate visibility
-- -----------------------------------------------------------------------------
-- Was `workspace_id = current_user_workspace_id()`, a single-value compare.
-- Becomes "shares any workspace with me", which is both wider in meaning and
-- more expensive. The Settings -> Team listing must narrow to the active
-- workspace in application code; this policy only grants permission.

drop policy if exists "Users can view workspace teammates" on public.profiles;
create policy "Users can view workspace teammates"
on public.profiles for select to authenticated
using (
  exists (
    select 1
    from public.workspace_members m
    where m.user_id = profiles.id
      and m.workspace_id in (select public.current_user_workspace_ids())
  )
);
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase db reset && npx vitest run tests/db/rls-source-of-truth.test.ts`
Expected: PASS, 5 passed (not skipped).

- [ ] **Step 5: Re-run the earlier DB suites**

Run: `npx vitest run tests/db/ tests/handle-new-user-oauth-invite.test.ts`
Expected: all pass. The membership-table RLS tests from Task 1 matter most here — the teammate policy rewrite could plausibly have broken them.

- [ ] **Step 6: Commit**

```bash
graphify update .
git add supabase/migrations/20260806000003_rls_via_workspace_members.sql tests/db/rls-source-of-truth.test.ts
git commit -m "feat(tenancy): source RLS membership from workspace_members"
```

---

### Task 4: End-to-end verification that nothing changed

**Files:** none — verification only, plus one documentation line.

**Interfaces:** exercises Tasks 1–3 together.

This task exists because Phase 1's success criterion is a negative one ("no behaviour changed"), which the unit tests cannot fully establish on their own.

- [ ] **Step 1: Full automated suite**

Run: `npm run typecheck && npm test`
Expected: no failures. Confirm the db-integration project reports **passed**, not skipped — a skipped suite would hide every regression this plan could have introduced.

- [ ] **Step 2: Verify the migration replays from empty**

Run: `npx supabase db reset`
Expected: succeeds. Then confirm the backfill matches, via the Studio SQL editor (`http://127.0.0.1:54323`):

```sql
select
  (select count(*) from public.profiles where workspace_id is not null) as profiles_with_ws,
  (select count(*) from public.workspace_members) as memberships,
  (select count(*)
     from public.profiles p
     join public.workspace_members m
       on m.user_id = p.id and m.workspace_id = p.workspace_id
    where p.role <> m.role) as role_mismatches;
```
Expected: `profiles_with_ws` equals `memberships`, and `role_mismatches` is `0`.

- [ ] **Step 3: Manual smoke test of the dashboard**

Start the app (`npm run dev`), sign in as an existing seeded user, and confirm each of these renders the same data as before the change: `/dashboard`, `/dashboard/bookings`, `/dashboard/leads`, `/dashboard/conversations`, `/dashboard/analytics`, `/dashboard/notifications`, `/dashboard/settings`.

Any page that now shows *no* data points at a policy whose rewrite is wrong; any page showing *extra* data points at a leak. Both are Task 3 bugs.

- [ ] **Step 4: Manual smoke test of the membership flows**

In Settings → Team, as an owner: send an invite, accept it from a second account, then remove that member. After each action confirm in Studio that `profiles` and `workspace_members` still agree:

```sql
select p.id, p.workspace_id as profile_ws, m.workspace_id as member_ws, p.role as profile_role, m.role as member_role
from public.profiles p
left join public.workspace_members m on m.user_id = p.id
order by p.created_at desc
limit 10;
```
Expected: for every row either both workspace columns match, or both are empty.

- [ ] **Step 5: Record that Phase 1 is complete**

Append to the spec's status line in `docs/superpowers/specs/2026-08-06-multi-workspace-design.md`:

```markdown
**Phase 1 status:** implemented 2026-08-06 (migrations 20260806000001–20260806000003). Phase 2 not started.
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-06-multi-workspace-design.md
git commit -m "docs(tenancy): mark multi-workspace Phase 1 complete"
```

---

## What Phase 2 will do (not in this plan)

Written as a separate plan once Phase 1 is merged and stable, because its shape depends on how Phase 1 behaves in practice:

- `eve_active_workspace` cookie, validated against `workspace_members` on every request — never trusted as authorisation.
- Workspace switcher in the dashboard sidebar.
- `accept_workspace_invite` rewritten to add a membership instead of returning `already_in_workspace`. **This is the commit that fixes the reported bug.**
- Role resolved per active workspace rather than from `profiles.role`.
- An audit of every dashboard read path for a missing `.eq("workspace_id", …)`, since RLS stops being a filter and becomes only a permission gate.
- Drop `current_user_is_workspace_owner()` once confirmed unused.
