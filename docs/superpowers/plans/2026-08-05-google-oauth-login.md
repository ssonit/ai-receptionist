# Google OAuth Login/Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Continue with Google" to `/login` and `/signup` (Supabase-managed OAuth), make it work correctly for the staff-invite flow without ever creating a throwaway workspace, and add an in-app pending-invite banner so an existing user doesn't need the emailed link to accept an invite.

**Architecture:** Reuse Supabase Auth's built-in Google provider end-to-end — `supabase.auth.signInWithOAuth()` → existing `/auth/callback` route → existing `handle_new_user` trigger / `accept_workspace_invite` RPC. The only genuinely new pieces are: a signed short-lived cookie to carry a staff-invite token through the OAuth redirect (mirrors the existing `lib/cal-oauth-state.ts` pattern), one new branch in `handle_new_user` so an OAuth signup can be matched to a pending invite by email (Google can't carry `invite_token` metadata the way `signUp()` can), and a new read-only RPC + banner so an existing account sees a pending invite without the emailed link.

**Tech Stack:** Next.js Server Actions + Route Handlers, Supabase Auth (`@supabase/ssr`), Postgres `security definer` RPC/trigger functions, Vitest.

Full design rationale, alternatives considered, and the mid-design correction (why `accept_workspace_invite` is never modified) live in [`docs/superpowers/specs/2026-08-05-google-oauth-login-design.md`](../specs/2026-08-05-google-oauth-login-design.md) — read it once before starting if anything below is unclear on the *why*.

## Global Constraints

