# Multi-workspace Phase 2 (turn it on) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one user belong to several workspaces and switch between them — which fixes the reported dead end where anyone who already signed up could never be invited elsewhere.

**Architecture:** An active-workspace cookie, validated against `workspace_members` on every read, resolved by one pure function wrapped in a thin IO shell. The wiring lands through two existing chokepoints — `getSessionWorkspaceId()` (6 call sites) and `requireOwnerWorkspace()` (17 files) — so 23 files inherit multi-workspace behaviour without being edited. The enabling change (`accept_workspace_invite` allowing a second membership) is deliberately **last**, so switching already works the moment multi-membership becomes possible.

**Tech Stack:** Next.js Server Actions + proxy middleware, Supabase Postgres RLS, React context (mirroring the existing `dashboard-role-context.tsx` pattern), Vitest.

Design rationale and rejected alternatives: [`docs/superpowers/specs/2026-08-06-multi-workspace-design.md`](../specs/2026-08-06-multi-workspace-design.md). Phase 1 (the invisible refactor this builds on) shipped in migrations `20260806000001`–`20260806000003`; its plan is [`2026-08-06-multi-workspace-phase-1.md`](2026-08-06-multi-workspace-phase-1.md).

## Global Constraints

- **Phase 1 must be verified before starting.** Run `npx vitest run tests/db/` — expect **14 passed**, not skipped. If it skips, local Supabase is not running and nothing below can be trusted.
- **The cookie is a preference, never an authorisation.** Every read of `eve_active_workspace` is validated against the caller's rows in `workspace_members`. A cookie naming a workspace the user does not belong to must be silently ignored, never honoured.
- **Always filter memberships by `user_id` explicitly.** The `workspace_members` select policy permits reading *teammates'* membership rows too (that is what makes Settings → Team work). Omitting `.eq("user_id", user.id)` would hand a user their colleagues' memberships as if they were their own.
- **RLS is no longer a filter.** From this phase on it only answers "may this user touch this workspace at all". Every dashboard query must carry its own `.eq("workspace_id", …)`. Task 6 audits this; do not skip it.
- **`accept_workspace_invite` is rewritten in Task 5, not earlier.** Enabling multi-membership before the switcher exists would strand a user on whichever workspace the fallback picks.
- Migrations: new files only, timestamped after `20260806000003`. Never edit an applied migration. Test with `npx supabase db reset`.
- Every `security definer` function: `set search_path = public`.
- Route paths come from `ROUTES` / `DASHBOARD_PATH` (`lib/routes.ts`, `lib/dashboard-access.ts`) — never hardcoded strings. User-facing errors go through `APP_ERROR_CODE` / `appErrorMessage` (`.claude/rules/errors.md`).
- After UI tasks: `npm run doctor`. After every task: `graphify update .` — **note the knowledge graph is currently corrupt** (`graphify query` fails with `Graph.import: serialized node is missing its key`, and a rebuild in `22740a5` did not fix it). If `update` also fails, say so in the commit body and move on rather than blocking.
- One commit per task.

## File Structure

**Create:**
- `lib/active-workspace.ts` — cookie constant, the pure picker, and the IO resolvers. The one place that decides which workspace is active.
- `lib/active-workspace.test.ts` — unit tests for the pure picker (runs in the `unit` project, no database).
- `app/dashboard/workspace-actions.ts` — the `switchWorkspaceAction` server action.
- `components/workspace-list-context.tsx` — client context carrying the user's workspaces + the active id, mirroring `components/dashboard-role-context.tsx`.
- `components/workspace-switcher.tsx` — the sidebar dropdown.
- `supabase/migrations/20260806000004_accept_invite_multi_workspace.sql` — the bug fix.
- `tests/db/accept-invite-multi-workspace.test.ts` — proves a second membership is created.

**Modify:**
- `lib/workspace-session.ts` — `getSessionWorkspaceId()` delegates to the resolver (fixes 6 call sites).
- `lib/workspace-invites.ts` — `requireOwnerWorkspace()` uses the active workspace and its per-workspace role (fixes 17 files).
- `lib/dashboard-user.ts` — active workspace + per-workspace role.
- `proxy.ts:120-130` — gate setup/billing on the active workspace.
- `app/dashboard/layout.tsx` — fetch the workspace list, provide the context.
- `components/app-sidebar.tsx:151-164` — render the switcher in `SidebarHeader`.

---

### Task 1: The active-workspace resolver

