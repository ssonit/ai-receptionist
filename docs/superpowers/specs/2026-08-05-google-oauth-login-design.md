# Google OAuth login/signup

**Date:** 2026-08-05
**Status:** Design approved in conversation — ready for implementation plan
**Scope:** Add "Continue with Google" to `/login` and `/signup` (including the staff-invite path reached via `/invite/[token]` → `/signup?invite=TOKEN` / `/login?next=…`), using Supabase Auth's built-in Google provider. Configure both local (`supabase/config.toml`) and production (Supabase Dashboard) providers. Also add an in-app pending-invite banner on the dashboard so an existing user with a matching-email invite doesn't need the emailed link to accept it.

## Goal

Today the only sign-in method is email + password (`app/auth/actions.ts` `signIn`/`signUp`, backed by `supabase.auth.signInWithPassword` / `signUp`). Add Google as a second sign-in method without introducing a parallel auth system: reuse Supabase's OAuth handshake, the existing `/auth/callback` route, and the existing `handle_new_user` trigger (owner-workspace creation) and `accept_workspace_invite` RPC (staff-invite join).

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| OAuth mechanism | Supabase Auth built-in provider (`supabase.auth.signInWithOAuth({ provider: "google" })`), not a hand-rolled Google Identity Services + token-verification path |
| Where the button appears | `login-form.tsx` and `signup-form.tsx` (covers `/login`, `/signup`, and the invite flow, since `invite-accept-panel.tsx` links into those two routes) — not `invite-accept-panel.tsx` itself |
| New-user workspace creation | No change to `handle_new_user` — Google populates `raw_user_meta_data.full_name`/`email`, which the existing trigger already reads |
| Staff invite carry-through | A signed, short-lived state cookie (same HMAC pattern as `lib/cal-oauth-state.ts`) carries `inviteToken` + `next` across the redirect to Google and back, since `signInWithOAuth` cannot attach custom `data` to the created user the way `signUp()` can |
| Invite acceptance for a brand-new Google user | **Correction from the first draft of this spec, made before implementation started (see "Design correction" below):** `handle_new_user` gains an email-based invite fallback for OAuth signups, so it joins the invited workspace directly — no throwaway workspace is ever created, and `accept_workspace_invite` (and its recent hardening) stays untouched |
| Error surfacing | Extend `AUTH_ERROR_CODE`/`AUTH_ERROR_MESSAGE`; redirect failures to `/login?error=<code>` (same convention as `app/api/cal/oauth/callback/route.ts` and `app/api/messenger/oauth/callback/route.ts`) |
| Known gap fixed as part of this work | `app/login/page.tsx` currently never reads `?error=` — Cal/Messenger OAuth callbacks already redirect there but the page silently drops it. Since this feature is the first *user-facing* auth flow to depend on that redirect working, wire it up (small, directly required for this feature to be usable) |
| i18n | Hardcoded English strings, matching the existing (non-localized) `login-form.tsx`/`signup-form.tsx` — these files are outside `.claude/rules/i18n.md`'s scope (`app/dashboard/**`, guest chat), so no new i18n scaffolding introduced here |
| Production config | Documented as a manual Supabase Dashboard step (Authentication → Providers → Google), not automated — no IaC/API for this in the current toolchain |

## Current state (relevant files)

