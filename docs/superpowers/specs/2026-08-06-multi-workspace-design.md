# Multi-workspace membership

**Date:** 2026-08-06
**Status:** Design approved in conversation — ready for implementation plans (two, one per phase)
**Phase 1 status:** implemented 2026-08-06 (migrations 20260806000001–20260806000003). Phase 2 not started.
**Scope:** Replace the singular `profiles.workspace_id` tenancy model with a `workspace_members` join table, so one user can belong to several workspaces. Delivered in two phases: an invisible refactor (Phase 1) followed by the user-visible switch (Phase 2).

## Goal

Today a user belongs to exactly one workspace (`profiles.workspace_id`, one column). `accept_workspace_invite()` therefore refuses any invitee who already has a workspace, returning `already_in_workspace` — a permanent dead end with no recovery path in the UI.

The concrete failure driving this work: **someone signs up on their own without realising it** (getting an auto-created workspace from `handle_new_user`), and from that moment can never be invited to the workspace that actually wanted them.

Fixing that properly means membership stops being exclusive.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Membership model | New `workspace_members` join table. Self-built — **not** a migration to Clerk (see "Why not Clerk") |
| Active-workspace mechanism | Cookie `eve_active_workspace` + a switcher dropdown. **Not** URL-based (`/w/[slug]/…`) |
| Rollout | Two phases. Phase 1 changes no behaviour at all; Phase 2 turns multi-membership on |
| `profiles.workspace_id` | **Kept**, repurposed as "last-used workspace" (server-side fallback when no cookie). Not dropped |
| `profiles.role` | Kept in sync during Phase 1; from Phase 2 the authoritative role is `workspace_members.role` for the active workspace |
| Second membership comes from | **Accepting an invite only.** Creating additional workspaces is out of scope |
| Membership writes | Through `security definer` RPCs only — no direct `insert`/`update`/`delete` policies for `authenticated` on `workspace_members` |
| `accept_workspace_invite` | Rewritten in Phase 2 (the `already_in_workspace` block is what this whole project removes). Untouched in Phase 1 |

### Why not Clerk

Measured on this repo: **56 `create policy` statements, 30 `profiles`-subquery occurrences, 3 foreign keys into `auth.users`.** Clerk's Organizations feature would give multi-org natively, but adopting it means either abandoning Supabase RLS — the app's core tenant-isolation guarantee — or building a Clerk↔Supabase user-sync layer, which is itself a new source of exactly the cross-tenant bugs RLS exists to prevent. It also adds per-MAU cost for a feature set (SSO/SAML, custom roles) this product does not need.

The self-built path changes one subquery pattern across policies that **already use `in (...)`**, so they already tolerate multiple rows. Revisit Clerk only if enterprise SSO/SAML becomes a requirement, or auth maintenance starts outweighing product work.

This repeats and confirms the conclusion already recorded in `docs/superpowers/plans/2026-07-26-workspace-invites.md` ("Vì sao không dùng Clerk"), whose own stated trigger for revisiting — *"cần một user thuộc nhiều workspace"* — is exactly the situation now reached.

## Current state (measured, not assumed)