**Files:**
- Create: `lib/active-workspace.ts`
- Test: `lib/active-workspace.test.ts`

**Interfaces:**
- Consumes: `createClient()` from `@/lib/supabase/server`; `cookies()` from `next/headers`; `isWorkspaceRole` / `WorkspaceRole` from `@/lib/workspace-roles`.
- Produces, for Tasks 2–5:
  - `ACTIVE_WORKSPACE_COOKIE = "eve_active_workspace"`
  - `type WorkspaceMembership = { workspaceId: string; role: WorkspaceRole }`
  - `type MyWorkspace = { id: string; name: string; slug: string | null; role: WorkspaceRole }`
  - `type ActiveWorkspace = { workspaceId: string; role: WorkspaceRole; memberships: WorkspaceMembership[] }`
  - `pickActiveWorkspace(cookieValue, lastUsedWorkspaceId, memberships): WorkspaceMembership | null` — pure, no IO.
  - `getActiveWorkspace(): Promise<ActiveWorkspace | null>`
  - `listMyWorkspaces(): Promise<MyWorkspace[]>`

The picker is deliberately pure so the security-critical rule ("a cookie naming a workspace you don't belong to is ignored") is unit-testable without a database, a session, or a browser.

- [ ] **Step 1: Write the failing test**

Create `lib/active-workspace.test.ts`:

```ts
/**
 * The pure half of active-workspace resolution. No database, no cookies —
 * this is where the security rule lives: the picker can only ever return a
 * workspace present in the caller's membership list.
 */
import { describe, expect, it } from "vitest";
import { pickActiveWorkspace, type WorkspaceMembership } from "./active-workspace";

const ALPHA = "11111111-1111-4111-8111-111111111111";
const BRAVO = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

const memberships: WorkspaceMembership[] = [
  { workspaceId: ALPHA, role: "owner" },
  { workspaceId: BRAVO, role: "staff" },
];

describe("pickActiveWorkspace", () => {
  it("honours a cookie naming a workspace the user belongs to", () => {
    expect(pickActiveWorkspace(BRAVO, ALPHA, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });

  it("ignores a cookie naming a workspace the user does not belong to", () => {
    // The whole security property: a forged or stale cookie must never grant
    // access. It falls back rather than being honoured.
    expect(pickActiveWorkspace(STRANGER, ALPHA, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
  });

  it("falls back to the last-used workspace when there is no cookie", () => {
    expect(pickActiveWorkspace(null, BRAVO, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });

  it("falls back to the first membership when neither cookie nor last-used is usable", () => {
    expect(pickActiveWorkspace(null, STRANGER, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
    expect(pickActiveWorkspace("", null, memberships)).toEqual({
      workspaceId: ALPHA,
      role: "owner",
    });
  });

  it("returns null when the user belongs to nothing", () => {
    expect(pickActiveWorkspace(ALPHA, ALPHA, [])).toBeNull();
  });

  it("tolerates surrounding whitespace in the cookie", () => {
    expect(pickActiveWorkspace(` ${BRAVO} `, null, memberships)).toEqual({
      workspaceId: BRAVO,
      role: "staff",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/active-workspace.test.ts --project=unit`
Expected: FAIL — `Cannot find module './active-workspace'`.

- [ ] **Step 3: Write the implementation**

Create `lib/active-workspace.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/active-workspace.test.ts --project=unit`
Expected: PASS, 6 passed.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
graphify update .
git add lib/active-workspace.ts lib/active-workspace.test.ts
git commit -m "feat(tenancy): add active-workspace resolver with a pure picker"
```

---

### Task 2: Wire the resolver into the two chokepoints

**Files:**
- Modify: `lib/workspace-session.ts:5-19`
- Modify: `lib/workspace-invites.ts:57-88` (`requireOwnerWorkspace`)
- Modify: `lib/dashboard-user.ts:14-59`

**Interfaces:**
- Consumes: `getActiveWorkspace()` from Task 1.
- Produces: no signature changes at all. `getSessionWorkspaceId()`, `requireOwnerWorkspace()` and `getDashboardUser()` keep their exact return shapes; only the workspace they resolve to changes.

This is the highest-leverage task in the plan: `getSessionWorkspaceId()` has 6 call sites (`lib/analytics-data.ts`, `lib/conversations-dashboard.ts` ×2, `lib/notifications.ts` ×4, `app/api/dashboard/search/route.ts`, `lib/sync-cal-bookings.ts`) and `requireOwnerWorkspace()` is used by 17 files. None of them need editing — they inherit the behaviour.

Because every user still has exactly one membership until Task 5, this task changes nothing observable. That is intentional.

- [ ] **Step 1: Point `getSessionWorkspaceId` at the active workspace**

Replace the whole body of `lib/workspace-session.ts`:

```ts
import { getActiveWorkspace } from "@/lib/active-workspace";