- **`AGENTS.md`'s "No automated test suite" claim is stale.** A real Vitest suite (47 test files, `npm test` = `vitest run`) was added 2026-07-31, after that doc was written. Use it: write real tests under `lib/**/*.test.ts` or `tests/**/*.test.ts` for anything that doesn't need a live Next.js request/cookie context. `vitest.config.mts` has two projects — `unit` (default, `createAdminClient` mocked via `tests/setup.ts`) and `db-integration` (real local Supabase, only for file paths explicitly listed in that project's `include`, matching `describe.skipIf(!dbUp)` — see `lib/channel-connections.test.ts` for the pattern).
- **No existing test mocks `lib/supabase/server.ts`** (the session/cookie-bound client used by Server Actions and Route Handlers). Nothing in this plan tries to unit-test `app/auth/actions.ts` or `app/auth/callback/route.ts` directly — those are verified manually against a real local Supabase + real Google OAuth (Task 10). This matches the rest of the codebase: only admin-client-backed code has unit tests today.
- Migrations: new files only, timestamp after `20260804000002` (today's date 2026-08-05) — **never edit an already-applied migration file**. Test with `npx supabase db reset`.
- Every `security definer` SQL function: `set search_path = public`, matching every existing function in `supabase/migrations/`.
- User-facing errors: `AUTH_ERROR_CODE` / `authErrorMessage()` (auth flows) — never a raw Supabase/provider string. See `.claude/rules/errors.md`.
- Route constants: `ROUTES.*` / `bookingRoute()` / `inviteRoute()` from `lib/routes.ts` — never a hardcoded `"/login"` string.
- After any React/UI task: `npm run doctor` (react-doctor, scope changed). After any code task: `graphify update .` before committing.
- One commit per task (this plan's own convention — see recent plans in `docs/superpowers/plans/`).
- `accept_workspace_invite()` (`supabase/migrations/20260726000001_workspace_invites_hardening.sql`) is **never modified** by this plan. It deliberately refuses to reassign a user out of any workspace they already have (`already_in_workspace`) — that hardening stays exactly as-is.

## File Structure

**Create:**
- `supabase/migrations/20260805000001_handle_new_user_oauth_invite.sql` — `handle_new_user` OAuth email-fallback branch.
- `tests/handle-new-user-oauth-invite.test.ts` — real DB-integration test for the above (via `createAdminClient().auth.admin.createUser()`, no Google needed).
- `supabase/migrations/20260805000002_list_my_pending_invites.sql` — new read-only RPC.
- `lib/google-invite-state.ts` + `lib/google-invite-state.test.ts` — signed cookie helper, mirrors `lib/cal-oauth-state.ts`.
- `components/auth/google-signin-button.tsx` — shared button for `login-form.tsx` + `signup-form.tsx`.
- `components/pending-invite-banner.tsx` — dashboard banner, mirrors `components/booking-live-banner.tsx`.

**Modify:**
- `supabase/config.toml`, `.env.example` — local Google provider config.
- `vitest.config.mts` — add the new integration test to the `db-integration` project.
- `lib/errors/auth-codes.ts`, `lib/errors/auth-messages.ts` — `OAUTH_FAILED`, `OAUTH_INVITE_INVALID`.
- `app/auth/actions.ts` — new `signInWithGoogle` action.
- `app/auth/callback/route.ts` — invite-state handling, `?error=` redirects.
- `app/login/page.tsx`, `app/login/login-form.tsx` — read/show `?error=`, render the Google button.
- `app/login/signup-form.tsx` — render the Google button.
- `lib/workspace-invites.ts` — new `getMyPendingInvites()`.
- `components/dashboard-shell.tsx` — render `PendingInviteBanner`.

---

### Task 1: Google Cloud Console — OAuth Client

**Files:** none (manual, external to the repo).

**Interfaces:**
- Produces: a Google OAuth 2.0 Client ID + Client Secret, used by Task 2.

- [ ] **Step 1: Create the OAuth consent screen**

Go to https://console.cloud.google.com/apis/credentials/consent (create a project first if needed). Choose **External**, fill in app name/support email, add scopes `.../auth/userinfo.email` and `.../auth/userinfo.profile` (defaults), add your own Google account as a test user if the app stays in "Testing" mode.

- [ ] **Step 2: Create the OAuth Client ID**

Go to https://console.cloud.google.com/apis/credentials → **Create Credentials → OAuth client ID** → Application type **Web application**.

Authorized redirect URIs — add **both**:
```
http://127.0.0.1:54321/auth/v1/callback
https://<your-production-project-ref>.supabase.co/auth/v1/callback
```
(Get `<your-production-project-ref>` from the Supabase Dashboard URL once you have a hosted project — if you don't have one yet, add just the local URI now and the production one before Task 11.)

- [ ] **Step 3: Save the credentials**

Copy the **Client ID** and **Client Secret** shown after creation — you'll need both in Task 2. Do not commit them anywhere.

---

### Task 2: Local Supabase Google provider config

**Files:**
- Modify: `supabase/config.toml:319-337` (insert after the `[auth.external.apple]` block, before `[auth.web3.solana]`)
- Modify: `.env.example`

**Interfaces:**
- Produces: local GoTrue accepts `provider: "google"` for `signInWithOAuth`. Consumed by Task 10's manual test.

- [ ] **Step 1: Add the provider block to `supabase/config.toml`**

Insert immediately after line 335 (`email_optional = false`) and before the `# Allow Solana wallet holders...` comment:

```toml

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
# Overrides the default auth callback URL derived from auth.external_url.
redirect_uri = ""
# Overrides the default auth provider URL. Used to support self-hosted gitlab, single-tenant Azure,
# or any other third-party OIDC providers.
url = ""
# If enabled, the nonce check will be skipped. Required for local sign in with Google auth.
skip_nonce_check = false
```

- [ ] **Step 2: Add the env vars to `.env.example`**

Add near the other OAuth blocks (after the Cal.com OAuth section, e.g. after line 31 `CALCOM_OAUTH_REDIRECT_URI=...`):

```
# Google OAuth login (sign in with Google) — Task 1 in
# docs/superpowers/plans/2026-08-05-google-oauth-login.md
# Redirect URIs to register in Google Cloud Console:
#   Local:      http://127.0.0.1:54321/auth/v1/callback
#   Production: https://<project-ref>.supabase.co/auth/v1/callback
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

- [ ] **Step 3: Set real values in `.env.local` and restart Supabase**

Copy the two new keys into `.env.local` (not committed) with the values from Task 1.

Run:
```bash
npx supabase stop
npx supabase start
```

- [ ] **Step 4: Verify the provider is live locally**

Run:
```bash
npx supabase status -o env
```
Expected: command succeeds (confirms Supabase is up; GoTrue reads `config.toml` on start, there's no separate "list providers" CLI output — Task 10's browser test is the real verification that Google is wired up).

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "feat(auth): configure local Google OAuth provider"
```

---

### Task 3: `lib/google-invite-state.ts` — signed invite-state cookie

**Files:**
- Create: `lib/google-invite-state.ts`
- Test: `lib/google-invite-state.test.ts`

**Interfaces:**
- Consumes: `node:crypto` (`createHmac`, `randomBytes`), `process.env.WORKSPACE_SECRETS_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
- Produces (used by Task 6 and Task 7):
  - `createGoogleInviteState(inviteToken: string, next: string): { token: string; payload: GoogleInviteStatePayload }`
  - `parseGoogleInviteState(token: string): GoogleInviteStatePayload | null`
  - `GOOGLE_INVITE_STATE_COOKIE: string` (cookie name constant)
  - `type GoogleInviteStatePayload = { inviteToken: string; next: string; nonce: string; exp: number }`

- [ ] **Step 1: Write the failing tests**

Create `lib/google-invite-state.test.ts`:

```ts
/**
 * google-invite-state unit tests — sign/verify round-trip, tamper/expiry.
 * Mirrors lib/cal-oauth-state.test.ts.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const NOW = 1754400000000; // fixed instant for deterministic expiry tests

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("google-invite-state", () => {
  it("creates and verifies a state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token, payload } = createGoogleInviteState(
      "invite-token-abc",
      "/invite/invite-token-abc",
    );

    expect(token).toBeTruthy();
    expect(payload.inviteToken).toBe("invite-token-abc");
    expect(payload.next).toBe("/invite/invite-token-abc");
    expect(payload.nonce).toHaveLength(32); // 16 bytes hex
    expect(payload.exp).toBeGreaterThan(NOW);

    const verified = parseGoogleInviteState(token);
    expect(verified).not.toBeNull();
    expect(verified!.inviteToken).toBe("invite-token-abc");
    expect(verified!.next).toBe("/invite/invite-token-abc");
  });

  it("rejects tampered state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    const parts = token.split(".");
    const tamperedPayload =
      parts[0]!.slice(0, -1) + (parts[0]!.endsWith("A") ? "B" : "A");
    const tampered = `${tamperedPayload}.${parts[1]}`;

    expect(parseGoogleInviteState(tampered)).toBeNull();
  });

  it("rejects expired state token", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(parseGoogleInviteState(token)).toBeNull();
  });

  it("accepts token just before expiry", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    vi.advanceTimersByTime(9 * 60 * 1000);

    expect(parseGoogleInviteState(token)).not.toBeNull();
  });

  it("rejects token with corrupted signature", async () => {
    const { createGoogleInviteState, parseGoogleInviteState } = await import(
      "./google-invite-state"
    );
    const { token } = createGoogleInviteState("invite-token-abc", "/dashboard");

    const parts = token.split(".");
    const corrupted = `${parts[0]}.${parts[1]!.slice(0, -2)}xx`;

    expect(parseGoogleInviteState(corrupted)).toBeNull();
  });

  it("rejects garbage input", async () => {
    const { parseGoogleInviteState } = await import("./google-invite-state");
    expect(parseGoogleInviteState("not-a-token")).toBeNull();
    expect(parseGoogleInviteState("")).toBeNull();
    expect(parseGoogleInviteState("a.b.c")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/google-invite-state.test.ts`
Expected: FAIL — `Cannot find module './google-invite-state'`.

- [ ] **Step 3: Write the implementation**

Create `lib/google-invite-state.ts`:

```ts
/**
 * Signed state cookie carrying a staff invite token through the Google OAuth
 * redirect round trip — short-lived, HMAC-SHA256, single-use. Mirrors
 * lib/cal-oauth-state.ts's pattern; kept as a separate cookie name so a
 * Cal/Zalo connect in another tab can't collide with (or clear) this one.
 */
import { createHmac, randomBytes } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateSecret(): string {
  return (
    process.env.WORKSPACE_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "dev-only-eve-workspace-secrets"
  );
}

export type GoogleInviteStatePayload = {
  inviteToken: string;
  next: string;
  nonce: string;
  exp: number;
};

function signPayload(payload: GoogleInviteStatePayload): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const hmac = createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${hmac}`;
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function verifyPayload(token: string): GoogleInviteStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let payload: GoogleInviteStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload.inviteToken ||
    !payload.next ||
    !payload.nonce ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (Date.now() > payload.exp) return null;
  return payload;
}

/** Create a signed state token for the Google OAuth redirect. */
export function createGoogleInviteState(
  inviteToken: string,
  next: string,
): { token: string; payload: GoogleInviteStatePayload } {
  const payload: GoogleInviteStatePayload = {
    inviteToken,
    next,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  return { token: signPayload(payload), payload };
}

/** Verify a state token from the callback. Returns payload or null. */
export function parseGoogleInviteState(
  token: string,
): GoogleInviteStatePayload | null {
  return verifyPayload(token);
}

export const GOOGLE_INVITE_STATE_COOKIE = "eve_google_invite_state";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/google-invite-state.test.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add lib/google-invite-state.ts lib/google-invite-state.test.ts
git commit -m "feat(auth): add signed Google invite-state cookie helper"
```

---

### Task 4: New `AUTH_ERROR_CODE` entries

**Files:**
- Modify: `lib/errors/auth-codes.ts`
- Modify: `lib/errors/auth-messages.ts`

**Interfaces:**
- Produces: `AUTH_ERROR_CODE.OAUTH_FAILED`, `AUTH_ERROR_CODE.OAUTH_INVITE_INVALID`. Consumed by Task 6, 7, 8.

- [ ] **Step 1: Add the codes**

Edit `lib/errors/auth-codes.ts` — add two entries to the `AUTH_ERROR_CODE` object (after `NAME_REQUIRED: "name_required",`):

```ts
  OAUTH_FAILED: "oauth_failed",
  OAUTH_INVITE_INVALID: "oauth_invite_invalid",
```

- [ ] **Step 2: Add the copy**

Edit `lib/errors/auth-messages.ts` — add two entries to `AUTH_ERROR_MESSAGE` (after the `NAME_REQUIRED` entry):

```ts
  [AUTH_ERROR_CODE.OAUTH_FAILED]:
    "Could not sign in with Google. Try again.",
  [AUTH_ERROR_CODE.OAUTH_INVITE_INVALID]:
    "That invite link is no longer valid, but you're signed in — check your dashboard or ask the workspace owner for a new invite.",
```

`as const satisfies Record<AuthErrorCode, string>` on the object means TypeScript itself fails the build if either entry is missing — that's the verification.

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors (would fail here if either message entry were missing).

```bash
git add lib/errors/auth-codes.ts lib/errors/auth-messages.ts
git commit -m "feat(auth): add OAUTH_FAILED and OAUTH_INVITE_INVALID error codes"
```

---

### Task 5: `handle_new_user` OAuth invite email-fallback

**Files:**
- Create: `supabase/migrations/20260805000001_handle_new_user_oauth_invite.sql`
- Create: `tests/handle-new-user-oauth-invite.test.ts`
- Modify: `vitest.config.mts:76-79,93-96` (add the new test to both the `unit` project's `exclude` and the `db-integration` project's `include`)

**Interfaces:**
- Consumes: `public.workspace_invites`, `public.profiles`, `public.workspaces`, `public.seed_workspace_starters(uuid)`, `public.slugify_workspace_name(text)` (all existing).
- Produces: `handle_new_user()` trigger — same signature, new behavior. Nothing outside this migration calls it directly (it's an `after insert on auth.users` trigger), so no other task's interface changes.

This is a genuine TDD red/green cycle: the test is written and run against **today's** `handle_new_user` first (it fails, because the OAuth fallback doesn't exist yet), then the migration is written to make it pass.

- [ ] **Step 1: Add the new test file to `vitest.config.mts`**

Edit `vitest.config.mts`. In the `unit` project's `exclude` array (around line 76), add the new path:

```ts
          exclude: [
            "node_modules/**",
            "dist/**",
            ".next/**",
            ".output/**",
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
          ],
```

In the `db-integration` project's `include` array (around line 93), add it too:

```ts
          include: [
            "lib/channel-connections.test.ts",
            "lib/zalo-oauth-refresh.test.ts",
            "tests/handle-new-user-oauth-invite.test.ts",
          ],
```

(Without both edits the test would run twice — once under `unit` with a mocked, empty admin client where it would fail for the wrong reason, and once under `db-integration` for real.)

- [ ] **Step 2: Write the failing test**

Create `tests/handle-new-user-oauth-invite.test.ts`:

```ts
/**
 * handle_new_user's OAuth invite email-fallback. Runs against local Postgres
 * (`npx supabase start`) via the Admin API's createUser — this is the only
 * way to fire the auth.users trigger for real without a live Google OAuth
 * round trip. Skipped when no database is reachable.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

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

async function createOAuthUser(email: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: "Test Google User" },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  createdUserIds.push(data.user.id);
  return data.user.id;
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
```

- [ ] **Step 3: Run the test to verify it fails**

Prereq: `npx supabase start` (if not already running).

Run: `npx vitest run tests/handle-new-user-oauth-invite.test.ts`
Expected: FAIL on the first test — `profile?.workspace_id` is a freshly-created throwaway workspace, not `invitedWorkspaceId` (today's `handle_new_user` has no email fallback, so the Google signup takes the owner path). The other two tests pass already (they describe today's behavior).

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260805000001_handle_new_user_oauth_invite.sql`:

```sql
-- Google OAuth invite fallback.
--
-- handle_new_user only recognized invite_token in raw_user_meta_data. Google
-- (and any other OAuth provider) can't carry that — Supabase fills
-- raw_user_meta_data from the provider's own claims (name/email/picture),
-- not from our signInWithOAuth call. Without this, a brand-new OAuth signup
-- via an invite link always took the owner path and got its own throwaway
-- workspace instead of joining the invited one.
--
-- Fix: for OAuth signups only (raw_app_meta_data->>'provider' <> 'email'),
-- fall back to looking up a pending invite by the verified new.email.
-- Password signups are unaffected — they already pass invite_token
-- explicitly via signUp()'s `data` option (app/auth/actions.ts signUp()).
--
-- accept_workspace_invite() is intentionally NOT touched — see
-- 20260726000001_workspace_invites_hardening.sql ("never delete the
-- caller's existing workspace"). This migration avoids ever creating the
-- throwaway workspace in the first place, instead of reassigning it after
-- the fact.

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

  -- Explicit invite_token (password signup with ?invite=... already in the form).
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

    update public.workspace_invites
    set accepted_at = now()
    where id = inv.id;

    return new;
  end if;

  -- OAuth fallback: no invite_token metadata possible, so match by email instead.
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

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Invite token (explicit, or matched by email for OAuth signups) → staff joins existing workspace; else create an owner workspace (race-safe slug) and call seed_workspace_starters().';
```

- [ ] **Step 5: Apply the migration**

Run: `npx supabase db reset`
Expected: succeeds (applies every migration + `seed.sql` from scratch — this is also the standard "did I break an earlier migration" check).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/handle-new-user-oauth-invite.test.ts`
Expected: PASS, 3/3 tests.

- [ ] **Step 7: Full test suite + typecheck (regression check)**

Run: `npm run typecheck && npm test`
Expected: no new failures. (`npm test` runs the full Vitest suite, `unit` project by default plus `db-integration` since Supabase is up.)

- [ ] **Step 8: `graphify update .` and commit**

```bash
graphify update .
git add supabase/migrations/20260805000001_handle_new_user_oauth_invite.sql tests/handle-new-user-oauth-invite.test.ts vitest.config.mts
git commit -m "feat(auth): handle_new_user joins OAuth signups to a pending invite by email"
```

---

### Task 6: `signInWithGoogle` server action

**Files:**
- Modify: `app/auth/actions.ts`

**Interfaces:**
- Consumes: `createGoogleInviteState`, `GOOGLE_INVITE_STATE_COOKIE` (Task 3); `AUTH_ERROR_CODE.OAUTH_FAILED` (Task 4); `ROUTES.LOGIN`, `ROUTES.DASHBOARD`, `ROUTES.AUTH_CALLBACK` (existing `lib/routes.ts`).
- Produces: `signInWithGoogle(formData: FormData): Promise<void>` — a server action usable as a `<form action={...}>` target. Consumed by Task 9's `GoogleSignInButton`.

- [ ] **Step 1: Add imports and the action**

Edit `app/auth/actions.ts`. Add to the top imports (after the existing `import { createClient } from "@/lib/supabase/server";` line):

```ts
import { cookies } from "next/headers";
import {
  createGoogleInviteState,
  GOOGLE_INVITE_STATE_COOKIE,
} from "@/lib/google-invite-state";
```

Add the new action at the end of the file (after `signOut`):

```ts
export async function signInWithGoogle(formData: FormData) {
  const rawNext = String(formData.get("next") ?? ROUTES.DASHBOARD);
  const safeNext =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : ROUTES.DASHBOARD;
  const inviteToken = String(formData.get("inviteToken") ?? "").trim();

  if (inviteToken) {
    const { token } = createGoogleInviteState(inviteToken, safeNext);
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_INVITE_STATE_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60,
    });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}${ROUTES.AUTH_CALLBACK}?next=${encodeURIComponent(safeNext)}`,
    },
  });

  if (error || !data?.url) {
    redirect(`${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_FAILED}`);
  }

  redirect(data.url);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (`AUTH_ERROR_CODE` is already imported at the top of this file.)

- [ ] **Step 3: `graphify update .` and commit**

```bash
graphify update .
git add app/auth/actions.ts
git commit -m "feat(auth): add signInWithGoogle server action"
```

---

### Task 7: `app/auth/callback/route.ts` — invite-state handling + error redirects

**Files:**
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `GOOGLE_INVITE_STATE_COOKIE`, `parseGoogleInviteState` (Task 3); `AUTH_ERROR_CODE.OAUTH_FAILED` / `OAUTH_INVITE_INVALID` (Task 4); existing `accept_workspace_invite` RPC (unmodified).
- Produces: same `GET` route, now also handling Google's redirect and staff-invite completion. Consumed by: Google (via the `redirectTo` set in Task 6), and the existing password-reset flow (`app/auth/actions.ts` `forgotPassword`, unaffected — see Step 1 note).

- [ ] **Step 1: Rewrite the route**

Replace the full contents of `app/auth/callback/route.ts`:

```ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_ERROR_CODE } from "@/lib/errors";
import {
  GOOGLE_INVITE_STATE_COOKIE,
  parseGoogleInviteState,
} from "@/lib/google-invite-state";
import { ROUTES } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? ROUTES.DASHBOARD;
  // Same guard as signIn/signOut; also reject protocol-relative "//evil.com".
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : ROUTES.DASHBOARD;

  const cookieStore = await cookies();
  const inviteStateCookie = cookieStore.get(GOOGLE_INVITE_STATE_COOKIE)?.value;
  // Single-use: clear immediately, regardless of outcome.
  cookieStore.set(GOOGLE_INVITE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  if (!code) {
    return NextResponse.redirect(
      `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_FAILED}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_FAILED}`,
    );
  }

  if (inviteStateCookie) {
    const state = parseGoogleInviteState(inviteStateCookie);
    if (state) {
      const { data, error: rpcError } = await supabase.rpc(
        "accept_workspace_invite",
        { p_token: state.inviteToken },
      );
      const row = rpcError
        ? null
        : (data as { ok?: boolean; error?: string } | null);
      const rpcSucceeded = row?.ok === true;
      // handle_new_user (Task 5) already joined a brand-new Google signup to
      // the invited workspace — this RPC call is a confirmation pass for the
      // returning-user case. "already_member" means the trigger did its job;
      // that is success here, not an error to surface.
      const alreadyJoinedByTrigger =
        !rpcSucceeded && row?.error === "already_member";

      if (!rpcSucceeded && !alreadyJoinedByTrigger) {
        return NextResponse.redirect(
          `${origin}${ROUTES.LOGIN}?error=${AUTH_ERROR_CODE.OAUTH_INVITE_INVALID}`,
        );
      }

      return NextResponse.redirect(`${origin}${state.next}`);
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
```