- `app/auth/actions.ts` — `signIn`/`signUp`/`signOut`/`forgotPassword`/`resetPassword` server actions; all use `@/lib/errors` helpers, never raw provider strings.
- `app/auth/callback/route.ts` — already does `supabase.auth.exchangeCodeForSession(code)` then redirects to `next` or `/login`. This is the correct landing point for Google's redirect too; Supabase multiplexes all providers through the same `code` exchange.
- `app/login/login-form.tsx`, `app/login/signup-form.tsx` — client components, `useActionState` + server action, dark-theme styling (`border-white/10 bg-white/[0.03]` for secondary buttons, an existing "or" divider between the primary form and the secondary "Continue in public chat" link).
- `app/login/page.tsx` — reads `next` from `searchParams`; does **not** currently read `error`.
- `lib/supabase/server.ts` / `lib/supabase/client.ts` — standard `@supabase/ssr` wrappers, no changes needed.
- `proxy.ts` — redirects unauthenticated users off `/dashboard`, and authenticated users off `/login`/`/signup`; unaffected by this change (works the same regardless of which provider created the session).
- `supabase/config.toml` — has `[auth.external.apple]` (disabled) as a template; no `[auth.external.google]` block yet.
- `handle_new_user()` was rewritten three times after it was first added (`20260724000008_workspace_invites.sql` → `20260730000001_neutralize_workspace_starter_defaults.sql` → `20260730000003_signup_hardening.sql`, which is the **current** definition — starter-content seeding was extracted into `seed_workspace_starters()`, slug allocation is race-safe). It still branches only on `raw_user_meta_data->>'invite_token'`: present → join that workspace as staff, no new workspace created; absent → create an owner workspace. Google OAuth can never populate `invite_token` (Supabase fills `raw_user_meta_data` from Google's own claims), so today it would always take the owner-workspace path even when the user came from an invite link.
- `accept_workspace_invite(p_token)` was also rewritten after its original version (`20260724000008_workspace_invites.sql` → **current**: `20260726000001_workspace_invites_hardening.sql`, "Signup hardening ... Bug 4: Never delete the caller's existing workspace"). The current version **refuses** to reassign a user who already has *any* `profiles.workspace_id` — including a just-created, empty, never-set-up one — returning `already_in_workspace`. It no longer deletes/replaces an orphan workspace the way the very first version did. Any design relying on that old self-healing behavior is wrong against the current schema.
- `app/_components/invite-accept-panel.tsx` — links unauthenticated visitors to `/signup?invite=TOKEN` and `/login?next=/invite/TOKEN`; both routes render the forms this design touches, so the invite flow is covered without editing this file.
- `lib/cal-oauth-state.ts` — canonical pattern in this codebase for a signed, HMAC-SHA256, short-lived (10 min), httpOnly state cookie surviving a third-party OAuth round trip (used today for Cal.com and Zalo connects). This design reuses the same approach for the Google invite carry-through rather than inventing a new unsigned-cookie mechanism.
- `lib/errors/auth-codes.ts` / `lib/errors/auth-messages.ts` — `AUTH_ERROR_CODE` + `AUTH_ERROR_MESSAGE` const maps, `authErrorMessage()` accessor.
- `app/api/cal/oauth/callback/route.ts`, `app/api/messenger/oauth/callback/route.ts` — existing convention: on failure, `NextResponse.redirect(new URL(\`/login?error=${code}\`, request.url))`.

## Architecture / data flow

```text
Owner/staff, no invite — /login or /signup
  → click "Continue with Google" (form submit → signInWithGoogle server action)
  → supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: origin + /auth/callback?next=... } })
  → redirect(data.url)                                  # → accounts.google.com consent
  → Google redirects back to Supabase's own /auth/v1/callback (config'd in Google Console)
  → Supabase redirects to our redirectTo: /auth/callback?code=...&next=...
  → app/auth/callback/route.ts: exchangeCodeForSession(code)
      - new user  → handle_new_user() already fired during the code exchange's user insert
                    (no invite_token in raw_user_meta_data → owner path → new workspace)
      - existing user → session resumes, no trigger fires
  → redirect to `next` (default /dashboard) — for a brand-new owner this lands on
    /dashboard, but proxy.ts already bounces any owner whose workspace has no
    setup_completed_at over to /dashboard/setup, so the outcome matches today's
    email-signup redirect (DASHBOARD_SETUP) without signInWithGoogle needing to
    know that rule itself

Staff invite, BRAND-NEW Google account — /invite/[token] → "Create account & join" → /signup?invite=TOKEN
  → click "Continue with Google" (inviteToken hidden field set)
  → signInWithGoogle server action: sign a state cookie { inviteToken, next, nonce, exp }
    via the same HMAC pattern as lib/cal-oauth-state.ts, write httpOnly cookie
  → supabase.auth.signInWithOAuth(...) → redirect(data.url) → Google → Supabase → /auth/callback
  → exchangeCodeForSession(code) → new auth.users row inserted → handle_new_user() fires:
      - invite_token metadata is absent (Google can't carry it), but the signup is OAuth
        (raw_app_meta_data->>'provider' <> 'email') → new email-based fallback looks up
        workspace_invites where lower(email) = lower(new.email), unaccepted, unexpired
      - found → takes the SAME invite path as an explicit token: profile is created with
        workspace_id = inv.workspace_id, role = inv.role, invite marked accepted_at = now()
      - NOT found (e.g. no such invite, or the cookie's inviteToken doesn't match this email)
        → falls through to the normal owner path, unchanged
  → callback route reads + verifies the signed invite-state cookie; if present, calls
    supabase.rpc("accept_workspace_invite", { p_token: inviteToken }) as a confirmation pass
      - already joined by the trigger above → RPC returns ok:false, error:"already_member"
        → callback treats this as SUCCESS (not shown as an error — the user is exactly
        where they should be), same RPC/behavior used by the manual /invite/[token] flow today
      - RPC returns a real ok:false (expired/already-accepted/email-mismatch/not-found) →
        surface via AUTH_ERROR_CODE, redirect to /login?error=<code>
  → clear the invite-state cookie (single-use, same as OAUTH_STATE_COOKIE)
  → redirect to next (the invite route or dashboard)

Staff invite, EXISTING Google-linked account (or any existing account with no workspace,
e.g. a removed staff member) — same entry points
  → click "Continue with Google" → same signed cookie set
  → exchangeCodeForSession(code) → no auth.users insert, handle_new_user() does not fire
  → callback route reads the invite-state cookie → supabase.rpc("accept_workspace_invite", ...)
      - profiles.workspace_id is null (or already inv.workspace_id) → RPC joins/no-ops per its
        existing, unmodified rules — this design does not change accept_workspace_invite at all
      - profiles.workspace_id points at a different, real workspace → RPC returns
        ok:false, error:"already_in_workspace" (existing, unmodified behavior) → surfaced via
        AUTH_ERROR_CODE, same as the manual /invite/[token] flow already does today

Failure at any step (Google denies consent, code exchange fails, invite RPC fails)
  → redirect to /login?error=<code>
  → app/login/page.tsx reads searchParams.error, maps via authErrorMessage(), renders the
    existing red alert box (same look as the inline form error already used by LoginForm)
```

## Module map

| Path | Change |
|------|--------|
| `supabase/config.toml` | New `[auth.external.google]` block: `enabled = true`, `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` |
| `.env.example` | New `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=` / `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=` with a comment linking to Google Cloud Console + the two redirect URIs to register |
| `supabase/migrations/<new>.sql` | Redefine `handle_new_user()` (full `create or replace`, copied from the current `20260730000003_signup_hardening.sql` body): add an `elsif` branch — when `invite_token` metadata is absent **and** `coalesce(new.raw_app_meta_data->>'provider','') <> 'email'` (i.e. an OAuth signup) — look up `workspace_invites` by `lower(email) = lower(new.email)`, `accepted_at is null`, `expires_at > now()`; if found, take the same invite-join path as the explicit-token branch. Password signups are provider `"email"` and are completely unaffected — this only changes behavior for OAuth. `accept_workspace_invite()` itself is **not modified** |
| `lib/google-invite-state.ts` (new) | Signed state cookie for the invite carry-through, mirroring `lib/cal-oauth-state.ts`: `createGoogleInviteState(inviteToken, next)`, `parseGoogleInviteState(token)`, `GOOGLE_INVITE_STATE_COOKIE` constant. Separate cookie name so a Cal/Zalo connect in another tab can't collide with it |
| `app/auth/actions.ts` | New `signInWithGoogle(formData: FormData)` server action: reads `next`/`inviteToken` hidden fields, sets the signed cookie when `inviteToken` present, calls `supabase.auth.signInWithOAuth(...)`, `redirect(data.url)` |
| `app/auth/callback/route.ts` | After `exchangeCodeForSession`: read + verify `GOOGLE_INVITE_STATE_COOKIE`; if present, call `supabase.rpc("accept_workspace_invite", { p_token })` (existing RPC, unmodified) as a confirmation pass — `ok:false, error:"already_member"` is treated as success (the trigger already joined a brand-new user), any other `ok:false` is a real failure; clear the cookie either way; map failures to `AUTH_ERROR_CODE` and redirect `/login?error=<code>` instead of the current bare `/login` |
| `lib/errors/auth-codes.ts` | New codes: `OAUTH_FAILED`, `OAUTH_INVITE_INVALID` (covers RPC's `expired`/`already_accepted`/`email_mismatch`/`not_found`/`already_in_workspace`) |
| `lib/errors/auth-messages.ts` | Matching copy for the two new codes |
| `components/auth/google-signin-button.tsx` (new) | Client component: `<form action={signInWithGoogle}>` wrapping hidden `next`/`inviteToken` inputs + a styled button (Google "G" inline SVG + "Continue with Google"), reusing the existing secondary-button classes from `login-form.tsx` |
| `app/login/login-form.tsx` | Render `<GoogleSignInButton nextPath={nextPath} />` above the existing "or" divider |
| `app/login/signup-form.tsx` | Render `<GoogleSignInButton nextPath={ROUTES.DASHBOARD} inviteToken={inviteToken} />` in the same position |
| `app/login/page.tsx` | Read `searchParams.error`, map via `authErrorMessage()` (unknown codes → generic `SIGN_IN_FAILED`), pass down to `LoginForm` to render in the same alert box already used for `state.error` |

One migration needed for the `handle_new_user` email-fallback branch above. `accept_workspace_invite` is used as-is, unmodified.

## Design correction (made before implementation, during plan-writing)

The first draft of this spec assumed `accept_workspace_invite` would delete an empty/throwaway workspace and reassign the profile — that was true of the RPC's *original* version (`20260724000008_workspace_invites.sql`) but was deliberately removed in `20260726000001_workspace_invites_hardening.sql` ("Bug 4: Never delete the caller's existing workspace"). Re-adding delete-on-reassign logic to the shared, general-purpose `accept_workspace_invite` — callable by any authenticated user with any token — would undo a considered safety fix.

Instead of patching around the trigger's side effect after the fact, this design fixes the actual root cause: `handle_new_user` only ever created a throwaway workspace in the first place because it didn't know about the invite (Google can't carry `invite_token` in `raw_user_meta_data`). Teaching the trigger to look the invite up by `new.email` for OAuth signups means no throwaway workspace is ever created — so there's nothing to reassign or delete, and `accept_workspace_invite` doesn't need to change at all.

## UX

**Login/Signup forms:** "Continue with Google" button placed above the existing divider (visually: primary email/password form first for muscle-memory parity with today, Google as the prominent secondary option — matches the current "or / Continue in public chat" secondary-link styling, not the `RainbowButton` primary style, so it doesn't compete with the primary CTA).

**Invite flow:** unchanged entry points (`/invite/[token]` → "Create account & join" → `/signup?invite=TOKEN`, or "Already have an account? Sign in" → `/login?next=...`); both now also offer Google. A brand-new staff member is joined directly to the invited workspace by `handle_new_user` in the same request that creates their account — never a throwaway workspace in between. A staff member who already has a Google-linked Eve account (and no conflicting workspace) signs in and is joined via the existing `accept_workspace_invite` RPC, unchanged.

**Errors:** any OAuth failure lands back on `/login` with a visible, non-raw error message in the same alert box style already used for password-flow errors — no silent failures.

## Security / correctness notes

- Invite-state cookie is HMAC-signed (same secret resolution order as `lib/cal-oauth-state.ts`: `WORKSPACE_SECRETS_KEY` → `SUPABASE_SERVICE_ROLE_KEY` → dev fallback), httpOnly, 10-minute TTL, single-use (cleared on read) — cannot be forged or replayed to join an arbitrary workspace.
- `redirectTo` passed to `signInWithOAuth` is always `${NEXT_PUBLIC_SITE_URL}/auth/callback?next=...`, built server-side from an env var, never from user-controlled input — no open-redirect surface there. The `next` query value itself is still validated with the existing `startsWith("/")` + no-`//`-prefix guard already used by `signIn`/callback today.
- `accept_workspace_invite` already enforces its own invariants (token validity, expiry, email match when the invite specifies one, "already in a real workspace" rejection) — the callback route only needs to call it and translate its `ok:false` reasons to `AUTH_ERROR_CODE`, no new authorization logic to write.
- The new `handle_new_user` email-fallback branch reuses the exact same validation the explicit-token branch already has (token existence, `accepted_at is null`, `expires_at > now()`, email match — trivially true since the lookup is keyed by `new.email`) — no new invariant to invent, just a second way to reach the same code path. It is gated to non-`"email"`-provider signups, so the password signup flow's behavior is provably unchanged.
- Google-linked accounts still go through the exact same `proxy.ts` session/role checks as password accounts post-login — provider is irrelevant downstream of `auth.getUser()`.
- Known limitation, not solved here (see Out of scope): if an email/password account and a later Google sign-in share the same email, Supabase's own account-linking rules decide the outcome (link vs. reject) — this app adds no custom linking logic on top.

## Errors

| Code | When |
|------|------|
| `OAUTH_FAILED` (new) | Google denies consent, `exchangeCodeForSession` errors, or `signInWithOAuth` itself errors before redirect |
| `OAUTH_INVITE_INVALID` (new) | `accept_workspace_invite` RPC returns a real `ok:false` (expired / already accepted / email mismatch / not found / already in a different workspace) after a Google sign-in. `error:"already_member"` is **not** an error here — it means `handle_new_user` already joined the user correctly, and the callback treats it as success |
| Existing codes (`INVALID_CREDENTIALS`, etc.) | Unchanged — password flow untouched |

## Testing (acceptance)

1. Local: `[auth.external.google]` configured with real Client ID/Secret in `.env.local`, `npx supabase start` → `/login` and `/signup` both show "Continue with Google"; clicking it reaches Google's consent screen.
2. Brand-new Google account, no invite, via `/signup` → lands on `/dashboard/setup` with a fresh workspace (owner role), same as today's email signup outcome.
3. Existing Google-linked account → `/login` → "Continue with Google" → lands on `/dashboard` (or `next`) directly, no workspace/profile side effects.
4. Fresh invite link (`/invite/TOKEN`) → "Create account & join" → `/signup?invite=TOKEN` → "Continue with Google" with a **brand-new** Google account (no prior Eve account) → `handle_new_user`'s email fallback joins the invited workspace directly as staff; verify via DB that exactly one workspace exists for this flow (the invited one) — no throwaway workspace was ever created.
5. Invite link → "Continue with Google" with an **existing** Google-linked account that already has a different, real workspace (even if empty/not set up) → rejected with `already_in_workspace`, same as the manual `/invite/[token]` flow already does today for that case — this is `accept_workspace_invite`'s existing, unmodified rule, not a regression.
5b. Same as above but the existing account currently has `profiles.workspace_id = null` (e.g. a removed staff member, via `remove_workspace_member`) → `accept_workspace_invite` joins them into the invited workspace normally.
6. Expired or already-accepted invite token + **brand-new** Google account → `handle_new_user`'s fallback lookup finds nothing (or the row is already accepted/expired) → falls through to the normal owner path, account is created with its own workspace, no invite side effect; separately, expired/already-accepted invite + an **existing** account → `accept_workspace_invite` returns the matching error → redirected to `/login?error=oauth_invite_invalid`, visible message shown, user is still signed in.
7. User cancels the Google consent screen → redirected back to `/login?error=oauth_failed`, visible message, no partial state left behind (no dangling invite-state cookie).
8. Production: Google provider enabled in Supabase Dashboard with production redirect URI registered in Google Cloud Console → smoke-test the full flow against the deployed app.
9. `npm run doctor` clean on all changed `.tsx` files; `graphify update .` after implementation.

## Pending-invite prompt for existing users (UX enhancement)

**Ask:** if someone with an existing Eve account gets invited to a workspace, they shouldn't have to dig up the invite email/link and re-authenticate — they should see it in-app the moment they're back, the way GitHub/Linear surface org invites as an in-app prompt tied to the verified account email (not a copy-pasted link).

**Why not extend the `notifications` table:** `notifications` (`lib/notifications-write.ts`, `lib/notifications.ts`) is strictly workspace-scoped — every write requires a `workspaceId`, every read filters `.eq("workspace_id", workspaceId)` for the *caller's own* workspace. An invitee who isn't yet a member of the target workspace has no RLS path to read a notification scoped to it. Adding user-scoped notifications would mean a second notification system — out of proportion to this ask.

**Why not auto-join on invite:** `accept_workspace_invite()` already refuses to move a user out of a workspace that has `setup_completed_at` set or holds real bookings/leads (`already_in_workspace`, existing `APP_ERROR_CODE.INVITE_ALREADY_IN_WORKSPACE`). That's a deliberate guard against silently orphaning a business's data — this design keeps it untouched. "Instant join" only applies where the RPC already allows it: a brand-new/incomplete workspace being replaced by the invited one (same case the Google-invite carry-through above relies on).

**Design:** compute pending invites live from `workspace_invites` by the logged-in user's own verified email, and show them as a dismissible banner on the dashboard — no new table, no notification-system changes.

| Path | Change |
|------|--------|
| `supabase/migrations/<new>.sql` | New RPC `list_my_pending_invites()` — `security definer`, resolves the caller's email the same way `accept_workspace_invite` does (`auth.uid()` → `select email from auth.users where id = uid`, not a JWT claim), then returns `(token, workspace_name, inviter_name, expires_at)` for rows in `workspace_invites` where `lower(email) = lower(user_email)`, `accepted_at is null`, `expires_at > now()`. Mirrors `get_workspace_invite_preview`'s shape/style; scoped to the caller's own email only (no new RLS policy needed — a security-definer RPC is the existing pattern for cross-tenant-safe invite reads in this file) |
| `lib/workspace-invites.ts` | New `getMyPendingInvites()` wrapper calling the RPC (same module that already has `getInvitePreview`, `requireOwnerWorkspace`) |
| `components/pending-invite-banner.tsx` (new) | Client component: one invite per row, "Join `<workspace>` as staff" + Accept/Dismiss. Accept calls the existing `acceptWorkspaceInviteAction(token)` (`app/dashboard/settings/invite-actions.ts`) — same code path the `/invite/[token]` page already uses, so `already_in_workspace`/`expired`/etc. render with their existing messages. Dismiss is session-only (component state, no persistence column — low stakes, reappears next visit, matches the size of this feature) |
| `components/dashboard-shell.tsx` | Same integration point as the existing `BookingLiveBanner` (`{!bookingLive ? <BookingLiveBanner /> : null}`) — `DashboardShell` is already an async Server Component that receives `user: DashboardNavUser` (has `.email`); add `await getMyPendingInvites()` alongside the existing `isWorkspaceBookingLive` call and render `<PendingInviteBanner invites={...} />` next to `BookingLiveBanner`. **Not** `app/dashboard/layout.tsx` — that file is deliberately auth-gate-only (see its own comment) and doesn't render page chrome; `DashboardShell` is what every dashboard page actually calls for chrome/banners |

This also closes the loop with the Google OAuth flow above: an existing user who signs in with Google and lands on `/dashboard` sees the same banner — no special-casing needed, since it's keyed off email/session, not login method.

**Out of scope here too:** letting a user who already owns/staffs a real workspace join a second one (would need multi-workspace membership, a materially bigger data-model change than this request).

**Testing (acceptance):**

1. Owner invites `staff@example.com`; that email has no Eve account yet → no banner appears for anyone (nothing to show — email-only flow, unchanged).
2. Owner invites `staff@example.com`; that email already has an Eve account with an incomplete/no workspace → that user's next `/dashboard` load shows the banner; Accept joins the invited workspace (existing `accept_workspace_invite` behavior), banner clears.
3. Owner invites an email belonging to a user who already owns a fully set-up workspace → banner still shows (invite exists), but Accept surfaces `INVITE_ALREADY_IN_WORKSPACE`'s existing friendly message rather than silently failing or joining.
4. Invite expires or is revoked before the invitee logs in → RPC's `expires_at > now()` / row-deleted filter means it silently stops appearing (no stale banner).
5. User with two pending invites (rare but possible) sees both rows; accepting one leaves the other visible.
6. Dismiss hides the banner for the session; a fresh page load (new server render) shows it again — acceptable per the "session-only, low stakes" decision above.

## Out of scope (v1)

- Custom handling of email/password ↔ Google account linking when the same email is used for both — deferred to Supabase's default behavior; revisit only if it causes a real support issue.
- Other OAuth providers (GitHub, Facebook login for dashboard, etc.) — Google only, per this request.
- Localizing the new button/copy — matches the existing non-localized state of `login-form.tsx`/`signup-form.tsx`.
- Automating the production Supabase Dashboard provider toggle — documented as a manual step.
- Avatar/profile picture ingestion from Google (`raw_user_meta_data.avatar_url` is available but unused) — no product requirement surfaced for it yet.

## Implementation order (high level)

1. Google Cloud Console: OAuth consent screen + Client ID/Secret (manual, produces the two secrets needed below).
2. `supabase/config.toml` + `.env.example`/`.env.local` (local provider config); verify `/auth/v1/callback` reachable locally.
3. Migration: `handle_new_user` email-based invite fallback for OAuth signups.
4. `lib/google-invite-state.ts` (signed cookie helper, mirrors `lib/cal-oauth-state.ts`).
5. `app/auth/actions.ts` `signInWithGoogle`.
6. `app/auth/callback/route.ts`: invite-state read/verify, `accept_workspace_invite` RPC call (treating `already_member` as success), error-code redirects.
7. `lib/errors/auth-codes.ts` + `auth-messages.ts` new codes.
8. `app/login/page.tsx` reads `?error=`; `components/auth/google-signin-button.tsx`; wire into `login-form.tsx` + `signup-form.tsx`.
9. Manual test pass against acceptance criteria above (needs at least two real Google test accounts: one to stay brand-new for the invite test, one pre-existing).
10. Supabase Dashboard (production): enable Google provider, register production redirect URI in Google Cloud Console.
11. `list_my_pending_invites()` RPC + `getMyPendingInvites()` + `PendingInviteBanner` + dashboard layout wiring — independent of 1–10, shares only the existing `accept_workspace_invite` RPC and error codes.
12. `npm run doctor` on changed UI files; `graphify update .`.

Detailed task breakdown belongs in the implementation plan (writing-plans skill), after this spec is approved.