/** Cookie-session workspace helpers — not safe for Eve agent tool bundles. */

/**
 * The workspace the dashboard is currently showing. Resolves through
 * `getActiveWorkspace()`, so every caller (analytics, notifications,
 * conversations, dashboard search, Cal sync) follows the workspace switcher
 * without needing to know it exists.
 */
export async function getSessionWorkspaceId(): Promise<string | null> {
  const active = await getActiveWorkspace();
  return active?.workspaceId ?? null;
}

export async function requireSessionWorkspaceId(): Promise<string> {
  const id = await getSessionWorkspaceId();
  if (!id) {
    throw new Error("Account is not assigned to a workspace.");
  }
  return id;
}
```

- [ ] **Step 2: Point `requireOwnerWorkspace` at the active workspace's role**

In `lib/workspace-invites.ts`, replace the `requireOwnerWorkspace` function (currently reading `profiles.workspace_id` and `profiles.role`) with:

```ts
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

  // Role is per workspace now: a user may own one workspace and be staff in
  // another, so the check must be against the ACTIVE workspace's membership,
  // not the legacy profiles.role column.
  const active = await getActiveWorkspace();
  if (!active) {
    return { ok: false, error: "no_workspace" };
  }
  if (active.role !== WORKSPACE_ROLE.OWNER) {
    return { ok: false, error: "owner_required" };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    workspaceId: active.workspaceId,
  };
}
```

Add the import at the top of the same file, alongside the existing ones:

```ts
import { getActiveWorkspace } from "@/lib/active-workspace";
```

- [ ] **Step 3: Point `getDashboardUser` at the active workspace**

In `lib/dashboard-user.ts`, replace the profile/workspace resolution. The function keeps its exact return type; only the source of `workspaceId` and `role` changes:

```ts
import { getActiveWorkspace } from "@/lib/active-workspace";
import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";
import type { WorkspaceRole } from "@/lib/workspace-roles";

export type DashboardNavUser = {
  name: string;
  email: string;
  avatar: string;
};

