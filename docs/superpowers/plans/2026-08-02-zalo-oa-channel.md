# Zalo OA Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a guest message a tenant's Zalo Official Account and have the eve agent answer and book appointments in that tenant's workspace.

**Architecture:** A normalised `workspace_channel_connections` table replaces per-channel columns on `workspaces` (Messenger moves onto it too). Zalo follows the Messenger file split — API client, webhook parser, OAuth module, eve channel — with two departures: the workspace is resolved from the payload's `oa_id` rather than a URL parameter, and the single-use refresh token is guarded by a database-level claim.

**Tech Stack:** Next.js (App Router), Supabase/Postgres, eve agent framework, Vitest, TypeScript.

Spec: `docs/superpowers/specs/2026-08-02-zalo-oa-channel-design.md`

## Global Constraints

- **graphify first.** Before Read/Grep/Glob exploration, run `graphify query "<question>"`. After code edits, run `graphify update .`. (`.claude/rules/graphify.md`)
- **Tenant always explicit.** Every data path carries a `workspace_id`. A tenant hint that fails to resolve is an error, never a fallback to Pilot. (`.claude/rules/tenant-isolation.md`)
- **No `using (true)` RLS** on any tenant table. Secret-bearing tables get no `authenticated` policies at all. (`.claude/rules/supabase-migrations.md`)
- **Secrets encrypted** via `encryptSecret` / `decryptSecret` from `lib/workspace-secrets.ts`. Never a plaintext column.
- **Routes from constants.** Use `ROUTES` / `DASHBOARD_PATH` from `lib/routes.ts`. No hardcoded path strings. (`.claude/rules/code-structure.md`)
- **Never edit an applied migration.** New timestamped file, sorting after `20260801000003`.
- **Layering:** `lib/` is UI-free domain logic; `app/api/` handlers call `lib/`; `agent/channels/` calls `lib/`. No Zalo HTTP calls inside components or route handlers.
- **Small diffs.** No drive-by refactors beyond what each task names.
- **After UI edits:** `npm run doctor`.
- **Commit after every task.** Message style matches recent history (`fix(auth): …`, `refactor(routes): …`).

**New env vars** (add to `.env.example` in Task 10): `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`, `ZALO_REDIRECT_URI`, `ZALO_DRY_RUN`.

**Vitest env:** `vitest.config.mts` sets env vars for tests. Zalo vars are added there in Task 3.

**Database-backed tests** (Task 1, 2, 6, 9) need `npx supabase start` running. They must *skip*, not fail, when it is not.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260802000001_channel_connections.sql` | Table, indexes, RLS, Messenger backfill |
| `lib/channel-connections.ts` | Provider-agnostic connection storage + refresh lock |
| `lib/channel-connections.test.ts` | Storage + lock behaviour against real Postgres |
| `lib/zalo.ts` | Zalo API client — OAuth URLs, token calls, send, chunking |
| `lib/zalo.test.ts` | Chunking (pure) + transport contract (fetch stubbed) |
| `lib/zalo-webhook.ts` | Signature verification + event parsing |
| `lib/zalo-webhook.test.ts` | Pure-function tests |
| `lib/zalo-oauth.ts` | PKCE, connect, refresh-with-lock policy |
| `lib/zalo-oauth.test.ts` | Exchange contract + rotation concurrency |
| `lib/__fixtures__/zalo/*.json` | Captured API shapes |
| `app/api/zalo/oauth/start/route.ts` | Owner + plan gate → authorize redirect |
| `app/api/zalo/oauth/callback/route.ts` | State verify → exchange → persist |
| `app/_components/zalo-connection-card.tsx` | Settings card |
| `agent/channels/zalo.ts` | Webhook → agent → reply |
| `agent/channels/zalo.test.ts` | Handler tests incl. tenant isolation |
| `scripts/zalo-sim.mjs` | Local signed-webhook simulator |

**Modified:**

| File | Change |
|---|---|
| `lib/cal-oauth-state.ts` | Optional `codeVerifier` in state payload; Zalo cookie name |
| `lib/messenger-oauth.ts` | Persist/clear through `lib/channel-connections.ts` |
| `lib/workspace.ts` | `getMessengerCredentialsForWorkspace` rewired; add `getZaloCredentialsForWorkspace` |
| `lib/chat-sessions.ts` | Add `chatMessageExists` for dedupe |
| `lib/plan-features.ts` | Add `ZALO` feature at Starter tier |
| `lib/plan-features.test.ts` | Cover the new feature |
| `lib/errors/app-codes.ts` + `app-messages.ts` | Five `ZALO_*` codes |
| `app/dashboard/settings/page.tsx` | Read connections; render Zalo card |
| `app/dashboard/settings/actions.ts` | `disconnectZaloAction` |
| `messages/en.json`, `messages/vi.json` | `plans.features.zalo` |
| `vitest.config.mts` | Zalo test env vars |
| `supabase/seed.sql` | Fake Zalo connection for Pilot |
| `.env.example` | New vars |
| `.claude/skills/test-feature/SKILL.md` | Live-account checklist |

---

## Task 1: Channel connections table and access layer

**Files:**
- Create: `supabase/migrations/20260802000001_channel_connections.sql`
- Create: `lib/channel-connections.ts`
- Test: `lib/channel-connections.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`; `encryptSecret` / `decryptSecret` from `@/lib/workspace-secrets`.
- Produces:
  ```ts
  export type ChannelProvider = "messenger" | "zalo";
  export type ChannelConnection = {
    workspaceId: string;
    provider: ChannelProvider;
    externalId: string;
    displayName: string | null;
    accessToken: string | null;   // decrypted
    refreshToken: string | null;  // decrypted
    expiresAt: string | null;     // ISO
    metadata: Record<string, unknown>;
  };
  export const CHANNEL_EXTERNAL_ID_TAKEN = "CHANNEL_EXTERNAL_ID_TAKEN";
  export function getChannelConnection(workspaceId: string, provider: ChannelProvider): Promise<ChannelConnection | null>;
  export function getChannelConnectionByExternalId(provider: ChannelProvider, externalId: string): Promise<ChannelConnection | null>;
  export function upsertChannelConnection(input: {
    workspaceId: string; provider: ChannelProvider; externalId: string;
    displayName?: string | null; accessToken?: string | null;
    refreshToken?: string | null; expiresAt?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  export function deleteChannelConnection(workspaceId: string, provider: ChannelProvider): Promise<void>;
  export function claimRefreshLock(workspaceId: string, provider: ChannelProvider): Promise<{ claimed: boolean; refreshToken: string | null }>;
  export function releaseRefreshLock(workspaceId: string, provider: ChannelProvider): Promise<void>;
  ```

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260802000001_channel_connections.sql`:

```sql
-- Normalised per-workspace messaging channel credentials.
-- Replaces the messenger_* columns on public.workspaces (dropped in a
-- follow-up migration once this path has shipped).
create table if not exists public.workspace_channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider text not null check (provider in ('messenger', 'zalo')),
  external_id text not null,
  display_name text,
  access_encrypted text,
  refresh_encrypted text,
  expires_at timestamptz,
  refresh_lock_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One connection per provider per workspace: two OAs on one workspace would
-- make "which one replies" undefined.
create unique index if not exists wcc_workspace_provider_uidx
  on public.workspace_channel_connections (workspace_id, provider);

-- Tenant isolation: one external account maps to exactly one workspace, so
-- webhook resolution by external_id can never be ambiguous.
create unique index if not exists wcc_provider_external_uidx
  on public.workspace_channel_connections (provider, external_id);

-- This table stores secrets. RLS is enabled with NO policies for
-- `authenticated` — every read goes through the service-role client in
-- server-side code that has already resolved the caller's workspace.
alter table public.workspace_channel_connections enable row level security;

-- Backfill existing Messenger connections.
insert into public.workspace_channel_connections
  (workspace_id, provider, external_id, display_name, access_encrypted)
select id,
       'messenger',
       messenger_page_id,
       messenger_page_name,
       messenger_page_access_token_encrypted
  from public.workspaces
 where messenger_page_id is not null
on conflict (workspace_id, provider) do nothing;
```

- [ ] **Step 2: Apply it and confirm it is clean**

Run: `npx supabase db reset`
Expected: completes with no error; every migration plus `seed.sql` applies.

Then confirm RLS is on and that no policy grants `authenticated` access. Get the
connection string from `npx supabase status` (the `DB URL` line) and run:

```bash
psql "<DB URL from supabase status>" -c "select relname, relrowsecurity from pg_class where relname = 'workspace_channel_connections';" -c "select count(*) as policy_count from pg_policies where tablename = 'workspace_channel_connections';"
```

Expected: `relrowsecurity` = `t`, `policy_count` = `0`. RLS on with zero policies is
deny-by-default for `authenticated` — which is the intent, not an oversight.

- [ ] **Step 3: Write the failing tests**

Create `lib/channel-connections.test.ts`. These run against local Postgres because the refresh lock is a database behaviour — a mocked client would make the concurrency test meaningless.

```ts
/**
 * Channel connection storage + refresh lock.
 * Requires a local Supabase (`npx supabase start`) — skipped otherwise.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  claimRefreshLock,
  deleteChannelConnection,
  getChannelConnection,
  getChannelConnectionByExternalId,
  releaseRefreshLock,
  upsertChannelConnection,
} from "./channel-connections";

const WS_A = "00000000-0000-4000-8000-000000000001"; // Pilot, from seed.sql

/**
 * Probe at module scope, not in beforeAll. `describe.skipIf` is evaluated when
 * the file is collected, which happens before any hook runs — a flag set in
 * beforeAll is still false at that point, so every test would silently skip
 * and the suite would look green while proving nothing.
 */
const { dbUp, WS_B } = await (async () => {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("workspaces").select("id").limit(1);
    if (error) return { dbUp: false, WS_B: "" };

    const { data } = await admin
      .from("workspaces")
      .insert({ name: "Zalo Test WS", slug: `zalo-test-${Date.now()}` })
      .select("id")
      .single();
    return { dbUp: true, WS_B: (data!.id as string) };
  } catch {
    return { dbUp: false, WS_B: "" };
  }
})();

afterEach(async () => {
  if (!dbUp) return;
  await deleteChannelConnection(WS_A, "zalo");
  if (WS_B) await deleteChannelConnection(WS_B, "zalo");
});