- **RLS shape is uniform.** Every tenant policy is `workspace_id in (select workspace_id from public.profiles where id = (select auth.uid()))`. The `(select auth.uid())` InitPlan wrapper was already applied in `20260730000002_rls_initplan_and_indexes.sql`.
- **Policies to rewrite:** 24 in `20260730000002` (the 26 there minus the two `profiles` self-policies, which use `auth.uid() = id` and need no change), plus 1 in `20260802000001` (`billing_payments`), plus 3 helper-based ones still live from `20260724000008` ("Owners can read workspace invites", "Owners can delete workspace invites", "Users can view workspace teammates"). Tables covered: `workspaces`, `leads`, `bookings`, `conversation_logs`, `workspace_event_types`, `workspace_faq_items`, `agent_tool_events`, `chat_sessions`, `chat_messages`, `notifications`, `booking_reminders`, `workspace_invites`, `billing_payments`.
- **One policy is join-scoped, not column-scoped:** `chat_messages` reaches `workspace_id` through `chat_sessions` (`session_id in (select id from chat_sessions where workspace_id in (…))`). Its inner subquery changes; its outer shape does not.
- **SQL functions that encode the one-workspace assumption (6):** `current_user_workspace_id()`, `current_user_is_workspace_owner()` (both `20260730000002`), `handle_new_user()` (`20260805000001`), `accept_workspace_invite()`, `remove_workspace_member()`, `transfer_workspace_ownership()` (all `20260726000001`). `get_workspace_invite_preview()` and `list_my_pending_invites()` key off token/email and need no change.
- **App code is disciplined about explicit scoping.** Sampling `lib/analytics-data.ts`, `lib/agent-booking-auth.ts`, `lib/notifications.ts`, `agent/tools/*` shows `.eq("workspace_id", workspaceId)` on essentially every tenant read, per `.claude/rules/tenant-isolation.md`. **This is the single biggest de-risker of the whole project** — see "Principal risk".
- **A cookie-based tenant switch already exists in-house.** `proxy.ts:53-65` sets `eve_w` from `?w=` or `/b/[slug]` for guest chat. The dashboard switcher follows that precedent rather than inventing a mechanism.
- **`/dashboard` path strings are not as centralised as the rules claim:** 145 occurrences across 57 files, including agent tools that write `notifications.href` values **into the database**. This is why the URL-based approach was rejected — it would require migrating stored data, not just code.
- **No `insert` policy exists on `workspaces`.** Workspace rows are only ever created by `handle_new_user()` (`security definer`). Nothing in this design changes that.

## Architecture

### Schema

```sql
create table public.workspace_members (
  user_id      uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role         text not null default 'staff' check (role in ('owner','staff')),
  created_at   timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create index workspace_members_workspace_idx
  on public.workspace_members (workspace_id);
```