export async function getDashboardUser(): Promise<{
  navUser: DashboardNavUser;
  userId: string;
  workspaceId: string | null;
  workspaceSlug: string | null;
  bookingPagePath: string | null;
  role: WorkspaceRole | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, active] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    getActiveWorkspace(),
  ]);

  let workspaceSlug: string | null = null;
  if (active?.workspaceId) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("slug")
      .eq("id", active.workspaceId)
      .maybeSingle();
    workspaceSlug = ws?.slug ?? null;
  }

  return {
    navUser: {
      name: profile?.full_name || user.email?.split("@")[0] || "Account",
      email: profile?.email || user.email || "",
      avatar: "",
    },
    userId: user.id,
    workspaceId: active?.workspaceId ?? null,
    workspaceSlug,
    bookingPagePath: workspaceSlug ? publicBookingPath(workspaceSlug) : null,
    role: active?.role ?? null,
  };
}
```

Note the now-unused `isWorkspaceRole` import must be removed from this file — the role now arrives already validated from `getActiveWorkspace()`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. A complaint about an unused import in `lib/dashboard-user.ts` means Step 3's cleanup was missed.

- [ ] **Step 5: Verify nothing changed for single-membership users**

Run: `npm test`
Expected: no new failures.

Then start the app (`npm run dev`), sign in, and confirm `/dashboard`, `/dashboard/leads`, `/dashboard/notifications` and `/dashboard/settings` show exactly what they showed before. Every user still has one membership, so any difference here is a bug in this task.

- [ ] **Step 6: Commit**

```bash
graphify update .
git add lib/workspace-session.ts lib/workspace-invites.ts lib/dashboard-user.ts
git commit -m "feat(tenancy): resolve dashboard workspace through the active-workspace resolver"
```

---

### Task 3: Gate setup and billing on the active workspace in `proxy.ts`

**Files:**
- Modify: `proxy.ts:118-191`

**Interfaces:**
- Consumes: `ACTIVE_WORKSPACE_COOKIE` and `pickActiveWorkspace` from Task 1.
- Produces: no new exports. After this task the setup-wizard and subscription redirects follow the active workspace.

`proxy.ts` builds its own Supabase client from `request.cookies` and cannot call `getActiveWorkspace()` (which reads `next/headers`). It therefore reuses the *pure* picker with inputs it gathers itself — which is exactly why the picker was extracted. Both paths must agree: if proxy resolved a different workspace than the app, a user could be redirected to the setup wizard for a workspace they are not looking at.

- [ ] **Step 1: Import the resolver pieces**

At the top of `proxy.ts`, add one new import:

```ts
import {
  ACTIVE_WORKSPACE_COOKIE,
  pickActiveWorkspace,
  type WorkspaceMembership,
} from "@/lib/active-workspace";
```

and **extend the existing** `@/lib/workspace-roles` import rather than adding a second one from the same module. It currently reads `import { WORKSPACE_ROLE } from "@/lib/workspace-roles";` and must become:

```ts
import {
  WORKSPACE_ROLE,
  isWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/workspace-roles";
```

All three are used below: `WORKSPACE_ROLE` for the owner comparison, `isWorkspaceRole` to filter membership rows, and the `WorkspaceRole` type in the `.map()` cast.

- [ ] **Step 2: Replace the profile lookup with active-workspace resolution**

Replace the block that currently starts `if (user && path.startsWith(DASHBOARD_PATH.root)) {` and does a single `profiles` select with embedded `workspaces(...)`. The new version fetches memberships with the gating columns embedded, plus the last-used fallback, in parallel:

```ts
  if (user && path.startsWith(DASHBOARD_PATH.root)) {
    // Two queries instead of the previous one: memberships (with each
    // workspace's gating columns embedded) and the last-used fallback. Both
    // inputs are required so this resolves to the SAME workspace as
    // getActiveWorkspace() does in the app — a mismatch would redirect users
    // into the setup wizard for a workspace they are not viewing.
    const [membersResult, profileResult] = await Promise.all([
      supabase
        .from("workspace_members")
        .select(
          "workspace_id, role, workspaces(setup_completed_at, cal_api_key_encrypted, cal_event_type_id, cal_auth_mode, plan_tier, subscription_status, trial_ends_at, billing_provider, period_ends_at)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const rows = membersResult.data ?? [];
    const memberships: WorkspaceMembership[] = rows
      .filter((row) => isWorkspaceRole(row.role))
      .map((row) => ({
        workspaceId: row.workspace_id as string,
        role: row.role as WorkspaceRole,
      }));

    const active = pickActiveWorkspace(
      request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
      (profileResult.data?.workspace_id as string | null) ?? null,
      memberships,
    );

    if (active) {
      const activeRow = rows.find(
        (row) => (row.workspace_id as string) === active.workspaceId,
      );
      // PostgREST returns a single object for a many-to-one embed but an array
      // when the relationship is inferred as to-many. Accept both.
      const wsRel = activeRow?.workspaces as
        | Record<string, unknown>
        | Record<string, unknown>[]
        | null
        | undefined;
      const ws = (Array.isArray(wsRel) ? wsRel[0] : wsRel) ?? undefined;

      const incomplete = !ws?.setup_completed_at;
      const onSetup = path === DASHBOARD_PATH.setup;
      const isOwner = active.role === WORKSPACE_ROLE.OWNER;
      const bookingLive = isPilotBookingLive({
        workspaceId: active.workspaceId,
        hasEncryptedCalKey: Boolean(ws?.cal_api_key_encrypted),
        calEventTypeId: ws?.cal_event_type_id as number | null,
        calAuthMode: ws?.cal_auth_mode as string | null,
      });

      if (!isNextFlightRequest(request)) {
        if (incomplete && !onSetup && isOwner) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = DASHBOARD_PATH.setup;
          redirectUrl.search = "";
          return NextResponse.redirect(redirectUrl);
        }
        if (!incomplete && bookingLive && onSetup) {
          const redirectUrl = request.nextUrl.clone();
          redirectUrl.pathname = DASHBOARD_PATH.root;
          redirectUrl.search = "";
          return NextResponse.redirect(redirectUrl);
        }

        if (
          !incomplete &&
          isOwner &&
          getBillingMode() !== "test" &&
          !path.startsWith(DASHBOARD_PATH.billing)
        ) {
          const subActive = isSubActive({
            planTier: (ws?.plan_tier as "free" | "starter" | "pro") ?? "free",
            subscriptionStatus: (ws?.subscription_status as SubscriptionStatus | null) ?? null,
            billingProvider: (ws?.billing_provider as "polar" | "sepay" | null) ?? null,
            billingCustomerId: null,
            billingSubscriptionId: null,
            periodEndsAt: (ws?.period_ends_at as string | null) ?? null,
            trialEndsAt: (ws?.trial_ends_at as string | null) ?? null,
          });
          if (!subActive) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = DASHBOARD_PATH.billing;
            redirectUrl.search = "";
            return NextResponse.redirect(redirectUrl);
          }
        }
      }
    }
  }
```

The redirect logic itself is unchanged — only where `ws` and `isOwner` come from.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Verify the gates still fire**

With `npm run dev` running, as a user whose workspace has **not** finished setup: visiting `/dashboard` must still redirect to `/dashboard/setup`. As a user who **has** finished setup with booking live: visiting `/dashboard/setup` must still redirect to `/dashboard`.

If neither redirect fires any more, `active` is resolving to `null` — check that the membership query returns rows.

- [ ] **Step 5: Commit**

```bash
graphify update .
git add proxy.ts
git commit -m "feat(tenancy): gate setup and billing on the active workspace"
```

---

### Task 4: Workspace switcher

**Files:**
- Create: `app/dashboard/workspace-actions.ts`
- Create: `components/workspace-list-context.tsx`
- Create: `components/workspace-switcher.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `components/app-sidebar.tsx:151-164`

**Interfaces:**
- Consumes: `listMyWorkspaces()`, `ACTIVE_WORKSPACE_COOKIE`, `type MyWorkspace` (Task 1); `getDashboardUser()` (Task 2).
- Produces:
  - `switchWorkspaceAction(workspaceId: string): Promise<{ error?: string } | void>`
  - `WorkspaceListProvider({ workspaces, activeWorkspaceId, children })` and `useWorkspaceList(): { workspaces: MyWorkspace[]; activeWorkspaceId: string | null }`
  - `<WorkspaceSwitcher />`

Until Task 5 lands every user has one workspace, so the dropdown renders a single entry. That is the expected state.

- [ ] **Step 1: Write the switch action**

Create `app/dashboard/workspace-actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/active-workspace";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<{ error?: string } | void> {
  const id = workspaceId.trim();
  if (!id) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  // The authorization check. Never trust the id coming from the client: it is
  // only accepted if the caller genuinely has a membership row for it.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", id)
    .maybeSingle();

  if (!membership) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Remember it as last-used so the choice survives losing the cookie.
  await supabase.from("profiles").update({ workspace_id: id }).eq("id", user.id);

  revalidatePath(DASHBOARD_PATH.root, "layout");
}
```

- [ ] **Step 2: Write the context**

Create `components/workspace-list-context.tsx`, mirroring `components/dashboard-role-context.tsx`:

```tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MyWorkspace } from "@/lib/active-workspace";

type WorkspaceListValue = {
  workspaces: MyWorkspace[];
  activeWorkspaceId: string | null;
};

const WorkspaceListContext = createContext<WorkspaceListValue>({
  workspaces: [],
  activeWorkspaceId: null,
});

export function WorkspaceListProvider({
  workspaces,
  activeWorkspaceId,
  children,
}: {
  workspaces: MyWorkspace[];
  activeWorkspaceId: string | null;
  children: ReactNode;
}) {
  return (
    <WorkspaceListContext.Provider value={{ workspaces, activeWorkspaceId }}>
      {children}
    </WorkspaceListContext.Provider>
  );
}

export function useWorkspaceList(): WorkspaceListValue {
  return useContext(WorkspaceListContext);
}
```

- [ ] **Step 3: Write the switcher**

Create `components/workspace-switcher.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { IconCheck, IconChevronDown, IconBuildingStore } from "@tabler/icons-react";
import { switchWorkspaceAction } from "@/app/dashboard/workspace-actions";
import { useWorkspaceList } from "@/components/workspace-list-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId } = useWorkspaceList();
  const [pending, startTransition] = useTransition();

  // Nothing to switch between — keep the chrome quiet.
  if (workspaces.length < 2) return null;

  const active =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          className="w-full justify-between"
          disabled={pending}
          size="sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconBuildingStore className="size-4 shrink-0" />
            <span className="truncate">{active.name}</span>
          </span>
          <IconChevronDown className="size-4 shrink-0 opacity-60" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            className="flex items-center justify-between gap-2"
            key={workspace.id}
            onSelect={() => {
              if (workspace.id === active.id) return;
              startTransition(async () => {
                await switchWorkspaceAction(workspace.id);
              });
            }}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm">{workspace.name}</span>
              <span className="text-muted-foreground text-xs capitalize">
                {workspace.role}
              </span>
            </span>
            {workspace.id === active.id ? (
              <IconCheck className="size-4 shrink-0" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Provide the context from the dashboard layout**

In `app/dashboard/layout.tsx`, fetch the workspace list alongside the existing user lookup and wrap the tree. Replace the body:

```tsx
import { DashboardBookingPathProvider } from "@/components/dashboard-booking-path-context";
import { DashboardRoleProvider } from "@/components/dashboard-role-context";
import { LocaleProvider } from "@/components/locale-provider";
import { WorkspaceListProvider } from "@/components/workspace-list-context";
import { listMyWorkspaces } from "@/lib/active-workspace";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { getDashboardUser } from "@/lib/dashboard-user";
import { readDashboardLocale } from "@/lib/read-locale-cookie";
import { redirect } from "next/navigation";

/** Auth gate only — setup completion is enforced in proxy. */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Independent reads — run them together (async-parallel).
  const [dashboard, workspaces] = await Promise.all([
    getDashboardUser(),
    listMyWorkspaces(),
  ]);
  if (!dashboard) {
    redirect(`/login?next=${DASHBOARD_PATH.root}`);
  }
  const initialLocale = await readDashboardLocale();
  return (
    <LocaleProvider initialLocale={initialLocale} kind="dashboard">
      <DashboardRoleProvider role={dashboard.role}>
        <WorkspaceListProvider
          activeWorkspaceId={dashboard.workspaceId}
          workspaces={workspaces}
        >
          <DashboardBookingPathProvider value={dashboard.bookingPagePath}>
            {children}
          </DashboardBookingPathProvider>
        </WorkspaceListProvider>
      </DashboardRoleProvider>
    </LocaleProvider>
  );
}
```

- [ ] **Step 5: Render the switcher in the sidebar**

In `components/app-sidebar.tsx`, add the import:

```tsx
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
```

and add a second `SidebarMenuItem` inside the existing `SidebarHeader`, directly after the logo item (lines 151-164):

```tsx
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href={DASHBOARD_PATH.root}>
                <EveLogo showLabel size="sm" />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <WorkspaceSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
```

- [ ] **Step 6: Typecheck, doctor, and verify**

Run: `npm run typecheck && npm run doctor`
Expected: no errors; react-doctor reports no new issues.

With `npm run dev`, sign in and confirm the sidebar looks **unchanged** — every user still has one membership, and the switcher returns `null` below two workspaces. Seeing a dropdown at this point means `listMyWorkspaces()` is returning duplicates.

- [ ] **Step 7: Commit**

```bash
graphify update .
git add app/dashboard/workspace-actions.ts components/workspace-list-context.tsx components/workspace-switcher.tsx app/dashboard/layout.tsx components/app-sidebar.tsx
git commit -m "feat(tenancy): add workspace switcher to the dashboard sidebar"
```

---

### Task 5: Let an invite create a second membership — the bug fix

**Files:**
- Create: `supabase/migrations/20260806000004_accept_invite_multi_workspace.sql`
- Create: `tests/db/accept-invite-multi-workspace.test.ts`

**Interfaces:**
- Consumes: `workspace_members` (Phase 1); `withUser` from `tests/helpers/rls-client.ts` (Phase 1 Task 1).
- Produces: `accept_workspace_invite(p_token text)` — same signature and same `jsonb` result shape. `already_in_workspace` is no longer ever returned; `already_member` now means "already a member of *this* workspace" rather than "has any workspace".

This is the commit that fixes the reported problem. Everything before it exists so that this change is safe.

- [ ] **Step 1: Write the failing test**

Create `tests/db/accept-invite-multi-workspace.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/accept-invite-multi-workspace.test.ts`
Expected: FAIL on the first two tests — the RPC still returns `already_in_workspace`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260806000004_accept_invite_multi_workspace.sql`:

```sql
-- Multi-workspace membership — phase 2.
--
-- Removes the already_in_workspace dead end. Anyone who signed up on their own
-- (and so was handed an auto-created workspace by handle_new_user) could never
-- afterwards be invited anywhere: accept_workspace_invite refused every
-- invitee who already had a workspace, with no recovery path in the UI.
--
-- Membership is no longer exclusive, so the correct question is not "does this
-- user have a workspace" but "is this user already in THIS workspace".
--
-- 20260726000001's guarantee is preserved and in fact strengthened: that
-- migration refused to move a user out of their existing workspace because
-- doing so had been silently deleting it. Nothing is moved or deleted here —
-- a membership is added alongside the existing one.

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

  -- Already in THIS workspace: no-op, and deliberately do not consume the
  -- invite or touch the role (an owner clicking their own link must stay
  -- owner — the lockout fixed in 20260726000001).
  if exists (
    select 1 from public.workspace_members
    where user_id = uid and workspace_id = inv.workspace_id
  ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'already_member',
      'workspaceId', inv.workspace_id
    );
  end if;

  -- Additive: any existing membership is left exactly as it is.
  insert into public.workspace_members (user_id, workspace_id, role)
  values (uid, inv.workspace_id, inv.role);

  -- Make the freshly joined workspace the last-used one, so the user lands in
  -- it on the next page load even before the switcher writes its cookie.
  update public.profiles
  set workspace_id = inv.workspace_id,
      role = inv.role,
      updated_at = now()
  where id = uid;

  update public.workspace_invites
  set accepted_at = now(),
      accepted_by = uid
  where id = inv.id;

  return jsonb_build_object('ok', true, 'workspaceId', inv.workspace_id);
end;
$$;

comment on function public.accept_workspace_invite(text) is
  'Adds a membership for the invited workspace. Membership is not exclusive: an existing membership elsewhere is left untouched. Returns already_member only when the caller is already in THIS workspace.';
```

- [ ] **Step 4: Apply and run the test**

Run: `npx supabase db reset && npx vitest run tests/db/accept-invite-multi-workspace.test.ts`
Expected: PASS, 4 passed (not skipped).

- [ ] **Step 5: Re-run the Phase 1 suites**

Run: `npx vitest run tests/db/ tests/handle-new-user-oauth-invite.test.ts`
Expected: all pass — Phase 1's 14 plus this task's 4.

`APP_ERROR_CODE.INVITE_ALREADY_IN_WORKSPACE` and its branch in `mapAcceptError` (`app/dashboard/settings/invite-actions.ts`) are now unreachable. Leave them: they are harmless, and removing them is unrelated cleanup.

- [ ] **Step 6: Commit**

```bash
graphify update .
git add supabase/migrations/20260806000004_accept_invite_multi_workspace.sql tests/db/accept-invite-multi-workspace.test.ts
git commit -m "fix(tenancy): let an invite add a second workspace membership"
```

---

### Task 6: Cross-workspace leak audit and acceptance

**Files:** none unless the audit finds a defect — then fix in place.

**Interfaces:** exercises Tasks 1–5 together.

RLS has stopped being a filter. A dashboard query missing `.eq("workspace_id", …)` now returns rows from every workspace the user belongs to — silently, with no crash and no log line. For a single-membership user (everyone before Task 5) the behaviour is identical, so this class of bug appears **only** for the users this feature exists for. That is exactly why it needs a deliberate pass rather than trust.

- [ ] **Step 1: Enumerate the dashboard read paths**

Run:

```bash
npx rg -n --glob '!*.test.ts' 'from\("(leads|bookings|notifications|chat_sessions|chat_messages|conversation_logs|workspace_faq_items|workspace_event_types|billing_payments|agent_tool_events|booking_reminders)"\)' -A 6 lib app
```

For every hit, classify it:

- **Cookie-bound client** (imports `createClient` from `@/lib/supabase/server`) → **must** carry an explicit `.eq("workspace_id", …)`, or reach the tenant through a column already scoped by the caller. These are the risky ones.
- **Admin client** (`createAdminClient` from `@/lib/supabase/admin`) → service role bypasses RLS entirely and always receives an explicit `workspaceId` argument; not affected by this change.
- **Guest/agent path** (`/b/[slug]`, `eve_w`, `resolveWorkspaceIdFromAgentContext`) → resolves tenants by slug, out of scope.

Known cookie-bound readers to check first: `lib/analytics-data.ts`, `lib/conversations-dashboard.ts`, `lib/notifications.ts`, `app/api/dashboard/search/route.ts`, and the `app/dashboard/**/actions.ts` files.

- [ ] **Step 2: Fix anything unscoped**

Any cookie-bound tenant read without an explicit workspace filter gets one, sourced from `getSessionWorkspaceId()` (or `requireOwnerWorkspace().workspaceId` for owner-gated mutations). Commit each fix with a message naming the file and the leak it closes.

If the audit finds nothing, record that in the Task 6 commit message rather than leaving it unexplained.

- [ ] **Step 3: Two-membership acceptance test, by hand**

Set up: account **A** signs up normally (owns workspace *Alpha*). Account **B** signs up normally (owns *Bravo*), then B invites A's email as staff. A accepts from `/invite/[token]` or the pending-invite banner.

Verify, as A:

1. The sidebar now shows the switcher with **two** entries, *Alpha* (owner) and *Bravo* (staff).
2. With *Alpha* active: leads, bookings, conversations, notifications and analytics show only *Alpha*'s data.
3. Switch to *Bravo*: the same five pages show only *Bravo*'s data, and nothing from *Alpha* leaks in.
4. Switch back to *Alpha*: *Alpha*'s data returns.
5. Reload the page after switching — the choice survives (cookie), and survives clearing only that cookie (last-used fallback in `profiles.workspace_id`).

- [ ] **Step 4: Verify role is per workspace**

Still as A, with *Alpha* active (owner): Settings, Setup, Agent, FAQ, Meeting Types, Embed and Billing are reachable.

Switch to *Bravo* (staff): those same owner-only pages must now be refused, and the sidebar must not offer them. This is `OWNER_ONLY_PATHS` / `canAccessDashboardPath` reading the per-workspace role — if owner-only pages stay visible in *Bravo*, `getDashboardUser()` is still returning the legacy `profiles.role`.

- [ ] **Step 5: Verify the cookie is not an authorisation**

With A signed in, replace the `eve_active_workspace` cookie value with a workspace id A does not belong to (take one from Studio), then reload `/dashboard`.

Expected: the app falls back to a legitimate workspace and shows its data. It must **never** render the stranger workspace's data, and must not error out.

- [ ] **Step 6: Verify removal revokes access**

As *Bravo*'s owner (B), remove A from the workspace in Settings → Team. Then, as A, reload the dashboard.

Expected, all three:

1. *Bravo* disappears from the switcher, and A can no longer see any *Bravo* data even if the cookie still names it. This is the case that ruled JWT custom claims out of the design — access must end immediately, not at the next token refresh.
2. **A's *Alpha* membership is untouched**: A lands in *Alpha* with owner rights and all of *Alpha*'s data intact. Removal must take exactly one membership, never cascade to the others.
3. Confirm in Studio that exactly one row was deleted:

```sql
select workspace_id, role from public.workspace_members
where user_id = '<A user id>';
```
Expected: one row, *Alpha*, role `owner`.

- [ ] **Step 7: Full regression**

Run: `npm run typecheck && npm test && npm run doctor:full`
Expected: no failures. Confirm the db-integration project reports **passed**, not skipped.

- [ ] **Step 8: Record completion**

Update the status line in `docs/superpowers/specs/2026-08-06-multi-workspace-design.md`:

```markdown
**Phase 1 status:** implemented 2026-08-06 (migrations 20260806000001–20260806000003).
**Phase 2 status:** implemented 2026-08-06 (migration 20260806000004 + active-workspace resolver and switcher).
```

- [ ] **Step 9: Commit**

```bash
graphify update .
git add docs/superpowers/specs/2026-08-06-multi-workspace-design.md
git commit -m "docs(tenancy): mark multi-workspace Phase 2 complete"
```

---

## Deliberately not in this plan

Carried over from the spec's out-of-scope list, restated so they are not mistaken for oversights:

- **Creating a second workspace from the UI.** Additional memberships arrive only by invitation. There is still no `insert` policy on `workspaces`; adding one is a separate decision.
- **URL-based workspace routing** (`/w/[slug]/…`). Rejected because of 145 `/dashboard` path strings across 57 files plus `notifications.href` values already stored in the database. The known cost of the cookie approach is accepted: two browser tabs cannot show two different workspaces, and dashboard links are not shareable across workspaces.
- **Dropping `profiles.workspace_id` / `profiles.role`.** They remain as last-used and legacy respectively. Removing them is a later cleanup once nothing reads them — `handle_new_user` and the dual-writing RPCs still maintain both.
- **Dropping `current_user_is_workspace_owner()`.** Unused since Phase 1 Task 3, but left defined. Worth a small follow-up migration once confirmed unreferenced in every environment.
- **Cross-workspace aggregate views** ("all my bookings everywhere").
- **Roles beyond `owner` / `staff`.**