Note: the existing password-reset flow (`forgotPassword` in `app/auth/actions.ts`) also redirects through this same route with `?next=/reset-password` and no invite cookie — `inviteStateCookie` will be `undefined` for it, so it falls straight through to the final `return NextResponse.redirect(...)`, identical to today's behavior. Nothing about that flow changes.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: `graphify update .` and commit**

```bash
graphify update .
git add app/auth/callback/route.ts
git commit -m "feat(auth): handle Google invite-state and error redirects in /auth/callback"
```

---

### Task 8: `/login` reads and shows `?error=`

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/login/login-form.tsx`

**Interfaces:**
- Consumes: `authErrorMessage`, `AUTH_ERROR_CODE` (existing, plus Task 4's new codes).
- Produces: `LoginForm` gains an optional `initialError?: string` prop. No other task consumes this directly, but it closes the pre-existing gap where `app/api/cal/oauth/callback/route.ts` and `app/api/messenger/oauth/callback/route.ts` already redirect to `/login?error=...` and nothing ever displayed it.

- [ ] **Step 1: `app/login/page.tsx` — read and map the error**

Replace the full contents:

```tsx
import Link from "next/link";
import { AuthShell } from "@/app/_components/auth-shell";
import { AUTH_ERROR_CODE, authErrorMessage, type AuthErrorCode } from "@/lib/errors";
import { LoginForm } from "./login-form";

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return (Object.values(AUTH_ERROR_CODE) as string[]).includes(value);
}

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") ? params.next : "/dashboard";
  const initialError = params.error
    ? authErrorMessage(
        isAuthErrorCode(params.error)
          ? params.error
          : AUTH_ERROR_CODE.SIGN_IN_FAILED,
      )
    : undefined;

  return (
    <AuthShell
      description={
        <>
          Manage bookings and leads. Patients can use the{" "}
          <Link className="text-white underline-offset-4 hover:underline" href="/chat">
            public chat
          </Link>
          .
        </>
      }
      footer={
        <Link className="transition hover:text-white" href="/">
          ← Back to home
        </Link>
      }
      mode="login"
      title="Welcome back"
    >
      <LoginForm initialError={initialError} nextPath={nextPath} />
    </AuthShell>
  );
}
```

- [ ] **Step 2: `app/login/login-form.tsx` — accept and show `initialError`**

Change the component signature and the error render. Replace:

```tsx
export function LoginForm({ nextPath }: { readonly nextPath: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
```

with:

```tsx
export function LoginForm({
  nextPath,
  initialError,
}: {
  readonly nextPath: string;
  readonly initialError?: string;
}) {
  const [state, action, pending] = useActionState(signIn, initial);
  const errorMessage = state.error ?? initialError;
```

Replace:

```tsx
      {state.error ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
```

with:

```tsx
      {errorMessage ? (
        <p
          className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run the dev server (`npm run dev`), navigate to `http://localhost:3000/login?error=oauth_failed`.
Expected: the red alert box shows "Could not sign in with Google. Try again." above the form fields.

Navigate to `http://localhost:3000/login?error=some_garbage_code`.
Expected: falls back to the generic `SIGN_IN_FAILED` message ("Could not sign in. Check your email and password, then try again.") — never crashes, never shows a raw code.

- [ ] **Step 5: `npm run doctor`, `graphify update .`, commit**

```bash
npm run doctor
graphify update .
git add app/login/page.tsx app/login/login-form.tsx
git commit -m "feat(auth): render OAuth error messages on /login"
```

---

### Task 9: `GoogleSignInButton` — shared component, wired into both forms

**Files:**
- Create: `components/auth/google-signin-button.tsx`
- Modify: `app/login/login-form.tsx`
- Modify: `app/login/signup-form.tsx`

**Interfaces:**
- Consumes: `signInWithGoogle` (Task 6).
- Produces: `GoogleSignInButton({ nextPath, inviteToken }: { nextPath: string; inviteToken?: string | null })` — a Server Component (no client state needed; the `<form action={...}>` itself handles the request).

- [ ] **Step 1: Create the button**

Create `components/auth/google-signin-button.tsx`:

```tsx
import { signInWithGoogle } from "@/app/auth/actions";

function GoogleGlyph() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
        fill="#4285F4"
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11C3.25 21.3 7.31 24 12 24z"
        fill="#34A853"
      />
      <path
        d="M5.27 14.27a7.2 7.2 0 010-4.54V6.62H1.27a12 12 0 000 10.76l4-3.11z"
        fill="#FBBC05"
      />
      <path
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  nextPath,
  inviteToken,
}: {
  readonly nextPath: string;
  readonly inviteToken?: string | null;
}) {
  return (
    <form action={signInWithGoogle}>
      <input name="next" type="hidden" value={nextPath} />
      {inviteToken ? (
        <input name="inviteToken" type="hidden" value={inviteToken} />
      ) : null}
      <button
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
        type="submit"
      >
        <GoogleGlyph />
        Continue with Google
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Wire into `login-form.tsx`**

Add the import (with the other `@/` imports):

```tsx
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
```

Insert `<GoogleSignInButton nextPath={nextPath} />` right after the closing `</RainbowButton>` and before the `<div className="relative py-1">` (the "or" divider):

```tsx
      <RainbowButton
        className={cn("mt-1 h-11 w-full rounded-full font-semibold", pending && "opacity-70")}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in to dashboard"}
      </RainbowButton>

      <GoogleSignInButton nextPath={nextPath} />

      <div className="relative py-1">
```

- [ ] **Step 3: Wire into `signup-form.tsx`**

Add the same import. This form has no existing "or" divider — add one (copied from `login-form.tsx` for visual consistency between the two forms) plus the button, right after the closing `</RainbowButton>` and before the terms paragraph:

```tsx
      <RainbowButton
        className={cn(
          "mt-1 h-11 w-full rounded-full font-semibold",
          pending && "opacity-70",
        )}
        disabled={pending}
        size="lg"
        type="submit"
      >
        {pending
          ? joining
            ? "Joining…"
            : "Creating…"
          : joining
            ? "Create account & join"
            : "Create account"}
      </RainbowButton>

      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-950 px-3 tracking-[0.14em] text-zinc-600">or</span>
        </div>
      </div>

      <GoogleSignInButton
        inviteToken={joining ? inviteToken!.trim() : undefined}
        nextPath={ROUTES.DASHBOARD}
      />

      <p className="text-center text-xs leading-relaxed text-zinc-600">
```

`ROUTES` is already imported in this file (`import { ROUTES, inviteRoute } from "@/lib/routes";`).

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Manual visual check**

`npm run dev` → open `/login` and `/signup` (and `/signup?invite=anything` to see the invite-joining copy path). Confirm the Google button renders with the icon, in the right position, and doesn't overlap/break layout at mobile width (resize browser or devtools to ~375px).

- [ ] **Step 6: `npm run doctor`, `graphify update .`, commit**

```bash
npm run doctor
graphify update .
git add components/auth/google-signin-button.tsx app/login/login-form.tsx app/login/signup-form.tsx
git commit -m "feat(auth): add Continue with Google to login and signup forms"
```

---

### Task 10: Manual end-to-end test — Google OAuth (local)

**Files:** none (verification only).

**Interfaces:** exercises Tasks 1–9 together.

- [ ] **Step 1: Confirm prerequisites**

- `npx supabase start` is running with Task 2's Google provider config applied.
- `.env.local` has real `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`.
- `npm run dev` is running.
- Two real Google accounts available: **Account A** must not have signed into this app before (stays "brand-new" for this test); **Account B** should already have an Eve account (sign up with it via password first if needed).

- [ ] **Step 2: Brand-new signup, no invite**

Go to `http://localhost:3000/signup` → "Continue with Google" → sign in with Account A.
Expected: redirected to `/dashboard/setup`, a new workspace exists (owner role) — same outcome as email signup. Check `profiles`/`workspaces` in Supabase Studio if needed.

- [ ] **Step 3: Returning user, no invite**

Sign out. Go to `/login` → "Continue with Google" → Account A again.
Expected: lands on `/dashboard` (or `/dashboard/setup` if setup wasn't finished in Step 2) — no new workspace created, no duplicate profile.

- [ ] **Step 4: Staff invite, brand-new Google account**

As Account B (already has a workspace), go to Dashboard → Settings → invite a **new** email address you haven't used with Google before (Account C — can be a Gmail alias like `yourname+testc@gmail.com` if Google allows sign-in with it, or a third real test account) as staff. Copy the invite link, or open `/invite/[token]` directly.

Click "Create account & join" → "Continue with Google" → sign in with the new address.
Expected: lands in Account B's workspace as staff. Verify in Supabase Studio: exactly the invited workspace exists for this test — no orphan workspace named after Account C.

- [ ] **Step 5: Staff invite, existing Google account with a real workspace**

Invite Account A's email (which already owns its own set-up workspace from Step 2) to Account B's workspace as staff.
Go to `/invite/[token]` → "Already have an account? Sign in" → "Continue with Google" → Account A.
Expected: redirected to `/login?error=oauth_invite_invalid`, visible red alert message, and Account A is still signed into its own workspace (not silently moved).

- [ ] **Step 6: Expired/cancelled paths**

- Start the Google flow from `/login` and click "Cancel" on Google's consent screen (or deny access).
  Expected: redirected to `/login?error=oauth_failed` with a visible message, no crash.
- In Supabase Studio, manually expire an invite (`update workspace_invites set expires_at = now() - interval '1 day' where token = '...'`), then repeat Step 4 with a fresh Google account against that invite.
  Expected: `handle_new_user`'s fallback finds nothing (expired) → falls through to owner path → new account gets its own workspace, no exception, no stuck state.

- [ ] **Step 7: Record results**

If all six checks pass, this task is done — no code changes expected here, only verification. If something fails, go back to the relevant task (5, 6, or 7) and fix before continuing.

---

### Task 11: Production Supabase Dashboard — enable Google provider

**Files:** none (manual, external).

**Interfaces:** none — this is the production counterpart of Task 2.

- [ ] **Step 1: Register the production redirect URI**

In Google Cloud Console (Task 1's OAuth client), add the production redirect URI if not already present:
```
https://<your-production-project-ref>.supabase.co/auth/v1/callback
```

- [ ] **Step 2: Enable the provider in Supabase Dashboard**

Supabase Dashboard → your production project → Authentication → Providers → Google → toggle **Enabled**, paste the Client ID and Client Secret from Task 1.

- [ ] **Step 3: Set production env vars**

In the Vercel project settings (or wherever production env vars are managed for this app — see `.claude/skills/deploy-vercel`), no new app env vars are needed for this specifically (the Google credentials live in Supabase's own config, not this app's env) — but confirm `NEXT_PUBLIC_SITE_URL` is set correctly in production, since `signInWithGoogle` (Task 6) uses it to build `redirectTo`.

- [ ] **Step 4: Smoke test against the deployed app**

After the next deploy, repeat Task 10 Step 2 and Step 3 against the production URL.

---

### Task 12: `list_my_pending_invites()` RPC

**Files:**
- Create: `supabase/migrations/20260805000002_list_my_pending_invites.sql`

**Interfaces:**
- Consumes: `public.workspace_invites`, `public.workspaces`, `public.profiles`, `auth.users` (all existing).
- Produces: RPC `list_my_pending_invites() returns table (token text, workspace_name text, inviter_name text, expires_at timestamptz)`. Consumed by Task 13.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260805000002_list_my_pending_invites.sql`:

```sql
-- Pending-invite lookup by the caller's own verified email — lets an
-- existing user see (and accept) an invite without needing the emailed
-- link, mirroring get_workspace_invite_preview's security-definer pattern.
-- Does not touch accept_workspace_invite.

create or replace function public.list_my_pending_invites()
returns table (
  token text,
  workspace_name text,
  inviter_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  user_email text;
begin
  if uid is null then
    return;
  end if;

  select email into user_email from auth.users where id = uid;
  if user_email is null then
    return;
  end if;

  return query
  select
    wi.token,
    coalesce(w.name, 'Workspace') as workspace_name,
    nullif(trim(coalesce(p.full_name, p.email, '')), '') as inviter_name,
    wi.expires_at
  from public.workspace_invites wi
  join public.workspaces w on w.id = wi.workspace_id
  left join public.profiles p on p.id = wi.invited_by
  where lower(wi.email) = lower(user_email)
    and wi.accepted_at is null
    and wi.expires_at > now()
  order by wi.created_at desc;
end;
$$;

grant execute on function public.list_my_pending_invites() to authenticated;
```

- [ ] **Step 2: Apply and verify with psql**

Run: `npx supabase db reset`
Expected: succeeds.

Manual SQL check (via Supabase Studio SQL editor or `npx supabase db execute`, replacing the placeholders with real IDs after creating a test workspace/invite/user the same way Task 5's test does):

```sql
select public.list_my_pending_invites();
```
Expected when called with no session (`auth.uid()` is null — e.g. via the `anon` role or a raw SQL editor session): empty result set, no error. Full behavior (real invite → real row) is exercised by Task 13's manual test, since it needs an authenticated session.

- [ ] **Step 3: `graphify update .` and commit**

```bash
graphify update .
git add supabase/migrations/20260805000002_list_my_pending_invites.sql
git commit -m "feat(dashboard): add list_my_pending_invites RPC"
```

---

### Task 13: `getMyPendingInvites()` in `lib/workspace-invites.ts`

**Files:**
- Modify: `lib/workspace-invites.ts`

**Interfaces:**
- Consumes: `list_my_pending_invites()` RPC (Task 12), `createClient()` (existing).
- Produces: `type MyPendingInvite = { token: string; workspaceName: string; inviterName: string | null; expiresAt: string }` and `getMyPendingInvites(): Promise<MyPendingInvite[]>`. Consumed by Task 14.

- [ ] **Step 1: Add the type and function**

Edit `lib/workspace-invites.ts`, add at the end of the file:

```ts
export type MyPendingInvite = {
  token: string;
  workspaceName: string;
  inviterName: string | null;
  expiresAt: string;
};

export async function getMyPendingInvites(): Promise<MyPendingInvite[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_pending_invites");

  if (error) {
    console.error(
      "[workspace-invites] list_my_pending_invites failed",
      error.message,
    );
    return [];
  }

  const rows = (data ?? []) as Array<{
    token: string;
    workspace_name: string;
    inviter_name: string | null;
    expires_at: string;
  }>;

  return rows.map((row) => ({
    token: row.token,
    workspaceName: row.workspace_name,
    inviterName: row.inviter_name,
    expiresAt: row.expires_at,
  }));
}
```

This fails open (empty array) on any RPC error, matching `getInvitePreview`'s tolerance in this same file and the "fire-and-forget safe" philosophy in `lib/notifications-write.ts` — a broken pending-invites lookup should never break the dashboard.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: `graphify update .` and commit**

```bash
graphify update .
git add lib/workspace-invites.ts
git commit -m "feat(dashboard): add getMyPendingInvites()"
```

---

### Task 14: `PendingInviteBanner` + wire into `DashboardShell`

**Files:**
- Create: `components/pending-invite-banner.tsx`
- Modify: `components/dashboard-shell.tsx`

**Interfaces:**
- Consumes: `MyPendingInvite`, `getMyPendingInvites()` (Task 13); `acceptWorkspaceInviteAction(token)` (existing, `app/dashboard/settings/invite-actions.ts`).
- Produces: `PendingInviteBanner({ invites: MyPendingInvite[] })`, rendered from every dashboard page via `DashboardShell` (same integration point as the existing `BookingLiveBanner`).

- [ ] **Step 1: Create the banner**

Create `components/pending-invite-banner.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { IconMailCheck, IconX } from "@tabler/icons-react";
import { acceptWorkspaceInviteAction } from "@/app/dashboard/settings/invite-actions";
import type { MyPendingInvite } from "@/lib/workspace-invites";

export function PendingInviteBanner({
  invites,
}: {
  readonly invites: MyPendingInvite[];
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  const visible = invites.filter((invite) => !dismissed[invite.token]);
  if (visible.length === 0) return null;

  function onAccept(token: string) {
    setErrors((prev) => ({ ...prev, [token]: "" }));
    setAcceptingToken(token);
    startTransition(async () => {
      const result = await acceptWorkspaceInviteAction(token);
      if (result?.error) {
        setErrors((prev) => ({ ...prev, [token]: result.error! }));
      }
      setAcceptingToken(null);
    });
  }

  return (
    <div className="flex flex-col gap-2 border-b border-teal-500/25 bg-teal-500/10 px-4 py-3 lg:px-6">
      {visible.map((invite) => (
        <div
          className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3"
          key={invite.token}
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <IconMailCheck className="mt-0.5 size-5 shrink-0 text-teal-600 dark:text-teal-400" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-teal-950 dark:text-teal-50">
                You&apos;re invited to join {invite.workspaceName}
              </p>
              <p className="text-teal-900/80 dark:text-teal-100/75">
                {invite.inviterName
                  ? `${invite.inviterName} invited you as staff.`
                  : "Invited as staff."}
                {errors[invite.token] ? (
                  <span className="ml-1 text-red-700 dark:text-red-300">
                    {errors[invite.token]}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex h-9 items-center rounded-full bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-teal-950"
              disabled={pending && acceptingToken === invite.token}
              onClick={() => onAccept(invite.token)}
              type="button"
            >
              {pending && acceptingToken === invite.token ? "Joining…" : "Accept"}
            </button>
            <button
              aria-label="Dismiss"
              className="inline-flex size-9 items-center justify-center rounded-full text-teal-900/60 hover:bg-teal-500/15 hover:text-teal-950 dark:text-teal-100/60 dark:hover:text-teal-50"
              onClick={() =>
                setDismissed((prev) => ({ ...prev, [invite.token]: true }))
              }
              type="button"
            >
              <IconX className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

`acceptWorkspaceInviteAction` redirects to `DASHBOARD_PATH.root` on success (throws `NEXT_REDIRECT`) — same call, same behavior already used by `app/_components/invite-accept-panel.tsx`'s `onAccept`.

- [ ] **Step 2: Wire into `DashboardShell`**

Edit `components/dashboard-shell.tsx`. Add imports:

```tsx
import { PendingInviteBanner } from "@/components/pending-invite-banner";
import { getMyPendingInvites } from "@/lib/workspace-invites";
```

Replace the body of `DashboardShell` to fetch both banners' data in parallel (per `.claude/rules/vercel-react-conventions.md`'s `async-parallel` rule) and render the new banner next to the existing one:

```tsx
export async function DashboardShell({
  user,
  title,
  bookingPagePath,
  workspaceId,
  children,
}: {
  user: DashboardNavUser;
  title: string;
  bookingPagePath?: string | null;
  workspaceId?: string | null;
  children: ReactNode;
}) {
  const [bookingLive, pendingInvites] = await Promise.all([
    workspaceId ? isWorkspaceBookingLive(workspaceId) : Promise.resolve(true),
    getMyPendingInvites(),
  ]);

  return (
    <DashboardCommandProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as CSSProperties
        }
      >
        <DashboardShellChrome
          bookingPagePath={bookingPagePath}
          title={title}
          user={user}
        >
          {!bookingLive ? <BookingLiveBanner /> : null}
          {pendingInvites.length > 0 ? (
            <PendingInviteBanner invites={pendingInvites} />
          ) : null}
          {children}
        </DashboardShellChrome>
      </SidebarProvider>
    </DashboardCommandProvider>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: `npm run doctor`, `graphify update .`, commit**

```bash
npm run doctor
graphify update .
git add components/pending-invite-banner.tsx components/dashboard-shell.tsx
git commit -m "feat(dashboard): show pending-invite banner for existing users"
```

---

### Task 15: Manual end-to-end test — pending-invite banner, then final cleanup

**Files:** none (verification only).

**Interfaces:** exercises Tasks 12–14.

- [ ] **Step 1: No invite → no banner**

As any logged-in dashboard user with no pending invites, load any dashboard page.
Expected: no banner, no console error.

- [ ] **Step 2: Invite to an account with no/incomplete workspace**

Using two test accounts: Account D (has signed up but never finished `/dashboard/setup`) and Account E (owns a set-up workspace). From Account E, invite Account D's email as staff (Dashboard → Settings). Log in as Account D, load `/dashboard`.
Expected: banner shows "You're invited to join `<E's workspace>`". Click Accept.
Expected: redirected into E's workspace as staff, banner gone, `workspace_invites.accepted_at` set (check in Supabase Studio if needed).

- [ ] **Step 3: Invite to an account with a real, set-up workspace**

From Account E, invite Account A's email (from Task 10 — already owns a fully set-up workspace) as staff. Log in as Account A, load `/dashboard`.
Expected: banner still shows the invite. Click Accept.
Expected: the existing "This account already belongs to another workspace." message (`INVITE_ALREADY_IN_WORKSPACE`) appears inline under that invite row — Account A stays in its own workspace, nothing is silently joined or broken.

- [ ] **Step 4: Dismiss is session-only**

With a visible pending invite, click the X to dismiss it.
Expected: banner disappears immediately. Reload the page (full navigation, not client nav).
Expected: banner reappears (this is intentional — see the spec's "Design" note; dismiss is not persisted).

- [ ] **Step 5: Two pending invites**

Have two different workspaces invite the same test account. Load `/dashboard` as that account.
Expected: both invites show as separate rows; accepting one leaves the other visible.

- [ ] **Step 6: Full regression pass**

```bash
npm run typecheck
npm test
npm run doctor:full
```
Expected: no failures introduced by this plan. (`doctor:full` is heavier than the per-task `npm run doctor` — run it once at the end as a final check across every touched component.)

- [ ] **Step 7: Final `graphify update .`**

```bash
graphify update .
git status
```
Expected: working tree clean (everything already committed per-task) other than the graphify output diff, which follows this repo's existing convention of being committed separately/left as-is per `.claude/rules/graphify.md`.