describe.skipIf(!dbUp)("channel connections", () => {
  it("round-trips a connection with decrypted tokens", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A,
      provider: "zalo",
      externalId: "oa_1",
      displayName: "Test OA",
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const conn = await getChannelConnection(WS_A, "zalo");
    expect(conn?.externalId).toBe("oa_1");
    expect(conn?.accessToken).toBe("access-1");
    expect(conn?.refreshToken).toBe("refresh-1");
  });

  it("never stores the token in plaintext", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_1",
      accessToken: "super-secret-token",
    });

    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_channel_connections")
      .select("access_encrypted")
      .eq("workspace_id", WS_A)
      .eq("provider", "zalo")
      .single();

    expect(data!.access_encrypted).not.toContain("super-secret-token");
  });

  it("resolves a workspace from the external id", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_lookup",
    });
    const conn = await getChannelConnectionByExternalId("zalo", "oa_lookup");
    expect(conn?.workspaceId).toBe(WS_A);
  });

  it("refuses to link one OA to a second workspace", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_shared",
    });
    await expect(
      upsertChannelConnection({
        workspaceId: WS_B, provider: "zalo", externalId: "oa_shared",
      }),
    ).rejects.toThrow(CHANNEL_EXTERNAL_ID_TAKEN);
  });

  it("lets exactly one of two concurrent callers claim the lock", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_lock",
      refreshToken: "refresh-1",
    });

    const [a, b] = await Promise.all([
      claimRefreshLock(WS_A, "zalo"),
      claimRefreshLock(WS_A, "zalo"),
    ]);

    expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
    const winner = a.claimed ? a : b;
    expect(winner.refreshToken).toBe("refresh-1");
  });

  it("reclaims a lock older than 30 seconds", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_stale",
      refreshToken: "refresh-1",
    });
    const admin = createAdminClient();
    await admin
      .from("workspace_channel_connections")
      .update({ refresh_lock_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("workspace_id", WS_A)
      .eq("provider", "zalo");

    const claim = await claimRefreshLock(WS_A, "zalo");
    expect(claim.claimed).toBe(true);
  });

  it("allows a new claim after release", async () => {
    await upsertChannelConnection({
      workspaceId: WS_A, provider: "zalo", externalId: "oa_rel",
      refreshToken: "refresh-1",
    });
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(true);
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(false);
    await releaseRefreshLock(WS_A, "zalo");
    expect((await claimRefreshLock(WS_A, "zalo")).claimed).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx supabase start && npx vitest run lib/channel-connections.test.ts`
Expected: FAIL — `Cannot find module './channel-connections'`.

- [ ] **Step 5: Implement the module**

Create `lib/channel-connections.ts`:

```ts
/**
 * Per-workspace messaging channel credentials, provider-agnostic.
 *
 * Secrets are encrypted here and nowhere else, and every read goes through the
 * service-role client — the table has RLS on with no `authenticated` policies.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/workspace-secrets";

export type ChannelProvider = "messenger" | "zalo";

export type ChannelConnection = {
  workspaceId: string;
  provider: ChannelProvider;
  externalId: string;
  displayName: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  metadata: Record<string, unknown>;
};

/** Thrown when an external account already belongs to another workspace. */
export const CHANNEL_EXTERNAL_ID_TAKEN = "CHANNEL_EXTERNAL_ID_TAKEN";

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/** A lock held longer than this belonged to an instance that died. */
const LOCK_STALE_MS = 30_000;

const ROW_SELECT =
  "workspace_id, provider, external_id, display_name, access_encrypted, refresh_encrypted, expires_at, metadata";

type Row = {
  workspace_id: string;
  provider: string;
  external_id: string;
  display_name: string | null;
  access_encrypted: string | null;
  refresh_encrypted: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

/**
 * Decrypt defensively: a row encrypted under a rotated key would otherwise
 * throw deep inside a webhook handler instead of reading as "not connected".
 */
function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function toConnection(row: Row): ChannelConnection {
  return {
    workspaceId: row.workspace_id,
    provider: row.provider as ChannelProvider,
    externalId: row.external_id,
    displayName: row.display_name,
    accessToken: safeDecrypt(row.access_encrypted),
    refreshToken: safeDecrypt(row.refresh_encrypted),
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
  };
}

export async function getChannelConnection(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<ChannelConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .select(ROW_SELECT)
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toConnection(data as Row) : null;
}

export async function getChannelConnectionByExternalId(
  provider: ChannelProvider,
  externalId: string,
): Promise<ChannelConnection | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .select(ROW_SELECT)
    .eq("provider", provider)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? toConnection(data as Row) : null;
}

export async function upsertChannelConnection(input: {
  workspaceId: string;
  provider: ChannelProvider;
  externalId: string;
  displayName?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = createAdminClient();

  const row: Record<string, unknown> = {
    workspace_id: input.workspaceId,
    provider: input.provider,
    external_id: input.externalId,
    display_name: input.displayName ?? null,
    expires_at: input.expiresAt ?? null,
    metadata: input.metadata ?? {},
    refresh_lock_at: null,
    updated_at: new Date().toISOString(),
  };
  if (input.accessToken !== undefined) {
    row.access_encrypted = input.accessToken ? encryptSecret(input.accessToken) : null;
  }
  if (input.refreshToken !== undefined) {
    row.refresh_encrypted = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  }

  const { error } = await supabase
    .from("workspace_channel_connections")
    .upsert(row, { onConflict: "workspace_id,provider" });

  if (error) {
    // The (provider, external_id) index — this account belongs to someone else.
    if (error.code === UNIQUE_VIOLATION) throw new Error(CHANNEL_EXTERNAL_ID_TAKEN);
    throw new Error(error.message);
  }
}

export async function deleteChannelConnection(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspace_channel_connections")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);

  if (error) throw new Error(error.message);
}

/**
 * Claim the right to refresh this connection's token.
 *
 * Zalo refresh tokens are single-use: two concurrent refreshes leave the
 * workspace with no valid credential at all. The claim is a conditional UPDATE
 * so the lock holds across serverless instances, not just within one process.
 */
export async function claimRefreshLock(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<{ claimed: boolean; refreshToken: string | null }> {
  const supabase = createAdminClient();
  const staleCutoff = new Date(Date.now() - LOCK_STALE_MS).toISOString();

  const { data, error } = await supabase
    .from("workspace_channel_connections")
    .update({ refresh_lock_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .or(`refresh_lock_at.is.null,refresh_lock_at.lt.${staleCutoff}`)
    .select("refresh_encrypted");

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return { claimed: false, refreshToken: null };

  return {
    claimed: true,
    refreshToken: safeDecrypt((data[0] as { refresh_encrypted: string | null }).refresh_encrypted),
  };
}

export async function releaseRefreshLock(
  workspaceId: string,
  provider: ChannelProvider,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspace_channel_connections")
    .update({ refresh_lock_at: null })
    .eq("workspace_id", workspaceId)
    .eq("provider", provider);

  if (error) console.error("[channel-connections] lock release failed", error.message);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/channel-connections.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add supabase/migrations/20260802000001_channel_connections.sql lib/channel-connections.ts lib/channel-connections.test.ts
git commit -m "feat(channels): normalised channel connection storage"
```

---

## Task 2: Move Messenger onto the connections table

Removes the second write path immediately so no code reads the old columns. The columns themselves stay for one deploy, so this release can be rolled back.

**Files:**
- Modify: `lib/messenger-oauth.ts`
- Modify: `lib/workspace.ts:650-677`
- Modify: `app/dashboard/settings/page.tsx:45`, `:101-104`, `:182-187`
- Test: `lib/channel-connections.test.ts` (add a Messenger case)

**Interfaces:**
- Consumes: everything Task 1 produced.
- Produces: `getMessengerCredentialsForWorkspace(workspaceId)` keeps its existing signature `Promise<{ pageId: string; pageAccessToken: string }>` — callers in `agent/channels/messenger.ts` do not change.

- [ ] **Step 1: Write the failing test**

Append to `lib/channel-connections.test.ts`, inside the `describe.skipIf(!dbUp)` block:

```ts
  it("serves messenger credentials from the connections table", async () => {
    const { getMessengerCredentialsForWorkspace } = await import("@/lib/workspace");
    await upsertChannelConnection({
      workspaceId: WS_B,
      provider: "messenger",
      externalId: "page_123",
      displayName: "Test Page",
      accessToken: "page-token-abc",
    });

    const creds = await getMessengerCredentialsForWorkspace(WS_B);
    expect(creds.pageId).toBe("page_123");
    expect(creds.pageAccessToken).toBe("page-token-abc");

    await deleteChannelConnection(WS_B, "messenger");
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/channel-connections.test.ts -t "messenger credentials"`
Expected: FAIL — the function still reads `workspaces.messenger_page_access_token_encrypted`, which is null for `WS_B`, so it throws `MESSENGER_NOT_CONFIGURED`.

- [ ] **Step 3: Rewire `lib/messenger-oauth.ts`**

Replace the bodies of `persistMessengerTokens` and `clearMessengerTokens` (keep both exported names and signatures — `app/api/messenger/oauth/callback/route.ts` and `app/dashboard/settings/actions.ts` import them):

```ts
import {
  deleteChannelConnection,
  upsertChannelConnection,
} from "@/lib/channel-connections";

export async function persistMessengerTokens(input: {
  workspaceId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}): Promise<void> {
  await upsertChannelConnection({
    workspaceId: input.workspaceId,
    provider: "messenger",
    externalId: input.pageId,
    displayName: input.pageName,
    accessToken: input.pageAccessToken,
  });
}

export async function clearMessengerTokens(workspaceId: string): Promise<void> {
  // Delete rather than null the fields: a row that reports "disconnected"
  // while still holding a usable token keeps the bot answering.
  await deleteChannelConnection(workspaceId, "messenger");
}
```

Delete the now-unused `createAdminClient` and `encryptSecret` imports from this file. Keep `resolveMessengerRedirectUri` unchanged.

- [ ] **Step 4: Rewire `getMessengerCredentialsForWorkspace` in `lib/workspace.ts`**

Replace the body at `lib/workspace.ts:650-677`, keeping the Pilot env short-circuit exactly as it is:

```ts
export async function getMessengerCredentialsForWorkspace(
  workspaceId: string,
): Promise<{ pageId: string; pageAccessToken: string }> {
  const pilotId = getDefaultWorkspaceId();
  if (workspaceId === pilotId || workspaceId === PILOT_WORKSPACE_ID) {
    const envToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN?.trim();
    const envPageId = process.env.MESSENGER_PAGE_ID?.trim();
    if (envToken && envPageId) return { pageId: envPageId, pageAccessToken: envToken };
    throw new Error("MESSENGER_NOT_CONFIGURED");
  }

  const { getChannelConnection } = await import("@/lib/channel-connections");
  const conn = await getChannelConnection(workspaceId, "messenger");
  if (!conn?.accessToken) throw new Error("MESSENGER_NOT_CONFIGURED");

  return { pageId: conn.externalId, pageAccessToken: conn.accessToken };
}
```

The dynamic import matches the pattern already used for `clearMessengerTokens` in `app/dashboard/settings/actions.ts:235` and keeps `lib/workspace.ts` free of a new top-level dependency.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/channel-connections.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Rewire the settings page read**

In `app/dashboard/settings/page.tsx`:

Remove `messenger_page_id, messenger_page_name` from the `.select(...)` string at line 45.

Delete the two assignments at lines 101–104 and replace the declarations of `messengerPageId` / `messengerPageName` with a connections read, placed alongside the existing `listWorkspaceMembers` call so it runs in the same phase:

```ts
const messengerConn = await getChannelConnection(dashboard.workspaceId, "messenger");
const messengerPageId = messengerConn?.externalId ?? null;
const messengerPageName = messengerConn?.displayName ?? null;
```

Add the import: `import { getChannelConnection } from "@/lib/channel-connections";`

Leave the `<MessengerConnectionCard …>` JSX at lines 182–187 unchanged — the prop names still hold.

- [ ] **Step 7: Verify the page compiles and Messenger still works**

```bash
npm run typecheck
npm run doctor
```

Expected: typecheck clean; doctor reports no new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/messenger-oauth.ts lib/workspace.ts app/dashboard/settings/page.tsx lib/channel-connections.test.ts
git commit -m "refactor(channels): read messenger credentials from connections table"
```

---

## Task 3: Zalo webhook signature and parsing

**Files:**
- Create: `lib/zalo-webhook.ts`
- Create: `lib/zalo-webhook.test.ts`
- Modify: `vitest.config.mts`

**Interfaces:**
- Consumes: nothing from earlier tasks. Pure functions, no network, no DB.
- Produces:
  ```ts
  export type ZaloMessageEvent = {
    oaId: string; userId: string; text: string; msgId: string; timestamp: string;
  };
  export function verifyZaloSignature(rawBody: string, header: string | null, appId: string, oaSecretKey: string): boolean;
  export function parseZaloEvents(rawBody: string): ZaloMessageEvent[];
  ```

- [ ] **Step 1: Add Zalo env to the vitest config**

In `vitest.config.mts`, inside `test.env`, add:

```ts
      ZALO_APP_ID: "test-zalo-app-id",
      ZALO_APP_SECRET: "test-zalo-app-secret",
      ZALO_OA_SECRET_KEY: "test-zalo-oa-secret",
      ZALO_REDIRECT_URI: "http://localhost:3000/api/zalo/oauth/callback",
```

- [ ] **Step 2: Write the failing test**

Create `lib/zalo-webhook.test.ts`:

```ts
/**
 * Zalo webhook parsing + signature verification.
 * Pure functions — no network, no DB.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseZaloEvents, verifyZaloSignature } from "./zalo-webhook";

const APP_ID = "test-zalo-app-id";
const OA_SECRET = "test-zalo-oa-secret";

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app_id: APP_ID,
    oa_id: "oa_1",
    timestamp: "1800000000000",
    event_name: "user_send_text",
    sender: { id: "user_1" },
    recipient: { id: "oa_1" },
    message: { text: "cho mình đặt lịch", msg_id: "msg_1" },
    ...overrides,
  });
}

/** Zalo: mac = sha256(appId + data + timestamp + oaSecretKey) */
function sign(raw: string, secret = OA_SECRET, appId = APP_ID): string {
  const timestamp = JSON.parse(raw).timestamp as string;
  const mac = createHash("sha256")
    .update(appId + raw + timestamp + secret)
    .digest("hex");
  return `mac=${mac}`;
}

describe("verifyZaloSignature", () => {
  it("accepts a correct mac= signature", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw), APP_ID, OA_SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw, "other"), APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a signature made for a different app id", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw, OA_SECRET, "other-app"), APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(body());
    const tampered = body({ message: { text: "huỷ hết lịch", msg_id: "msg_1" } });
    expect(verifyZaloSignature(tampered, signature, APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a re-serialized body with identical meaning", () => {
    const raw = body();
    const signature = sign(raw);
    const reserialized = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifyZaloSignature(reserialized, signature, APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header without throwing", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, null, APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "", APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "garbage", APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "mac=zz", APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a body that is not valid JSON", () => {
    expect(verifyZaloSignature("{oops", "mac=abc", APP_ID, OA_SECRET)).toBe(false);
  });
});

describe("parseZaloEvents", () => {
  it("extracts a user_send_text event", () => {
    const [event] = parseZaloEvents(body());
    expect(event).toEqual({
      oaId: "oa_1",
      userId: "user_1",
      text: "cho mình đặt lịch",
      msgId: "msg_1",
      timestamp: "1800000000000",
    });
  });

  it("falls back to recipient.id when oa_id is absent", () => {
    const raw = JSON.stringify({
      ...JSON.parse(body()),
      oa_id: undefined,
    });
    expect(parseZaloEvents(raw)[0]?.oaId).toBe("oa_1");
  });

  it("drops events that are not user_send_text", () => {
    expect(parseZaloEvents(body({ event_name: "follow" }))).toEqual([]);
    expect(parseZaloEvents(body({ event_name: "user_send_image" }))).toEqual([]);
  });

  it("drops an event with empty text", () => {
    expect(parseZaloEvents(body({ message: { text: "   ", msg_id: "m" } }))).toEqual([]);
  });

  it("handles an array of events", () => {
    const raw = `[${body()},${body({ message: { text: "hai", msg_id: "msg_2" } })}]`;
    expect(parseZaloEvents(raw)).toHaveLength(2);
  });

  it("returns [] for malformed JSON instead of throwing", () => {
    expect(parseZaloEvents("{not json")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/zalo-webhook.test.ts`
Expected: FAIL — `Cannot find module './zalo-webhook'`.

- [ ] **Step 4: Implement the module**

Create `lib/zalo-webhook.ts`:

```ts
/**
 * Zalo OA webhook — signature verification and event extraction.
 * Pure functions: no network, no database, no environment reads.
 */
import { createHash } from "node:crypto";

export type ZaloMessageEvent = {
  oaId: string;
  userId: string;
  text: string;
  msgId: string;
  timestamp: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + oaSecretKey)`.
 *
 * Verification must run on the raw request text. Parsing and re-serializing
 * first changes key order and whitespace, which changes the hash — the body
 * would verify as tampered even when it is genuine.
 */
export function verifyZaloSignature(
  rawBody: string,
  header: string | null,
  appId: string,
  oaSecretKey: string,
): boolean {
  const received = header?.trim().replace(/^mac=/, "");
  if (!received) return false;

  let timestamp: string;
  try {
    const parsed = JSON.parse(rawBody) as { timestamp?: unknown };
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    timestamp = String((first as { timestamp?: unknown })?.timestamp ?? "");
  } catch {
    return false;
  }
  if (!timestamp) return false;

  const expected = createHash("sha256")
    .update(appId + rawBody + timestamp + oaSecretKey)
    .digest("hex");

  return timingSafeEqual(received, expected);
}

function toEvent(raw: unknown): ZaloMessageEvent | null {
  const e = raw as Record<string, unknown> | null;
  if (!e || e.event_name !== "user_send_text") return null;

  const message = e.message as Record<string, unknown> | undefined;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (!text) return null;

  const sender = e.sender as Record<string, unknown> | undefined;
  const recipient = e.recipient as Record<string, unknown> | undefined;

  const userId = typeof sender?.id === "string" ? sender.id : "";
  // `oa_id` is the documented field; `recipient.id` carries the same value and
  // covers payload variants that omit it.
  const oaId =
    (typeof e.oa_id === "string" && e.oa_id) ||
    (typeof recipient?.id === "string" ? recipient.id : "");

  if (!userId || !oaId) return null;

  return {
    oaId,
    userId,
    text,
    msgId: typeof message?.msg_id === "string" ? message.msg_id : "",
    timestamp: String(e.timestamp ?? ""),
  };
}

/** Never throws — a malformed delivery must not take the webhook down. */
export function parseZaloEvents(rawBody: string): ZaloMessageEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.flatMap((entry) => {
    const event = toEvent(entry);
    return event ? [event] : [];
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/zalo-webhook.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add lib/zalo-webhook.ts lib/zalo-webhook.test.ts vitest.config.mts
git commit -m "feat(zalo): webhook signature verification and event parsing"
```

---

## Task 4: Zalo API client

**Files:**
- Create: `lib/zalo.ts`
- Create: `lib/zalo.test.ts`
- Create: `lib/__fixtures__/zalo/send-ok.json`, `lib/__fixtures__/zalo/error-invalid-token.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export const ZALO_TEXT_LIMIT: number;
  export type ZaloTokenSet = { accessToken: string; refreshToken: string; expiresAt: string };
  export function chunkZaloText(text: string, limit?: number): string[];
  export function validateZaloEnv(): { appId: string; appSecret: string; oaSecretKey: string };
  export function buildZaloOAuthUrl(state: string, codeChallenge: string, redirectUri: string): string;
  export function exchangeZaloCode(code: string, codeVerifier: string): Promise<ZaloTokenSet>;
  export function refreshZaloToken(refreshToken: string): Promise<ZaloTokenSet>;
  export function getZaloOaProfile(accessToken: string): Promise<{ oaId: string; name: string }>;
  export function sendZaloText(accessToken: string, userId: string, text: string): Promise<{ messageId: string }>;
  ```

- [ ] **Step 1: Create the fixtures**

`lib/__fixtures__/zalo/send-ok.json` — shape from the OA message API reference (`https://developers.zalo.me/docs/api/official-account-api`):

```json
{ "error": 0, "message": "Success", "data": { "message_id": "msg_out_1" } }
```

`lib/__fixtures__/zalo/error-invalid-token.json` — Zalo signals failure with a non-zero `error` field and HTTP 200:

```json
{ "error": -216, "message": "Access token is invalid" }
```

- [ ] **Step 2: Write the failing test**

Create `lib/zalo.test.ts`:

```ts
/**
 * Zalo API client. Chunking is pure; transport is tested against a stubbed
 * global fetch using fixtures captured from the published API reference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sendOk from "./__fixtures__/zalo/send-ok.json";
import errorInvalidToken from "./__fixtures__/zalo/error-invalid-token.json";
import {
  ZALO_TEXT_LIMIT,
  buildZaloOAuthUrl,
  chunkZaloText,
  exchangeZaloCode,
  refreshZaloToken,
  sendZaloText,
} from "./zalo";

const realFetch = globalThis.fetch;

function stubFetch(json: unknown, init: { status?: number; body?: string } = {}) {
  const fn = vi.fn(async () =>
    init.body !== undefined
      ? new Response(init.body, { status: init.status ?? 200 })
      : new Response(JSON.stringify(json), {
          status: init.status ?? 200,
          headers: { "Content-Type": "application/json" },
        }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("chunkZaloText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkZaloText("xin chào")).toEqual(["xin chào"]);
  });

  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkZaloText("")).toEqual([]);
    expect(chunkZaloText("   \n  ")).toEqual([]);
  });

  it("keeps text exactly at the limit in one chunk", () => {
    const text = "a".repeat(ZALO_TEXT_LIMIT);
    expect(chunkZaloText(text)).toHaveLength(1);
  });

  it("splits text over the limit and loses nothing", () => {
    const text = `${"a".repeat(ZALO_TEXT_LIMIT)} ${"b".repeat(200)}`;
    const chunks = chunkZaloText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= ZALO_TEXT_LIMIT)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("prefers a paragraph break over a mid-word cut", () => {
    const head = "a".repeat(ZALO_TEXT_LIMIT - 100);
    const chunks = chunkZaloText(`${head}\n\n${"b".repeat(300)}`);
    expect(chunks[0]).toBe(head);
  });
});

describe("buildZaloOAuthUrl", () => {
  it("carries app id, redirect, state and code challenge", () => {
    const url = new URL(
      buildZaloOAuthUrl("state-1", "challenge-1", "http://localhost:3000/cb"),
    );
    expect(url.origin + url.pathname).toBe("https://oauth.zaloapp.com/v4/oa/permission");
    expect(url.searchParams.get("app_id")).toBe("test-zalo-app-id");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/cb");
  });
});

describe("exchangeZaloCode", () => {
  it("posts the verifier and secret key header, and returns an expiry", async () => {
    const fetchMock = stubFetch({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: "3600",
    });

    const before = Date.now();
    const tokens = await exchangeZaloCode("code-1", "verifier-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://oauth.zaloapp.com/v4/oa/access_token");
    expect((init.headers as Record<string, string>).secret_key).toBe("test-zalo-app-secret");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-1");
    expect(sent.get("code_verifier")).toBe("verifier-1");
    expect(sent.get("app_id")).toBe("test-zalo-app-id");

    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.refreshToken).toBe("rt-1");
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(before);
  });

  it("throws instead of returning a half-connected token set", async () => {
    stubFetch({ access_token: "at-1" });
    await expect(exchangeZaloCode("code-1", "verifier-1")).rejects.toThrow(
      /missing access_token or refresh_token/i,
    );
  });

  it("surfaces a Zalo error body", async () => {
    stubFetch({ error: -201, message: "Invalid code" });
    await expect(exchangeZaloCode("bad", "verifier-1")).rejects.toThrow("Invalid code");
  });
});

describe("refreshZaloToken", () => {
  it("posts grant_type=refresh_token and no code_verifier", async () => {
    const fetchMock = stubFetch({
      access_token: "at-2",
      refresh_token: "rt-2",
      expires_in: "3600",
    });

    await refreshZaloToken("rt-1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("rt-1");
    expect(sent.get("code_verifier")).toBeNull();
  });
});

describe("sendZaloText", () => {
  it("puts the token in the access_token header, never the query string", async () => {
    const fetchMock = stubFetch(sendOk);

    const result = await sendZaloText("at-1", "user_1", "xin chào");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openapi.zalo.me/v3.0/oa/message/cs");
    expect(url).not.toContain("access_token=");
    expect((init.headers as Record<string, string>).access_token).toBe("at-1");
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: { user_id: "user_1" },
      message: { text: "xin chào" },
    });
    expect(result.messageId).toBe("msg_out_1");
  });

  it("sends long text as sequential chunks in order", async () => {
    const fetchMock = stubFetch(sendOk);
    await sendZaloText("at-1", "user_1", `${"a".repeat(ZALO_TEXT_LIMIT)} tail`);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    const texts = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse((init as RequestInit).body as string).message.text as string,
    );
    expect(texts[0].startsWith("a")).toBe(true);
    expect(texts[texts.length - 1]).toContain("tail");
  });

  it("sends nothing for empty text", async () => {
    const fetchMock = stubFetch(sendOk);
    const result = await sendZaloText("at-1", "user_1", "   ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.messageId).toBe("");
  });

  it("throws on a non-zero error field returned with HTTP 200", async () => {
    stubFetch(errorInvalidToken);
    await expect(sendZaloText("at-1", "user_1", "hi")).rejects.toThrow(
      "Access token is invalid",
    );
  });

  it("reports the HTTP status when the body is an HTML error page", async () => {
    stubFetch(null, { status: 502, body: "<html>Bad Gateway</html>" });
    await expect(sendZaloText("at-1", "user_1", "hi")).rejects.toThrow(/502/);
  });

  it("aborts rather than hanging when the request never settles", async () => {
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    ) as unknown as typeof fetch;

    await expect(sendZaloText("at-1", "user_1", "hi", 20)).rejects.toThrow(/timed out/i);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run lib/zalo.test.ts`
Expected: FAIL — `Cannot find module './zalo'`.

- [ ] **Step 4: Implement the client**

Create `lib/zalo.ts`:

```ts
/**
 * Zalo Official Account API — OAuth v4, OA profile, and the message Send API.
 * All functions throw on failure; callers wrap in try/catch.
 *
 * Two Zalo-specific traps this module absorbs:
 *  - failures arrive as `{"error": -216}` with HTTP 200, so a status check
 *    alone would treat them as success;
 *  - the token goes in an `access_token` header, not `Authorization: Bearer`.
 */

const ZALO_OPENAPI_BASE = "https://openapi.zalo.me";
const ZALO_OAUTH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const ZALO_OAUTH_PERMISSION_URL = "https://oauth.zaloapp.com/v4/oa/permission";

/**
 * Maximum characters in one OA text message.
 *
 * Confirm against the current OA message API reference before first release
 * and update the value plus `lib/__fixtures__/zalo/` if it has changed —
 * this is documentation-derived, not observed from a live account.
 */
export const ZALO_TEXT_LIMIT = 2000;

const ZALO_FETCH_TIMEOUT_MS = 12_000;

export type ZaloTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp. */
  expiresAt: string;
};

export function validateZaloEnv(): {
  appId: string;
  appSecret: string;
  oaSecretKey: string;
} {
  const appId = process.env.ZALO_APP_ID?.trim();
  const appSecret = process.env.ZALO_APP_SECRET?.trim();
  const oaSecretKey = process.env.ZALO_OA_SECRET_KEY?.trim();

  if (!appId || !appSecret || !oaSecretKey) {
    throw new Error("ZALO_NOT_CONFIGURED");
  }
  return { appId, appSecret, oaSecretKey };
}

async function zaloFetch(
  url: string,
  init: RequestInit,
  timeoutMs = ZALO_FETCH_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Zalo request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  // An edge proxy can answer with HTML; an unguarded .json() would throw
  // SyntaxError and hide the real status.
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message = typeof json.message === "string" ? json.message : null;
    throw new Error(message ?? `Zalo request failed (${res.status})`);
  }

  // Zalo reports application errors with HTTP 200 and a non-zero `error`.
  if (typeof json.error === "number" && json.error !== 0) {
    const message = typeof json.message === "string" ? json.message : null;
    throw new Error(message ?? `Zalo request failed (error ${json.error})`);
  }

  return json;
}

/** Split on paragraph, then line, then word boundaries. */
export function chunkZaloText(text: string, limit = ZALO_TEXT_LIMIT): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    );
    const end = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

export function buildZaloOAuthUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  const { appId } = validateZaloEnv();
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
  });
  return `${ZALO_OAUTH_PERMISSION_URL}?${params.toString()}`;
}

function toTokenSet(json: Record<string, unknown>): ZaloTokenSet {
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error("Zalo token response missing access_token or refresh_token");
  }

  // `expires_in` arrives as a string of seconds. Default to one hour, the
  // documented OA access token lifetime, if it is absent.
  const seconds = Number(json.expires_in) || 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  };
}

async function postToken(fields: Record<string, string>): Promise<ZaloTokenSet> {
  const { appId, appSecret } = validateZaloEnv();
  const json = await zaloFetch(ZALO_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: appSecret,
    },
    body: new URLSearchParams({ app_id: appId, ...fields }).toString(),
  });
  return toTokenSet(json);
}

export function exchangeZaloCode(
  code: string,
  codeVerifier: string,
): Promise<ZaloTokenSet> {
  return postToken({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
  });
}

export function refreshZaloToken(refreshToken: string): Promise<ZaloTokenSet> {
  if (!refreshToken?.trim()) throw new Error("Refresh token is required");
  return postToken({
    refresh_token: refreshToken.trim(),
    grant_type: "refresh_token",
  });
}

export async function getZaloOaProfile(
  accessToken: string,
): Promise<{ oaId: string; name: string }> {
  const json = await zaloFetch(`${ZALO_OPENAPI_BASE}/v2.0/oa/getoa`, {
    method: "GET",
    headers: { access_token: accessToken },
  });

  const data = json.data as Record<string, unknown> | undefined;
  const oaId = typeof data?.oa_id === "string" ? data.oa_id : "";
  if (!oaId) throw new Error("Zalo OA profile response missing oa_id");

  return { oaId, name: typeof data?.name === "string" ? data.name : "Zalo OA" };
}

async function sendOneZaloText(
  accessToken: string,
  userId: string,
  text: string,
  timeoutMs: number,
): Promise<string> {
  const json = await zaloFetch(
    `${ZALO_OPENAPI_BASE}/v3.0/oa/message/cs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
    },
    timeoutMs,
  );

  const data = json.data as Record<string, unknown> | undefined;
  return String(data?.message_id ?? "");
}

/**
 * Send text to a Zalo user, splitting anything over the limit. Sequential on
 * purpose — Zalo preserves send order per recipient. Returns the last id.
 */
export async function sendZaloText(
  accessToken: string,
  userId: string,
  text: string,
  timeoutMs = ZALO_FETCH_TIMEOUT_MS,
): Promise<{ messageId: string }> {
  const chunks = chunkZaloText(text);
  if (chunks.length === 0) return { messageId: "" };

  let last = "";
  for (const chunk of chunks) {
    last = await sendOneZaloText(accessToken, userId, chunk, timeoutMs);
  }
  return { messageId: last };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/zalo.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add lib/zalo.ts lib/zalo.test.ts lib/__fixtures__/zalo
git commit -m "feat(zalo): API client for OAuth, OA profile and send"
```

---

## Task 5: PKCE state and Zalo OAuth persistence

**Files:**
- Modify: `lib/cal-oauth-state.ts`
- Create: `lib/zalo-oauth.ts` (connect half only — refresh comes in Task 6)
- Create: `lib/zalo-oauth.test.ts`

**Interfaces:**
- Consumes: `upsertChannelConnection`, `CHANNEL_EXTERNAL_ID_TAKEN` (Task 1); `exchangeZaloCode`, `getZaloOaProfile` (Task 4).
- Produces:
  ```ts
  // lib/cal-oauth-state.ts — extended
  export type OAuthStatePayload = {
    workspaceId: string; returnTo: string; nonce: string; exp: number;
    codeVerifier?: string;
  };
  export function createOAuthState(workspaceId: string, returnTo: string, codeVerifier?: string): { token: string; payload: OAuthStatePayload };
  export const ZALO_OAUTH_STATE_COOKIE = "eve_zalo_oauth_state";

  // lib/zalo-oauth.ts
  export function createPkcePair(): { verifier: string; challenge: string };
  export function resolveZaloRedirectUri(requestUrl: string): string;
  export function connectZaloWorkspace(input: { workspaceId: string; code: string; codeVerifier: string }): Promise<{ oaId: string; oaName: string }>;
  export function disconnectZalo(workspaceId: string): Promise<void>;
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/zalo-oauth.test.ts`:

```ts
/**
 * Zalo OAuth — PKCE, state payload, and connect persistence.
 * Network is stubbed; the database half lives in zalo-oauth-refresh.test.ts.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthState, parseOAuthState } from "./cal-oauth-state";
import { createPkcePair, resolveZaloRedirectUri } from "./zalo-oauth";

afterEach(() => vi.restoreAllMocks());

describe("createPkcePair", () => {
  it("produces a verifier in the RFC 7636 length range", () => {
    const { verifier } = createPkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
  });

  it("produces a challenge that is base64url(sha256(verifier))", () => {
    const { verifier, challenge } = createPkcePair();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(challenge).toBe(expected);
  });

  it("produces a different verifier each call", () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
  });
});

describe("oauth state with code verifier", () => {
  const WS = "00000000-0000-4000-8000-000000000001";

  it("round-trips the verifier through the signed token", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings", "verifier-abc");
    expect(parseOAuthState(token, WS)?.codeVerifier).toBe("verifier-abc");
  });

  it("still works for callers that pass no verifier", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings");
    const payload = parseOAuthState(token, WS);
    expect(payload?.workspaceId).toBe(WS);
    expect(payload?.codeVerifier).toBeUndefined();
  });

  it("rejects a token whose verifier was altered", () => {
    const { token } = createOAuthState(WS, "/dashboard/settings", "verifier-abc");
    const [encoded, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    payload.codeVerifier = "attacker-verifier";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;
    expect(parseOAuthState(forged, WS)).toBeNull();
  });
});

describe("resolveZaloRedirectUri", () => {
  it("prefers the configured env value", () => {
    expect(resolveZaloRedirectUri("https://app.example.com/api/zalo/oauth/start")).toBe(
      "http://localhost:3000/api/zalo/oauth/callback",
    );
  });

  it("derives from the request origin when env is unset", () => {
    vi.stubEnv("ZALO_REDIRECT_URI", "");
    expect(resolveZaloRedirectUri("https://app.example.com/api/zalo/oauth/start")).toBe(
      "https://app.example.com/api/zalo/oauth/callback",
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/zalo-oauth.test.ts`
Expected: FAIL — `Cannot find module './zalo-oauth'`.

- [ ] **Step 3: Extend the state module**

In `lib/cal-oauth-state.ts`:

Add `codeVerifier?: string;` to `OAuthStatePayload`.

Change the `createOAuthState` signature and body:

```ts
/** Create a signed state token for OAuth authorize redirect. */
export function createOAuthState(
  workspaceId: string,
  returnTo: string,
  codeVerifier?: string,
): { token: string; payload: OAuthStatePayload } {
  const payload: OAuthStatePayload = {
    workspaceId,
    returnTo: safeReturnTo(returnTo, "/dashboard/setup"),
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
    // PKCE: the verifier must survive the redirect, and this cookie is already
    // signed, httpOnly and TTL-bounded — exactly the properties it needs.
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  return { token: signPayload(payload), payload };
}
```

`verifyPayload` needs no change: it validates the four required fields and the HMAC covers the whole payload, so an altered `codeVerifier` fails the signature check.

Add a distinct cookie name at the bottom, next to `OAUTH_STATE_COOKIE`:

```ts
/**
 * Separate from the Cal/Messenger cookie so a Zalo connect started in one tab
 * cannot clobber a Cal connect started in another.
 */
export const ZALO_OAUTH_STATE_COOKIE = "eve_zalo_oauth_state";
```

- [ ] **Step 4: Implement the OAuth module**

Create `lib/zalo-oauth.ts`:

```ts
/**
 * Zalo OA OAuth — PKCE generation, redirect resolution, and connect/disconnect
 * persistence. Token refresh lives in the same module (added alongside) and
 * goes through lib/channel-connections.ts for storage.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  deleteChannelConnection,
  upsertChannelConnection,
} from "@/lib/channel-connections";
import { exchangeZaloCode, getZaloOaProfile } from "@/lib/zalo";

export { CHANNEL_EXTERNAL_ID_TAKEN };

/** RFC 7636 PKCE pair. 32 random bytes base64url-encode to 43 characters. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function resolveZaloRedirectUri(requestUrl: string): string {
  const envUri = process.env.ZALO_REDIRECT_URI?.trim();
  if (envUri) return envUri;

  try {
    return `${new URL(requestUrl).origin}/api/zalo/oauth/callback`;
  } catch {
    return "";
  }
}

/**
 * Exchange the authorization code and store the connection.
 *
 * The OA profile is read before persisting: `oa_id` is the key the webhook
 * resolves a workspace by, so a connection stored without it would accept
 * tokens but never route an inbound message.
 *
 * @throws CHANNEL_EXTERNAL_ID_TAKEN when the OA already belongs to another workspace
 */
export async function connectZaloWorkspace(input: {
  workspaceId: string;
  code: string;
  codeVerifier: string;
}): Promise<{ oaId: string; oaName: string }> {
  const tokens = await exchangeZaloCode(input.code, input.codeVerifier);
  const profile = await getZaloOaProfile(tokens.accessToken);

  await upsertChannelConnection({
    workspaceId: input.workspaceId,
    provider: "zalo",
    externalId: profile.oaId,
    displayName: profile.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });

  return { oaId: profile.oaId, oaName: profile.name };
}

export async function disconnectZalo(workspaceId: string): Promise<void> {
  // Delete rather than null the fields — a row reporting "disconnected" while
  // holding a usable token keeps the agent answering.
  await deleteChannelConnection(workspaceId, "zalo");
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/zalo-oauth.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Confirm nothing else broke**

Run: `npx vitest run && npm run typecheck`
Expected: all existing tests still pass — `createOAuthState`'s third parameter is optional, so `app/api/messenger/oauth/start/route.ts:51` and the Cal start route are unaffected.

- [ ] **Step 7: Commit**

```bash
git add lib/cal-oauth-state.ts lib/zalo-oauth.ts lib/zalo-oauth.test.ts
git commit -m "feat(zalo): PKCE state and OAuth connect persistence"
```

---

## Task 6: Token refresh with rotation lock

The highest-risk component. Its tests run against real Postgres because the claim is a database behaviour.

**Files:**
- Modify: `lib/zalo-oauth.ts` (add refresh)
- Create: `lib/zalo-oauth-refresh.test.ts`
- Modify: `lib/workspace.ts` (add `getZaloCredentialsForWorkspace`)

**Interfaces:**
- Consumes: `claimRefreshLock`, `releaseRefreshLock`, `getChannelConnection`, `upsertChannelConnection`, `deleteChannelConnection` (Task 1); `refreshZaloToken` (Task 4); `createNotification` from `@/lib/notifications-write`.
- Produces:
  ```ts
  export function getZaloAccessToken(workspaceId: string): Promise<string>;
  // lib/workspace.ts
  export function getZaloCredentialsForWorkspace(workspaceId: string): Promise<{ oaId: string; accessToken: string }>;
  ```

- [ ] **Step 1: Write the failing test**

Create `lib/zalo-oauth-refresh.test.ts`:

```ts
/**
 * Zalo token rotation. Runs against local Postgres (`npx supabase start`) —
 * the claim is a database behaviour, and a mocked client would make the
 * concurrency test prove nothing. Skipped when no database is reachable.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteChannelConnection,
  getChannelConnection,
  upsertChannelConnection,
} from "./channel-connections";

const WS = "00000000-0000-4000-8000-000000000002";

/** Module scope, not beforeAll — see the note in channel-connections.test.ts. */
const dbUp = await (async () => {
  try {
    const admin = createAdminClient();
    await admin.from("workspaces").upsert(
      { id: WS, name: "Zalo Refresh WS", slug: "zalo-refresh-ws" },
      { onConflict: "id" },
    );
    const { error } = await admin.from("workspaces").select("id").eq("id", WS).single();
    return !error;
  } catch {
    return false;
  }
})();

afterEach(async () => {
  if (dbUp) await deleteChannelConnection(WS, "zalo");
  vi.restoreAllMocks();
  vi.resetModules();
});

async function seedConnection(expiresInMs: number) {
  await upsertChannelConnection({
    workspaceId: WS,
    provider: "zalo",
    externalId: "oa_refresh",
    displayName: "Refresh OA",
    accessToken: "old-access",
    refreshToken: "old-refresh",
    expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
  });
}

/** Load zalo-oauth with lib/zalo mocked, so no network is touched. */
async function loadWithRefreshStub(
  impl: (refreshToken: string) => Promise<unknown>,
) {
  const refreshZaloToken = vi.fn(impl);
  vi.doMock("@/lib/zalo", async () => ({
    ...(await vi.importActual<typeof import("./zalo")>("./zalo")),
    refreshZaloToken,
  }));
  const mod = await import("./zalo-oauth");
  return { getZaloAccessToken: mod.getZaloAccessToken, refreshZaloToken };
}

const freshTokens = {
  accessToken: "new-access",
  refreshToken: "new-refresh",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

describe.skipIf(!dbUp)("getZaloAccessToken", () => {
  it("returns the stored token when it is comfortably valid", async () => {
    await seedConnection(3_600_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => freshTokens,
    );

    expect(await getZaloAccessToken(WS)).toBe("old-access");
    expect(refreshZaloToken).not.toHaveBeenCalled();
  });

  it("refreshes a token expiring inside the 5-minute skew", async () => {
    await seedConnection(60_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => freshTokens,
    );

    expect(await getZaloAccessToken(WS)).toBe("new-access");
    expect(refreshZaloToken).toHaveBeenCalledWith("old-refresh");

    const stored = await getChannelConnection(WS, "zalo");
    expect(stored?.refreshToken).toBe("new-refresh");
  });

  it("refreshes exactly once under two concurrent callers", async () => {
    await seedConnection(-1_000);
    const { getZaloAccessToken, refreshZaloToken } = await loadWithRefreshStub(
      async () => {
        // Hold the lock long enough for the loser to observe it.
        await new Promise((r) => setTimeout(r, 150));
        return freshTokens;
      },
    );

    const [a, b] = await Promise.all([
      getZaloAccessToken(WS),
      getZaloAccessToken(WS),
    ]);

    expect(refreshZaloToken).toHaveBeenCalledTimes(1);
    expect(a).toBe("new-access");
    expect(b).toBe("new-access");
  });

  it("releases the lock when the refresh call fails", async () => {
    await seedConnection(-1_000);
    const first = await loadWithRefreshStub(async () => {
      throw new Error("network down");
    });
    await expect(first.getZaloAccessToken(WS)).rejects.toThrow();

    const admin = createAdminClient();
    const { data } = await admin
      .from("workspace_channel_connections")
      .select("refresh_lock_at")
      .eq("workspace_id", WS)
      .eq("provider", "zalo")
      .single();

    expect(data!.refresh_lock_at).toBeNull();
  });

  it("clears the connection and notifies the owner on a rejected refresh token", async () => {
    await seedConnection(-1_000);
    const createNotification = vi.fn(async () => "notif-1");
    vi.doMock("@/lib/notifications-write", () => ({ createNotification }));

    const { getZaloAccessToken } = await loadWithRefreshStub(async () => {
      throw new Error("Refresh token is invalid or expired");
    });

    await expect(getZaloAccessToken(WS)).rejects.toThrow();

    expect(await getChannelConnection(WS, "zalo")).toBeNull();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, severity: "high" }),
    );
  });

  it("throws when the workspace has no Zalo connection", async () => {
    const { getZaloAccessToken } = await loadWithRefreshStub(async () => freshTokens);
    await expect(getZaloAccessToken(WS)).rejects.toThrow("ZALO_NOT_CONFIGURED");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/zalo-oauth-refresh.test.ts`
Expected: FAIL — `getZaloAccessToken is not a function`.

- [ ] **Step 3: Implement refresh in `lib/zalo-oauth.ts`**

Add to the imports:

```ts
import {
  claimRefreshLock,
  getChannelConnection,
  releaseRefreshLock,
} from "@/lib/channel-connections";
import { exchangeZaloCode, getZaloOaProfile, refreshZaloToken } from "@/lib/zalo";
import { createNotification } from "@/lib/notifications-write";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
```

Append:

```ts
/** Refresh this far ahead of expiry so a request never races its own token. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** How long to wait for the caller holding the lock, and how often to look. */
const LOCK_WAIT_TOTAL_MS = 3_000;
const LOCK_WAIT_STEP_MS = 200;

/**
 * A refresh token Zalo has rejected outright is unrecoverable — the workspace
 * must reconnect. Distinguish that from a transient network failure so a blip
 * does not disconnect a working channel.
 */
function isUnrecoverable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("refresh token") &&
    (message.includes("invalid") || message.includes("expired"))
  );
}

async function onCredentialsDead(workspaceId: string): Promise<void> {
  await disconnectZalo(workspaceId);
  // Without this the channel dies silently: the owner sees no error, only an
  // absence of messages.
  await createNotification({
    workspaceId,
    type: "ai_config",
    severity: "high",
    title: "Zalo OA disconnected",
    body: "Zalo rejected the saved credentials. Reconnect the Official Account in Settings to resume answering messages.",
    href: DASHBOARD_PATH.settings,
  });
}

/**
 * A valid Zalo access token for this workspace, refreshing if needed.
 *
 * Zalo access tokens live one hour and their refresh tokens are single-use, so
 * two concurrent refreshes would leave the workspace with no valid credential
 * at all. `claimRefreshLock` makes exactly one caller refresh; the others wait
 * and read the token it stored.
 *
 * @throws Error ZALO_NOT_CONFIGURED when no connection exists
 */
export async function getZaloAccessToken(workspaceId: string): Promise<string> {
  const conn = await getChannelConnection(workspaceId, "zalo");
  if (!conn?.accessToken) throw new Error("ZALO_NOT_CONFIGURED");

  const expiresAt = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) return conn.accessToken;

  const claim = await claimRefreshLock(workspaceId, "zalo");

  if (!claim.claimed) {
    // Another caller is refreshing. Poll for the token it writes.
    const deadline = Date.now() + LOCK_WAIT_TOTAL_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_STEP_MS));
      const latest = await getChannelConnection(workspaceId, "zalo");
      if (!latest?.accessToken) throw new Error("ZALO_NOT_CONFIGURED");
      const latestExpiry = latest.expiresAt ? new Date(latest.expiresAt).getTime() : 0;
      if (latestExpiry - Date.now() > REFRESH_SKEW_MS) return latest.accessToken;
    }
    throw new Error("ZALO_REFRESH_TIMEOUT");
  }

  if (!claim.refreshToken) {
    await releaseRefreshLock(workspaceId, "zalo");
    await onCredentialsDead(workspaceId);
    throw new Error("ZALO_NOT_CONFIGURED");
  }

  try {
    const tokens = await refreshZaloToken(claim.refreshToken);
    // upsertChannelConnection clears refresh_lock_at as part of the write.
    await upsertChannelConnection({
      workspaceId,
      provider: "zalo",
      externalId: conn.externalId,
      displayName: conn.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      metadata: conn.metadata,
    });
    return tokens.accessToken;
  } catch (error) {
    await releaseRefreshLock(workspaceId, "zalo");
    if (isUnrecoverable(error)) await onCredentialsDead(workspaceId);
    throw error;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/zalo-oauth-refresh.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add the workspace adapter**

In `lib/workspace.ts`, immediately after `getMessengerCredentialsForWorkspace`:

```ts
/**
 * Zalo credentials for a workspace. There is no env fallback and no Pilot
 * special case: Zalo is per-tenant only.
 */
export async function getZaloCredentialsForWorkspace(
  workspaceId: string,
): Promise<{ oaId: string; accessToken: string }> {
  const { getChannelConnection } = await import("@/lib/channel-connections");
  const conn = await getChannelConnection(workspaceId, "zalo");
  if (!conn) throw new Error("ZALO_NOT_CONFIGURED");

  const { getZaloAccessToken } = await import("@/lib/zalo-oauth");
  return { oaId: conn.externalId, accessToken: await getZaloAccessToken(workspaceId) };
}
```

- [ ] **Step 6: Commit**

```bash
npm run typecheck
git add lib/zalo-oauth.ts lib/zalo-oauth-refresh.test.ts lib/workspace.ts
git commit -m "feat(zalo): token refresh guarded by a database rotation lock"
```

---

## Task 7: Plan feature, error codes, and OAuth routes

**Files:**
- Modify: `lib/plan-features.ts`, `lib/plan-features.test.ts`
- Modify: `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts`
- Modify: `messages/en.json`, `messages/vi.json`
- Create: `app/api/zalo/oauth/start/route.ts`, `app/api/zalo/oauth/callback/route.ts`

**Interfaces:**
- Consumes: `createPkcePair`, `resolveZaloRedirectUri`, `connectZaloWorkspace`, `CHANNEL_EXTERNAL_ID_TAKEN` (Task 5); `buildZaloOAuthUrl`, `validateZaloEnv` (Task 4); `ZALO_OAUTH_STATE_COOKIE` (Task 5).
- Produces: `PLAN_FEATURE.ZALO`; the five `APP_ERROR_CODE.ZALO_*` codes; two route handlers.

- [ ] **Step 1: Add the plan feature**

In `lib/plan-features.ts`:

Narrow the module docstring — replace

```
 * Only capabilities that exist in the codebase belong here. Zalo and WhatsApp are
 * deliberately absent: they are not built.
```

with

```
 * Only capabilities that exist in the codebase belong here. WhatsApp is
 * deliberately absent: it is not built.
```

Add to `PLAN_FEATURE`: `ZALO: "zalo",` (after `REMINDERS`, before `MESSENGER`).

Add to `PLAN_FEATURE_TIERS`:

```ts
  // Zalo is the default messaging channel in Vietnam, this product's primary
  // market. Gating it behind Pro would leave Starter with no usable channel
  // there. Messenger stays Pro on purpose.
  zalo: ["starter", "pro"],
```

Add `PLAN_FEATURE.ZALO,` to `FEATURE_ORDER`, before `PLAN_FEATURE.MESSENGER`.

- [ ] **Step 2: Add the plan feature test**

Append to `lib/plan-features.test.ts`:

```ts
describe("zalo tier", () => {
  it("is available on starter and pro", () => {
    expect(PLAN_FEATURE_TIERS.zalo).toEqual(["starter", "pro"]);
  });

  it("is included in a starter workspace's feature list", () => {
    expect(featuresForTier("starter")).toContain(PLAN_FEATURE.ZALO);
  });

  it("does not accidentally unlock messenger for starter", () => {
    expect(featuresForTier("starter")).not.toContain(PLAN_FEATURE.MESSENGER);
  });
});
```

Ensure `PLAN_FEATURE`, `PLAN_FEATURE_TIERS` and `featuresForTier` are in that file's import list.

- [ ] **Step 3: Run the plan feature tests**

Run: `npx vitest run lib/plan-features.test.ts`
Expected: PASS. If an existing test asserts an exact feature-list length or array, update it to include `zalo` — the table is the source of truth for both enforcement and pricing copy.

- [ ] **Step 4: Add error codes and copy**

In `lib/errors/app-codes.ts`, after `MESSENGER_DISCONNECT_FAILED`:

```ts
  ZALO_NOT_CONFIGURED: "zalo_not_configured",
  ZALO_SEND_FAILED: "zalo_send_failed",
  ZALO_OAUTH_FAILED: "zalo_oauth_failed",
  ZALO_DISCONNECT_FAILED: "zalo_disconnect_failed",
  ZALO_OA_ALREADY_LINKED: "zalo_oa_already_linked",
```

In `lib/errors/app-messages.ts`, after the `MESSENGER_DISCONNECT_FAILED` entry:

```ts
  [APP_ERROR_CODE.ZALO_NOT_CONFIGURED]:
    "Zalo is not connected. Connect an Official Account in Settings.",
  [APP_ERROR_CODE.ZALO_SEND_FAILED]:
    "Could not send message via Zalo. The Official Account connection may have expired.",
  [APP_ERROR_CODE.ZALO_OAUTH_FAILED]:
    "Could not connect the Zalo Official Account. Try again from Settings.",
  [APP_ERROR_CODE.ZALO_DISCONNECT_FAILED]:
    "Could not disconnect Zalo. Try again.",
  [APP_ERROR_CODE.ZALO_OA_ALREADY_LINKED]:
    "This Zalo Official Account is already connected to another workspace.",
```

- [ ] **Step 5: Add pricing copy**

In `messages/en.json`, inside the `plans.features` object, before `"messenger"`:

```json
        "zalo": "Zalo Official Account",
```

In `messages/vi.json`, the same key in the matching object:

```json
        "zalo": "Zalo Official Account",
```

Then confirm the surrounding `messenger` key exists in both and that the JSON parses:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));JSON.parse(require('fs').readFileSync('messages/vi.json','utf8'));console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 6: Write the start route**

Create `app/api/zalo/oauth/start/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildZaloOAuthUrl, validateZaloEnv } from "@/lib/zalo";
import { createPkcePair, resolveZaloRedirectUri } from "@/lib/zalo-oauth";
import {
  createOAuthState,
  STATE_TTL_MS,
  ZALO_OAUTH_STATE_COOKIE,
} from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { assertWorkspaceFeature, PLAN_FEATURE } from "@/lib/plan-features";
import { appErrorMessage, isAppError, APP_ERROR_CODE } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

export async function GET(request: Request) {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    await assertWorkspaceFeature(auth.workspaceId, PLAN_FEATURE.ZALO);
  } catch (error) {
    if (isAppError(error, APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED)) {
      return NextResponse.json(
        { error: appErrorMessage(APP_ERROR_CODE.PLAN_UPGRADE_REQUIRED) },
        { status: 403 },
      );
    }
    throw error;
  }

  try {
    validateZaloEnv();
  } catch {
    return NextResponse.json(
      { error: appErrorMessage(APP_ERROR_CODE.ZALO_NOT_CONFIGURED) },
      { status: 500 },
    );
  }

  const redirectUri = resolveZaloRedirectUri(request.url);
  if (!redirectUri) {
    return NextResponse.json(
      { error: appErrorMessage(APP_ERROR_CODE.ZALO_NOT_CONFIGURED) },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? ROUTES.DASHBOARD_SETTINGS;

  const { verifier, challenge } = createPkcePair();
  const { token } = createOAuthState(auth.workspaceId, returnTo, verifier);

  const cookieStore = await cookies();
  cookieStore.set(ZALO_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.ceil(STATE_TTL_MS / 1000),
  });

  return NextResponse.redirect(buildZaloOAuthUrl(token, challenge, redirectUri));
}
```

- [ ] **Step 7: Write the callback route**

Create `app/api/zalo/oauth/callback/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  connectZaloWorkspace,
} from "@/lib/zalo-oauth";
import { parseOAuthState, ZALO_OAUTH_STATE_COOKIE } from "@/lib/cal-oauth-state";
import { requireOwnerWorkspace } from "@/lib/workspace-invites";
import { ROUTES, loginWithNext } from "@/lib/routes";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(ZALO_OAUTH_STATE_COOKIE)?.value;

  // Clear the state cookie immediately — it is single-use either way.
  cookieStore.set(ZALO_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return NextResponse.redirect(
      new URL(loginWithNext(ROUTES.DASHBOARD_SETTINGS), request.url),
    );
  }

  const failure = (reason: string) => {
    const redirect = new URL(ROUTES.DASHBOARD_SETTINGS, request.url);
    redirect.searchParams.set("zalo_oauth_error", reason);
    return NextResponse.redirect(redirect);
  };

  if (oauthError || !code) return failure("denied");
  if (!stateCookie) return failure("state_invalid");

  const state = parseOAuthState(stateCookie, auth.workspaceId);
  if (!state?.codeVerifier) return failure("state_invalid");

  let connected: { oaId: string; oaName: string };
  try {
    connected = await connectZaloWorkspace({
      workspaceId: auth.workspaceId,
      code,
      codeVerifier: state.codeVerifier,
    });
  } catch (error) {
    if (error instanceof Error && error.message === CHANNEL_EXTERNAL_ID_TAKEN) {
      return failure("already_linked");
    }
    console.error("[zalo] oauth connect failed", error);
    return failure("exchange_failed");
  }

  const redirect = new URL(state.returnTo, request.url);
  redirect.searchParams.set("zalo_oauth_ok", "1");
  redirect.searchParams.set("zalo_oa_name", connected.oaName);
  return NextResponse.redirect(redirect);
}
```

- [ ] **Step 8: Verify the routes compile and the gate holds**

```bash
npm run typecheck
npx vitest run
```

Expected: typecheck clean, all tests pass.

Confirm `loginWithNext` and `ROUTES.DASHBOARD_SETTINGS` exist in `lib/routes.ts`; if `loginWithNext` is absent, use `ROUTES.LOGIN` instead — do not hardcode `"/login"`.

- [ ] **Step 9: Commit**

```bash
git add lib/plan-features.ts lib/plan-features.test.ts lib/errors/app-codes.ts lib/errors/app-messages.ts messages/en.json messages/vi.json app/api/zalo
git commit -m "feat(zalo): starter-tier plan feature, error codes and OAuth routes"
```

---

## Task 8: Settings card and disconnect action

**Files:**
- Create: `app/_components/zalo-connection-card.tsx`
- Modify: `app/dashboard/settings/actions.ts`
- Modify: `app/dashboard/settings/page.tsx`

**Interfaces:**
- Consumes: `disconnectZalo` (Task 5); `getChannelConnection` (Task 1); `PLAN_FEATURE.ZALO` (Task 7).
- Produces: `disconnectZaloAction(workspaceId: string): Promise<{ error?: string }>`; `<ZaloConnectionCard workspaceId zaloOaId zaloOaName canConnect />`.

- [ ] **Step 1: Add the server action**

In `app/dashboard/settings/actions.ts`, directly after `disconnectMessengerAction`:

```ts
export async function disconnectZaloAction(
  workspaceId: string,
): Promise<{ error?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  if (auth.workspaceId !== workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const { disconnectZalo } = await import("@/lib/zalo-oauth");
    await disconnectZalo(workspaceId);
    revalidatePath(DASHBOARD_PATH.settings);
    return {};
  } catch {
    return { error: appErrorMessage(APP_ERROR_CODE.ZALO_DISCONNECT_FAILED) };
  }
}
```

- [ ] **Step 2: Create the card**

Create `app/_components/zalo-connection-card.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChatCircleIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { disconnectZaloAction } from "@/app/dashboard/settings/actions";
import { ROUTES } from "@/lib/routes";
import { toast } from "sonner";

type Props = {
  workspaceId: string;
  zaloOaId: string | null;
  zaloOaName: string | null;
  canConnect: boolean;
};

export function ZaloConnectionCard({
  workspaceId,
  zaloOaId,
  zaloOaName,
  canConnect,
}: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  const handleDisconnect = () => {
    if (
      !window.confirm(
        "Disconnect Zalo? Guests will not be able to book via your Zalo Official Account until you reconnect.",
      )
    )
      return;
    setDisconnecting(true);
    disconnectZaloAction(workspaceId)
      .then((result) => {
        if (result.error) toast.error(result.error);
        else {
          toast.success("Zalo disconnected.");
          router.refresh();
        }
      })
      .catch(() => toast.error("Could not disconnect. Try again."))
      .finally(() => setDisconnecting(false));
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card/50 p-5 sm:p-6">
      {zaloOaId ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon
              className="mt-0.5 size-5 shrink-0 text-emerald-500"
              weight="fill"
            />
            <div>
              <p className="font-medium text-foreground">Zalo connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {zaloOaName ?? "Official Account"}
              </p>
            </div>
          </div>
          <Button
            disabled={disconnecting}
            size="sm"
            type="button"
            variant="outline"
            onClick={handleDisconnect}
          >
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <ChatCircleIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              weight="regular"
            />
            <div>
              <p className="font-medium text-foreground">Zalo not connected</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect your Zalo Official Account so guests can book over Zalo.
              </p>
            </div>
          </div>
          {canConnect ? (
            <Button asChild size="sm" type="button">
              <a href={`/api/zalo/oauth/start?returnTo=${ROUTES.DASHBOARD_SETTINGS}`}>
                <ChatCircleIcon className="size-4" weight="fill" />
                <span className="ml-2">Connect Zalo</span>
              </a>
            </Button>
          ) : (
            <Button asChild size="sm" type="button" variant="outline">
              <a href={ROUTES.DASHBOARD_BILLING}>
                <span>Upgrade to connect</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the settings page**

In `app/dashboard/settings/page.tsx`:

Add the import beside the Messenger card import:

```ts
import { ZaloConnectionCard } from "@/app/_components/zalo-connection-card";
```

Beside the `messengerConn` read added in Task 2, load both connections in parallel — two sequential awaits here are a waterfall on a page that already does several round trips:

```ts
const [messengerConn, zaloConn] = await Promise.all([
  getChannelConnection(dashboard.workspaceId, "messenger"),
  getChannelConnection(dashboard.workspaceId, "zalo"),
]);
```

Beside the existing `canConnectMessenger` computation, add:

```ts
canConnectZalo = canUseFeature(
  {
    planTier: (workspaceRow?.plan_tier as PlanTier) ?? "free",
    subscriptionStatus:
      (workspaceRow?.subscription_status as SubscriptionStatus | null) ?? null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: (workspaceRow?.trial_ends_at as string | null) ?? null,
  },
  PLAN_FEATURE.ZALO,
);
```

Match the exact argument shape the existing `canConnectMessenger` call uses in that file — copy it and change only the feature constant.

Add a Zalo section immediately after the Messenger section (lines 172–189), mirroring its markup:

```tsx
<div>
  <h2 className="text-sm font-semibold tracking-tight text-foreground">
    Zalo
  </h2>
  <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
    Connect your Zalo Official Account so guests can book over Zalo.
  </p>
</div>
<div className="min-w-0">
  <ZaloConnectionCard
    workspaceId={dashboard.workspaceId}
    zaloOaId={zaloConn?.externalId ?? null}
    zaloOaName={zaloConn?.displayName ?? null}
    canConnect={canConnectZalo}
  />
</div>
```

Wrap it in the same container element the Messenger section uses.

- [ ] **Step 4: Verify the UI**

```bash
npm run typecheck
npm run doctor
```

Expected: typecheck clean; doctor reports no new errors. Fix any it raises before continuing.

- [ ] **Step 5: Look at it**

Start the dev server with the preview tooling (not `npm run dev` in a raw shell), open `/dashboard/settings`, and confirm the Zalo section renders in the disconnected state with a Connect button. Take a screenshot for the task record.

- [ ] **Step 6: Commit**

```bash
git add app/_components/zalo-connection-card.tsx app/dashboard/settings/actions.ts app/dashboard/settings/page.tsx
git commit -m "feat(zalo): settings connection card and disconnect action"
```

---

## Task 9: The eve channel

**Files:**
- Create: `agent/channels/zalo.ts`
- Create: `agent/channels/zalo.test.ts`
- Modify: `lib/chat-sessions.ts`

**Interfaces:**
- Consumes: `verifyZaloSignature`, `parseZaloEvents`, `ZaloMessageEvent` (Task 3); `sendZaloText` (Task 4); `getZaloCredentialsForWorkspace` (Task 6); `getChannelConnectionByExternalId` (Task 1); existing `getOrCreateChannelSession`, `channelVisitorId`, `upsertChatMessages`, `touchChannelSession`, `findChatSessionByEveSessionId`, `checkAgentRateLimit`, `assertWorkspaceSubscriptionActive`, `getWorkspaceReplyLocale`, `createTranslator`.
- Produces: `chatMessageExists(sessionId: string, eveMessageId: string): Promise<boolean>`; the channel's default export.

- [ ] **Step 1: Add the dedupe helper**

`upsertChatMessages` already skips a message whose `eve_message_id` exists, but it returns `void`, so the channel cannot tell a retry from a first delivery. Add to `lib/chat-sessions.ts`, next to `findChatSessionByEveSessionId`:

```ts
/**
 * Has this provider message id already been stored for the session?
 *
 * Channels retry a webhook when they do not get a timely 200. Without this
 * check a retry is answered a second time and billed a second LLM turn.
 */
export async function chatMessageExists(
  sessionId: string,
  eveMessageId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("eve_message_id", eveMessageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}
```

- [ ] **Step 2: Write the failing test**

Create `agent/channels/zalo.test.ts`:

```ts
/**
 * Zalo channel handler. Every lib boundary is mocked, so this runs without a
 * database or network — what it proves is routing, gating and tenant
 * isolation, which is where a channel bug is most expensive.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const APP_ID = "test-zalo-app-id";
const OA_SECRET = "test-zalo-oa-secret";
const WS_A = "workspace-a";
const WS_B = "workspace-b";

const mocks = vi.hoisted(() => ({
  getChannelConnectionByExternalId: vi.fn(),
  assertWorkspaceSubscriptionActive: vi.fn(),
  getWorkspaceReplyLocale: vi.fn(),
  getZaloCredentialsForWorkspace: vi.fn(),
  sendZaloText: vi.fn(),
  getOrCreateChannelSession: vi.fn(),
  upsertChatMessages: vi.fn(),
  touchChannelSession: vi.fn(),
  chatMessageExists: vi.fn(),
  findChatSessionByEveSessionId: vi.fn(),
  checkAgentRateLimit: vi.fn(),
}));

vi.mock("@/lib/channel-connections", () => ({
  getChannelConnectionByExternalId: mocks.getChannelConnectionByExternalId,
}));
vi.mock("@/lib/workspace", () => ({
  assertWorkspaceSubscriptionActive: mocks.assertWorkspaceSubscriptionActive,
  getWorkspaceReplyLocale: mocks.getWorkspaceReplyLocale,
  getZaloCredentialsForWorkspace: mocks.getZaloCredentialsForWorkspace,
}));
vi.mock("@/lib/zalo", () => ({ sendZaloText: mocks.sendZaloText }));
vi.mock("@/lib/chat-sessions", () => ({
  channelVisitorId: (channel: string, id: string) => `${channel}:${id}`,
  getOrCreateChannelSession: mocks.getOrCreateChannelSession,
  upsertChatMessages: mocks.upsertChatMessages,
  touchChannelSession: mocks.touchChannelSession,
  chatMessageExists: mocks.chatMessageExists,
  findChatSessionByEveSessionId: mocks.findChatSessionByEveSessionId,
}));
vi.mock("@/lib/agent-rate-limit", () => ({
  checkAgentRateLimit: mocks.checkAgentRateLimit,
}));

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app_id: APP_ID,
    oa_id: "oa_a",
    timestamp: "1800000000000",
    event_name: "user_send_text",
    sender: { id: "user_1" },
    recipient: { id: "oa_a" },
    message: { text: "đặt lịch giúp mình", msg_id: "msg_1" },
    ...overrides,
  });
}

function sign(raw: string, secret = OA_SECRET): string {
  const timestamp = JSON.parse(raw).timestamp as string;
  return `mac=${createHash("sha256").update(APP_ID + raw + timestamp + secret).digest("hex")}`;
}

/** Resolve the POST /webhook handler from the channel definition. */
async function postHandler() {
  const channel = (await import("./zalo")).default;
  const route = channel.routes.find(
    (r: { method: string; path: string }) => r.method === "POST" && r.path === "/webhook",
  );
  return route!.handler as (req: Request, args: unknown) => Promise<Response>;
}

function request(raw: string, signature: string | null) {
  return new Request("https://app.example.com/eve/v1/zalo/webhook", {
    method: "POST",
    headers: signature
      ? { "X-ZEvent-Signature": signature, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" },
    body: raw,
  });
}

function args() {
  const sent: unknown[] = [];
  return {
    sent,
    send: vi.fn(async (payload: unknown) => {
      sent.push(payload);
      return { id: "eve-session-1" };
    }),
    waitUntil: (p: Promise<unknown>) => p,
    requestIp: "1.2.3.4",
  };
}

beforeEach(() => {
  mocks.getChannelConnectionByExternalId.mockResolvedValue({
    workspaceId: WS_A,
    provider: "zalo",
    externalId: "oa_a",
    displayName: "OA A",
    accessToken: "at-1",
    refreshToken: "rt-1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    metadata: {},
  });
  mocks.assertWorkspaceSubscriptionActive.mockResolvedValue(undefined);
  mocks.getWorkspaceReplyLocale.mockResolvedValue("vi");
  mocks.getZaloCredentialsForWorkspace.mockResolvedValue({
    oaId: "oa_a",
    accessToken: "at-1",
  });
  mocks.getOrCreateChannelSession.mockResolvedValue({ id: "session-1", workspace_id: WS_A });
  mocks.upsertChatMessages.mockResolvedValue(undefined);
  mocks.touchChannelSession.mockResolvedValue(undefined);
  mocks.chatMessageExists.mockResolvedValue(false);
  mocks.checkAgentRateLimit.mockResolvedValue({ ok: true });
  mocks.sendZaloText.mockResolvedValue({ messageId: "out-1" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("zalo webhook", () => {
  it("rejects a bad signature and never invokes the agent", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw, "wrong-secret")), a);

    expect(res.status).toBe(401);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header", async () => {
    const handler = await postHandler();
    const raw = body();
    expect((await handler(request(raw, null), args())).status).toBe(401);
  });

  it("404s an oa_id that maps to no workspace, without falling back", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue(null);
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(404);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("opens the session in the workspace the oa_id belongs to, not another", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue({
      workspaceId: WS_B,
      provider: "zalo",
      externalId: "oa_b",
      displayName: "OA B",
      accessToken: "at-b",
      refreshToken: null,
      expiresAt: null,
      metadata: {},
    });
    const handler = await postHandler();
    const raw = body({ oa_id: "oa_b", recipient: { id: "oa_b" } });

    await handler(request(raw, sign(raw)), args());

    expect(mocks.getOrCreateChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_B, channel: "zalo" }),
    );
  });

  it("skips an inactive subscription without burning an LLM turn", async () => {
    mocks.assertWorkspaceSubscriptionActive.mockRejectedValue(new Error("inactive"));
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("tells a rate-limited guest instead of dropping the message", async () => {
    mocks.checkAgentRateLimit.mockResolvedValue({ ok: false, errorCode: "agent_rate_limited" });
    const handler = await postHandler();
    const a = args();
    const raw = body();

    await handler(request(raw, sign(raw)), a);

    expect(a.send).not.toHaveBeenCalled();
    expect(mocks.sendZaloText).toHaveBeenCalled();
  });

  it("ignores a redelivered msg_id", async () => {
    mocks.chatMessageExists.mockResolvedValue(true);
    const handler = await postHandler();
    const a = args();
    const raw = body();

    await handler(request(raw, sign(raw)), a);

    expect(a.send).not.toHaveBeenCalled();
    expect(mocks.sendZaloText).not.toHaveBeenCalled();
  });

  it("drives the agent and records the eve session on the happy path", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(a.send).toHaveBeenCalledWith(
      { message: "đặt lịch giúp mình" },
      expect.objectContaining({
        continuationToken: `zalo:${WS_A}:user_1`,
        auth: expect.objectContaining({
          authenticator: "zalo",
          principalId: "user_1",
          attributes: expect.objectContaining({ channel: "zalo", chatSessionId: "session-1" }),
        }),
      }),
    );
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        messages: [
          expect.objectContaining({ role: "user", eve_message_id: "zalo:msg_1" }),
        ],
      }),
    );
    expect(mocks.touchChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", eveSessionId: "eve-session-1" }),
    );
  });

  it("returns 200 with skipped:true for a non-text event", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body({ event_name: "follow" });

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(a.send).not.toHaveBeenCalled();
  });
});

describe("message.completed", () => {
  it("persists the reply and delivers it", async () => {
    mocks.findChatSessionByEveSessionId.mockResolvedValue({
      id: "session-1",
      workspace_id: WS_A,
      external_user_id: "user_1",
    });
    const channel = (await import("./zalo")).default;

    await channel.events["message.completed"](
      { message: "mai 3h chiều nhé", turnId: "t1", sequence: 0, finishReason: "stop" },
      null,
      { session: { id: "eve-session-1" } },
    );

    expect(mocks.upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ role: "assistant", content: "mai 3h chiều nhé" })],
      }),
    );
    expect(mocks.sendZaloText).toHaveBeenCalledWith("at-1", "user_1", "mai 3h chiều nhé");
  });

  it("does not throw into the turn loop when delivery fails", async () => {
    mocks.findChatSessionByEveSessionId.mockResolvedValue({
      id: "session-1",
      workspace_id: WS_A,
      external_user_id: "user_1",
    });
    mocks.sendZaloText.mockRejectedValue(new Error("zalo down"));
    const channel = (await import("./zalo")).default;

    await expect(
      channel.events["message.completed"](
        { message: "xin chào", turnId: "t1", sequence: 0, finishReason: "stop" },
        null,
        { session: { id: "eve-session-1" } },
      ),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run agent/channels/zalo.test.ts`
Expected: FAIL — `Cannot find module './zalo'`.

- [ ] **Step 4: Implement the channel**

Create `agent/channels/zalo.ts`:

```ts
import { defineChannel, POST, GET } from "eve/channels";
import {
  verifyZaloSignature,
  parseZaloEvents,
  type ZaloMessageEvent,
} from "@/lib/zalo-webhook";
import { sendZaloText } from "@/lib/zalo";
import { getChannelConnectionByExternalId } from "@/lib/channel-connections";
import {
  assertWorkspaceSubscriptionActive,
  getWorkspaceReplyLocale,
  getZaloCredentialsForWorkspace,
} from "@/lib/workspace";
import { createTranslator } from "@/lib/i18n";
import {
  getOrCreateChannelSession,
  channelVisitorId,
  upsertChatMessages,
  touchChannelSession,
  chatMessageExists,
  findChatSessionByEveSessionId,
} from "@/lib/chat-sessions";
import { checkAgentRateLimit } from "@/lib/agent-rate-limit";

function getAppId(): string {
  const id = process.env.ZALO_APP_ID?.trim();
  if (!id) throw new Error("ZALO_NOT_CONFIGURED");
  return id;
}

function getOaSecretKey(): string {
  const key = process.env.ZALO_OA_SECRET_KEY?.trim();
  if (!key) throw new Error("ZALO_NOT_CONFIGURED");
  return key;
}

export default defineChannel({
  routes: [
    // Zalo has no challenge handshake — it verifies domain ownership in the
    // developer dashboard. This exists so the URL answers a health check.
    GET("/webhook", async () => new Response("ok", { status: 200 })),

    POST("/webhook", async (req, args) => {
      const rawBody = await req.text();

      // Signature first: everything below trusts this body.
      const sig = req.headers.get("x-zevent-signature");
      if (!verifyZaloSignature(rawBody, sig, getAppId(), getOaSecretKey())) {
        return new Response("invalid_signature", { status: 401 });
      }

      const events = parseZaloEvents(rawBody);
      if (events.length === 0) {
        return Response.json({ ok: true, skipped: true });
      }

      // The webhook URL is registered once per app and shared by every OA, so
      // the tenant comes from the payload, not the URL. An unresolved OA is a
      // failure — never a fallback to another workspace.
      const conn = await getChannelConnectionByExternalId("zalo", events[0].oaId);
      if (!conn) {
        return new Response("zalo_not_configured", { status: 404 });
      }
      const workspaceId = conn.workspaceId;

      // Same paywall as guest web chat — otherwise an unpaid workspace still
      // burns LLM turns through Zalo.
      try {
        await assertWorkspaceSubscriptionActive(workspaceId);
      } catch {
        return Response.json({ ok: true, skipped: "subscription_inactive" });
      }

      const locale = await getWorkspaceReplyLocale(workspaceId);
      const t = createTranslator(locale);
      const ip = args.requestIp ?? "0.0.0.0";

      const handle = async (msg: ZaloMessageEvent) => {
        // A batch could in principle mix OAs; never cross the tenant boundary.
        if (msg.oaId !== conn.externalId) return;

        const visitorId = channelVisitorId("zalo", msg.userId);

        const session = await getOrCreateChannelSession({
          workspaceId,
          channel: "zalo",
          externalUserId: msg.userId,
          visitorId,
          title: msg.text.slice(0, 48),
        });

        // Zalo retries a webhook it thinks failed. Without this the guest is
        // answered twice and the workspace is billed two LLM turns.
        const inboundId = msg.msgId ? `zalo:${msg.msgId}` : "";
        if (inboundId && (await chatMessageExists(session.id, inboundId))) return;

        const limited = await checkAgentRateLimit({
          visitorId,
          ip,
          workspaceSlug: undefined,
        });

        if (!limited.ok) {
          try {
            const creds = await getZaloCredentialsForWorkspace(workspaceId);
            await sendZaloText(creds.accessToken, msg.userId, t("chat.rateLimited"));
          } catch (error) {
            console.error("[zalo] rate-limit notice failed", error);
          }
          return;
        }

        await upsertChatMessages({
          sessionId: session.id,
          messages: [
            {
              role: "user",
              content: msg.text,
              ...(inboundId ? { eve_message_id: inboundId } : {}),
            },
          ],
        });

        const run = await args.send(
          { message: msg.text },
          {
            auth: {
              authenticator: "zalo",
              principalType: "user",
              principalId: msg.userId,
              attributes: {
                chatSessionId: session.id,
                visitorId,
                locale,
                channel: "zalo",
                externalUserId: msg.userId,
              },
            },
            continuationToken: `zalo:${workspaceId}:${msg.userId}`,
            title: msg.text.slice(0, 48),
          },
        );
        await touchChannelSession({ id: session.id, eveSessionId: run.id });
      };

      // Drive the agent in the background — Zalo retries on a slow response.
      // Sequential so two messages from one guest keep their order.
      args.waitUntil(
        (async () => {
          for (const msg of events) {
            try {
              await handle(msg);
            } catch (error) {
              console.error("[zalo] failed to handle message", msg.msgId, error);
            }
          }
        })(),
      );

      return Response.json({ ok: true, received: events.length });
    }),
  ],

  events: {
    async "message.completed"(data, _channel, ctx) {
      if (!data.message?.trim()) return;

      const chat = await findChatSessionByEveSessionId(ctx.session.id);
      if (!chat?.external_user_id || !chat.workspace_id) return;

      await upsertChatMessages({
        sessionId: chat.id,
        messages: [
          {
            role: "assistant",
            content: data.message,
            eve_message_id: `${data.turnId}:${data.sequence}`,
            raw: {
              turnId: data.turnId,
              sequence: data.sequence,
              finishReason: data.finishReason,
            },
          },
        ],
      });

      // Never throw into the turn loop, but do not swallow silently either —
      // a dropped reply is invisible to the guest.
      try {
        const creds = await getZaloCredentialsForWorkspace(chat.workspace_id);
        await sendZaloText(creds.accessToken, chat.external_user_id, data.message);
      } catch (error) {
        console.error(
          `[zalo] reply delivery failed for workspace ${chat.workspace_id}`,
          error,
        );
      }
    },
  },
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run agent/channels/zalo.test.ts`
Expected: PASS, 11 tests.

If the `postHandler` helper cannot find the route, inspect the shape `defineChannel` returns (`node_modules/eve/` — read the channels docs, not training-data assumptions) and adjust the helper. Do not change the channel to suit the test.

- [ ] **Step 6: Confirm the channel builds into the agent**

Run: `npm run build:eve`
Expected: completes; `zalo` appears alongside `messenger` and `eve` in the built channel list.

- [ ] **Step 7: Commit**

```bash
npm run typecheck
git add agent/channels/zalo.ts agent/channels/zalo.test.ts lib/chat-sessions.ts
git commit -m "feat(zalo): eve channel with payload-based workspace resolution"
```

---

## Task 10: Simulator, dry-run guard, seed and docs

The task that makes the feature testable without a Zalo account.

**Files:**
- Create: `scripts/zalo-sim.mjs`
- Modify: `lib/zalo.ts` (dry-run), `lib/zalo.test.ts` (guard test)
- Modify: `supabase/seed.sql`, `.env.example`, `package.json`
- Modify: `.claude/skills/test-feature/SKILL.md`

**Interfaces:**
- Consumes: `sendZaloText` (Task 4); the channel from Task 9.
- Produces: `npm run zalo:sim` script entry.

- [ ] **Step 1: Write the failing dry-run test**

Append to `lib/zalo.test.ts`:

```ts
describe("ZALO_DRY_RUN", () => {
  it("skips the network and returns a synthetic id when enabled", async () => {
    vi.stubEnv("ZALO_DRY_RUN", "1");
    vi.resetModules();
    const fetchMock = stubFetch(sendOk);

    const { sendZaloText: dryRunSend } = await import("./zalo");
    const result = await dryRunSend("at-1", "user_1", "xin chào");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.messageId).toMatch(/^dry-run:/);
  });

  it("refuses to load with dry run enabled in production", async () => {
    vi.stubEnv("ZALO_DRY_RUN", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    await expect(import("./zalo")).rejects.toThrow(/ZALO_DRY_RUN/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/zalo.test.ts -t "ZALO_DRY_RUN"`
Expected: FAIL — the real fetch is called and no guard exists.

- [ ] **Step 3: Implement the dry-run guard**

In `lib/zalo.ts`, after the constants:

```ts
/**
 * Local testing without a Zalo Official Account: log the outbound message
 * instead of calling the API, so the whole inbound pipeline can be exercised
 * end to end. See scripts/zalo-sim.mjs.
 *
 * Hard-guarded against production. A flag that silently stops delivering
 * customer messages is a worse failure than the one it helps test.
 */
const ZALO_DRY_RUN = process.env.ZALO_DRY_RUN === "1";

if (ZALO_DRY_RUN && process.env.NODE_ENV === "production") {
  throw new Error("ZALO_DRY_RUN must never be enabled in production");
}
```

At the top of `sendZaloText`, after the chunking guard:

```ts
  if (ZALO_DRY_RUN) {
    for (const chunk of chunks) {
      console.log(`[zalo:dry-run] → ${userId}: ${chunk}`);
    }
    return { messageId: `dry-run:${Date.now()}` };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/zalo.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Seed a fake connection**

Append to `supabase/seed.sql`, after the Pilot workspace insert:

```sql
-- Fake Zalo connection so scripts/zalo-sim.mjs has a target immediately after
-- `npx supabase db reset`. The tokens are not real and never leave the machine;
-- outbound sends run under ZALO_DRY_RUN.
insert into public.workspace_channel_connections
  (workspace_id, provider, external_id, display_name, expires_at)
values
  ('00000000-0000-4000-8000-000000000001', 'zalo', 'oa_dev_local',
   'Dev Local OA', now() + interval '10 years')
on conflict (workspace_id, provider) do nothing;
```

Note the row deliberately has no `access_encrypted`: `getZaloAccessToken` would reject it, and under `ZALO_DRY_RUN` nothing needs a real token. If the rate-limit reply path is being exercised, temporarily connect a real-looking token instead.

- [ ] **Step 6: Write the simulator**

Create `scripts/zalo-sim.mjs`:

```js
#!/usr/bin/env node
/**
 * Simulate an inbound Zalo OA message against a locally running dev server.
 *
 * Signs a `user_send_text` payload exactly as Zalo does and POSTs it at the
 * channel webhook, so the whole real pipeline runs — signature verification,
 * workspace resolution, session creation, the agent, Cal.com booking. Only the
 * outbound send is stubbed, via ZALO_DRY_RUN.
 *
 *   node scripts/zalo-sim.mjs --text "cho mình đặt lịch mai 3h chiều"
 *   node scripts/zalo-sim.mjs --oa oa_dev_local --user guest_1 --text "..."
 */
import { createHash } from "node:crypto";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const target = arg("url", "http://127.0.0.1:2000/eve/v1/zalo/webhook");

// This tool forges a signature. It must never be pointed at a deployed app.
const host = new URL(target).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to run against a non-local host: ${host}`);
  process.exit(1);
}

const appId = process.env.ZALO_APP_ID?.trim();
const oaSecret = process.env.ZALO_OA_SECRET_KEY?.trim();
if (!appId || !oaSecret) {
  console.error("Set ZALO_APP_ID and ZALO_OA_SECRET_KEY in your environment first.");
  process.exit(1);
}

const oaId = arg("oa", "oa_dev_local");
const userId = arg("user", "sim_user_1");
const text = arg("text", "cho mình đặt lịch mai 3h chiều");
const timestamp = String(Date.now());

const payload = {
  app_id: appId,
  oa_id: oaId,
  timestamp,
  event_name: "user_send_text",
  sender: { id: userId },
  recipient: { id: oaId },
  message: { text, msg_id: `sim_${timestamp}` },
};

const raw = JSON.stringify(payload);
const mac = createHash("sha256").update(appId + raw + timestamp + oaSecret).digest("hex");

const res = await fetch(target, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-ZEvent-Signature": `mac=${mac}`,
  },
  body: raw,
});

console.log(`${res.status} ${res.statusText}`);
console.log(await res.text());
console.log(
  "\nThe agent replies asynchronously — watch the dev server log for [zalo:dry-run] lines,\nor open the conversation in /dashboard.",
);
```

- [ ] **Step 7: Add the npm script and env template**

In `package.json` `scripts`, after `"dev:eve:pinned"`:

```json
    "zalo:sim": "node ./scripts/zalo-sim.mjs",
```

In `.env.example`, after the Messenger block:

```bash
# Zalo Official Account (developers.zalo.me → your app → Official Account API)
ZALO_APP_ID=
ZALO_APP_SECRET=
ZALO_OA_SECRET_KEY=
ZALO_REDIRECT_URI=http://localhost:3000/api/zalo/oauth/callback
# Local testing only: log outbound Zalo messages instead of sending them.
# Refuses to load when NODE_ENV=production.
ZALO_DRY_RUN=1
```

- [ ] **Step 8: Run the simulator end to end**

```bash
npx supabase db reset
```

Start the dev server through the preview tooling, then:

```bash
npm run zalo:sim -- --text "cho mình đặt lịch cắt tóc mai 3h chiều"
```

Expected: the script prints `200 OK`; the dev server log shows `[zalo:dry-run] → sim_user_1: …` with the agent's reply; the conversation appears in `/dashboard` under the Pilot workspace.

If the agent errors because the seeded connection has no access token, that is the documented `getZaloAccessToken` behaviour — the inbound half still proves out. Note it in the task record.

- [ ] **Step 9: Record the live-account checklist**

Append to `.claude/skills/test-feature/SKILL.md` a `## Zalo OA (needs a live account)` section with these seven steps verbatim:

```markdown
## Zalo OA (needs a live account)

Everything else about the Zalo channel is covered by `npm test` and
`npm run zalo:sim`. These seven steps are the part that cannot be simulated —
run them the first time a real OA is connected, before trusting the channel.

1. Connect the OA from Settings; confirm tokens persist and the card shows the
   OA name.
2. Message the OA from a second Zalo account; confirm the agent replies.
3. Compare the first live webhook body against `lib/__fixtures__/zalo/` and
   reconcile any difference.
4. Send a reply longer than `ZALO_TEXT_LIMIT`; confirm chunking delivers all
   of it, in order.
5. Leave the conversation idle past one hour, then message again. This is the
   only real test of token refresh.
6. Confirm the booking landed in the correct workspace, not Pilot.
7. Disconnect; confirm the agent stops answering.
```

- [ ] **Step 10: Full verification and commit**

```bash
npm run typecheck
npx vitest run
npm run doctor
graphify update .
```

Expected: typecheck clean, all tests pass, doctor reports no new errors.

```bash
git add scripts/zalo-sim.mjs lib/zalo.ts lib/zalo.test.ts supabase/seed.sql .env.example package.json .claude/skills/test-feature/SKILL.md graphify-out
git commit -m "feat(zalo): local webhook simulator, dry-run guard and test runbook"
```

---

## Final verification

Run before calling the feature done. Step 5 is the one that answers "does this actually work"; the rest only say nothing is obviously broken.

- [ ] `npx supabase db reset` — migration, backfill and seed apply from scratch
- [ ] `npx vitest run` with the local database up — no skipped Layer 3 suites
- [ ] `npm run typecheck`
- [ ] `npm run doctor`
- [ ] `npm run zalo:sim -- --text "cho mình đặt lịch mai 3h chiều"` produces an agent reply and a Cal.com booking in the correct workspace, visible in the dashboard
- [ ] Messenger regression: connect, message, disconnect still work after the credential move
- [ ] `graphify update .`

## Deferred (do not do in this plan)

- Dropping `workspaces.messenger_page_id` / `messenger_page_name` / `messenger_page_access_token_encrypted` — a follow-up migration, after this ships and holds
- WhatsApp, ZNS reminders, image and attachment handling — all out of scope per the spec's non-goals

**Done outside this plan, after it shipped:** Messenger's `?workspace_id=` webhook
resolution was replaced with the same payload-based lookup Zalo uses
(`getChannelConnectionByExternalId("messenger", pageId)`), once Zalo's version had
proven the pattern. See `agent/channels/messenger.ts` and its new
`agent/messenger-channel.test.ts` (no channel-level test existed for Messenger before).