**Column order in the primary key is load-bearing.** The RLS hot path filters `where user_id = (select auth.uid())` and runs on every query against every tenant table. A btree on `(workspace_id, user_id)` sorts by `workspace_id` first and cannot seek on `user_id` alone — it degrades to a full index scan. `(user_id, workspace_id)` serves the hot path directly and needs no secondary index for it. The separate `workspace_members_workspace_idx` serves the cold path (Settings → Team listing one workspace's members).

At current scale (hundreds of rows) neither choice is measurably slow. The ordering is specified now because it is free to get right and expensive to change on a live table later.

### RLS strategy

Two `security definer` set-returning helpers, alongside the existing ones:

```sql
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
```

Tenant policies become:

```sql
using (workspace_id in (select public.current_user_workspace_ids()))
```

Three properties this shape depends on:

1. **`security definer` is required, but only because of recursion.** A policy on `workspace_members` that answers "am I an owner of this workspace?" must read `workspace_members` — infinite recursion without a definer function. This is the same reason `current_user_workspace_id()` was already made `security definer` in `20260724000008` ("Avoid RLS recursion when policies read profiles").
2. **`security definer` blocks function inlining**, so the helper is a black box to the planner. Calling it as `in (select fn())` makes it an InitPlan — evaluated **once per statement**, not once per row. This is the same technique the repo already applies with `(select auth.uid())`.
3. **`in` beats `exists` here.** With 1–3 memberships per user the subquery becomes a hashed InitPlan: run once, then a hash probe per row. A correlated `exists` would win only if the subquery were highly selective per row, which it is not.

Owner-gated policies (`workspace_invites`, and any future owner-only table) use `current_user_owned_workspace_ids()` instead. RLS answers *"may this user touch this workspace at all"*; narrowing to the **active** workspace is the application's job, because the cookie is invisible to Postgres.

**What happens to the two existing singular helpers.** Both encode "the user has exactly one workspace" in their return type and cannot be repaired in place:

- `current_user_workspace_id() returns uuid` — no longer referenced by any policy after the rewrite (the plural helper replaces it). It is **kept**, redefined to read `profiles.workspace_id`, and documented as "last-used workspace" only. Keeping it avoids a `drop function` that would fail against any policy still referencing it mid-migration.
- `current_user_is_workspace_owner() returns boolean` — meaningless once a user can be owner of A and staff of B, since the question is only answerable *per workspace*. Its three call sites (the `workspace_invites` owner policies) all move to `workspace_id in (select public.current_user_owned_workspace_ids())`, which is both correct and strictly more precise than the old global boolean. The function is left defined but unused in Phase 1, and dropped in Phase 2 once nothing references it.

RLS on `workspace_members` itself:

- `select`: `workspace_id in (select public.current_user_workspace_ids())` — lets teammates see each other, via the definer helper so it does not recurse.
- `insert` / `update` / `delete`: **no policy at all for `authenticated`.** All membership writes go through `security definer` RPCs (`accept_workspace_invite`, `remove_workspace_member`, `transfer_workspace_ownership`), matching how `workspace_invites` mutations are already gated.

### Semantic change to worth flagging: teammate visibility

`"Users can view workspace teammates"` is currently `workspace_id = current_user_workspace_id()` — a single-value comparison. It becomes "shares **any** workspace with me", which is both more expensive (a self-join across `workspace_members`) and semantically wider. The Settings → Team listing must therefore filter to the active workspace in application code; RLS only permits the read.

### Phase 1 — invisible refactor

Every user still has exactly one membership. No switcher, no UI change, no new user-visible capability. **The success criterion is that the app behaves identically before and after.**

1. Create `workspace_members` (+ index, + RLS as above), backfilled from `profiles`:
   `insert … select workspace_id, id, coalesce(role,'owner') from public.profiles where workspace_id is not null`.
2. Add `current_user_workspace_ids()` / `current_user_owned_workspace_ids()`.
3. Rewrite the 28 policies to source membership from `workspace_members`.
4. Update the 6 SQL functions to write **both** `workspace_members` and the legacy `profiles.workspace_id` / `profiles.role`, keeping them consistent so no TypeScript changes are needed yet.
5. No TypeScript changes. No UI changes.

Phase 1 does **not** fix the invite bug. It only makes the fix possible.

### Phase 2 — turn it on

1. **Active workspace cookie** `eve_active_workspace` (naming follows `eve_dashboard_locale` / `eve_guest_locale`, not the terser guest `eve_w`, to avoid confusion between the two). Read in `proxy.ts` and in `lib/workspace-session.ts`.
2. **Validated on every request against `workspace_members`.** A cookie naming a workspace the user is not a member of is discarded and replaced by the fallback (`profiles.workspace_id`, then the user's first membership). The cookie is a *preference*, never an authorisation.
3. **Switcher dropdown** in the dashboard sidebar. Selecting a workspace writes the cookie, updates `profiles.workspace_id` as last-used, and revalidates.
4. **`accept_workspace_invite()` rewritten** to insert an additional membership rather than rejecting with `already_in_workspace`. *This is the commit that fixes the reported bug.*
5. **Role resolution per active workspace** — `getDashboardUser()` returns the role from `workspace_members` for the active workspace, not from `profiles.role`.
6. **Cross-workspace leak audit** of every dashboard read path (see below).

## Principal risk

RLS changes meaning: from *"you can only see one workspace"* to *"you can see every workspace you belong to"*. It stops being a filter and becomes only a permission gate.

Any query that relied on RLS alone — no explicit `.eq("workspace_id", …)` — will, from Phase 2 onward, **silently return rows from two different businesses**. No crash, no error, no log line. For a user with a single membership (i.e. everyone today) the behaviour is unchanged, which means the bug would only appear for the very users the feature is built for.

The measured mitigation is that this codebase already passes `workspace_id` explicitly nearly everywhere. The design's response is not to trust that: Phase 2 includes an explicit audit task over every dashboard read path, and the acceptance tests below exercise a genuine two-membership user rather than asserting on single-membership behaviour.

## Alternatives considered and rejected

| Alternative | Verdict |
|---|---|
| **JWT custom claims** — embed workspace ids in the access token, RLS reads `auth.jwt()`, zero table lookup. The hook is available (`supabase/config.toml:284`, currently commented out) | Rejected. Fastest possible RLS, but claims go stale until token refresh (~1h). The app already ships `remove_workspace_member`; a removed staff member retaining access for up to an hour is a real security regression. Revisit as a pure optimisation only if measurement shows the subquery is a bottleneck |
| **Array column `profiles.workspace_ids uuid[]`** with a GIN index | Rejected. Faster (no join), but cannot carry a **per-workspace role** without a parallel array, and loses foreign keys and cascade deletes |
| **`exists` correlated subquery instead of `in`** | Rejected. `in` already compiles to a hashed InitPlan at these membership counts |
| **Surrogate `id uuid` primary key + `unique(user_id, workspace_id)`** — matches the repo convention (`workspace_invites` has an `id`) | Rejected. Costs an extra index and buys nothing; this is a pure join table with no row-level identity of its own |
| **Partial unique index enforcing one owner per workspace** (`unique (workspace_id) where role = 'owner'`) | Rejected — and worth recording why, because it looks obviously correct. `transfer_workspace_ownership()` deliberately promotes the new owner **before** demoting the old one, so the workspace is never ownerless; that sequence momentarily has two owners and would violate the index. Unique indexes cannot be deferred. The invariant stays enforced in the function, as today |
| **URL-based active workspace** (`/w/[slug]/dashboard/…`, as Vercel/Linear/GitHub do) | Rejected for now. Correct and tab-safe, but touches 145 path strings across 57 files **and** requires migrating `notifications.href` values already stored in the database. Reconsider if agencies need shareable links or side-by-side tabs |
| **Migrate to Clerk Organizations** | Rejected — see "Why not Clerk" |

## Known limitations (accepted)

- **Two browser tabs on two workspaces conflict.** The cookie is global to the browser, so switching in one tab changes the other. This is the accepted cost of not going URL-based.
- **Dashboard URLs are not shareable across workspaces.** `/dashboard/bookings` means "whichever workspace is active", so a link sent to a colleague may open a different workspace than intended.
- **Users cannot create a second workspace.** Additional memberships arrive only by invitation. A user wanting to run two businesses still needs a second account, exactly as today.

## Testing (acceptance)

Phase 1 — must prove *nothing changed*:

1. `npx supabase db reset` applies cleanly; the backfill produces exactly one `workspace_members` row per existing `profiles` row with a non-null `workspace_id`, with matching roles.
2. Existing suite (`npm test`) passes unchanged — in particular `tests/handle-new-user-oauth-invite.test.ts`, which already exercises the trigger's invite and owner paths.
3. New DB-integration test: two workspaces, one user each; each user reads `leads`, `bookings`, `notifications` and sees **only** their own workspace's rows. Uses the direct-insert helper `tests/helpers/raw-pg.ts` added for the Google OAuth work.
4. Signup (password and Google), invite acceptance, member removal and ownership transfer all still work, and leave `profiles` and `workspace_members` agreeing on workspace and role.

Phase 2 — must prove the new capability *and* the absence of leaks:

5. A user with memberships in workspaces A and B sees only A's data while A is active, and only B's while B is active — asserted across leads, bookings, conversations, notifications and analytics.
6. The reported bug is fixed end to end: a user who already has their own workspace accepts an invite to another and ends up a member of both, with the correct role in each.
7. A tampered `eve_active_workspace` cookie naming a workspace the user does not belong to is rejected, falling back to a legitimate workspace — never granting access.
8. Role is per workspace: a user who is owner of A and staff of B sees owner-only pages in A and is refused them in B (`canAccessDashboardPath` / `OWNER_ONLY_PATHS`).
9. `remove_workspace_member` removes exactly one membership and leaves the user's other memberships intact.
10. `npm run doctor` clean on changed UI; `graphify update .` after each phase.

## Out of scope

- Creating additional workspaces from the UI (no `insert` policy on `workspaces` exists today; adding one is a separate decision).
- URL-based workspace routing and the `notifications.href` data migration it would require.
- Dropping `profiles.workspace_id` / `profiles.role`. They stay as last-used and legacy-sync respectively; removing them is a later cleanup once nothing reads them.
- Roles beyond `owner` / `staff`.
- Cross-workspace aggregate views ("all my bookings everywhere").
- Any change to guest-side tenancy (`/b/[slug]`, `eve_w`, `resolveWorkspaceIdFromAgentContext`) — guests resolve tenants by slug and are unaffected.

## Implementation order

Two separate implementation plans, written and executed in sequence. Phase 1 must be merged and stable before Phase 2 begins.

**Phase 1 plan:** schema + backfill → RLS helpers → policy rewrite (28) → 6 SQL functions dual-writing → isolation regression tests.

**Phase 2 plan:** cookie + validated resolution → switcher UI → `accept_workspace_invite` rewrite → per-workspace role → cross-workspace leak audit → two-membership acceptance tests.

**Sequencing constraint outside this design:** the working tree currently carries an unfinished Supabase Cloud key migration (`lib/supabase/keys.ts`, `lib/env.ts`, and six modified files, uncommitted). Landing a tenancy migration on top of another in-flight migration makes any regression far harder to attribute. Phase 1 should not start until that work is committed and verified.
