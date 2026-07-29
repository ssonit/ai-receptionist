# Cal.com Developer OAuth (replace paste API key)

**Date:** 2026-07-29  
**Status:** Design approved in conversation — awaiting spec file review before implementation plan  
**Scope:** Multi-tenant Cal.com auth for real workspaces via Developer OAuth; Eve Pilot unchanged

## Goal

Let workspace owners connect an existing Cal.com cloud account with “Connect Cal.com” (OAuth consent) instead of pasting an API key. Keep agent booking tools and `lib/calcom.ts` on a Bearer token; only the credential source changes.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| OAuth model | Cal.com **Developer OAuth** (connect existing account) — not Platform / managed users |
| Host | **cal.com cloud only** (`app.cal.com` / `api.cal.com`) |
| Client | One Eve confidential OAuth client (env credentials) |
| New tenants | OAuth only (hide paste) |
| Legacy | Existing `cal_api_key_encrypted` keeps working until owner Connects via OAuth |
| UI | Connect/Disconnect in **Setup** and **Settings** |
| Credential shape | Separate OAuth columns + resolver (approach 1) |
| On OAuth success | Clear `cal_api_key_encrypted` (single auth source) |
| On refresh failure | Clear OAuth columns / mode → booking offline; owner must reconnect |
| Pilot `/chat` | Still env `CALCOM_API_KEY` only |

## Current state

- Tenants paste API key in setup wizard → `saveCalApiKeyAction` → `workspaces.cal_api_key_encrypted` (`encryptSecret`).
- Runtime: `getCalApiKeyForWorkspace` → `withCalApiKey` → Cal API v2 Bearer.
- Pilot: env `CALCOM_API_KEY`; never shared with real tenants.

## Architecture

```text
Owner [Connect]
  → GET /api/cal/oauth/start (auth + workspace)
  → signed state cookie (workspaceId, returnTo, nonce, exp)
  → redirect app.cal.com/auth/oauth2/authorize
  → GET /api/cal/oauth/callback?code&state
  → POST api.cal.com/v2/auth/oauth2/token
  → encrypt access + refresh; set cal_auth_mode=oauth; null API key
  → getCalMeProfile; persist cal_username / timezone
  → redirect Setup or Settings

Cal API call path
  → getCalAccessTokenForWorkspace(workspaceId)
      Pilot → env API key
      oauth → decrypt access; if expires_at - 60s ≤ now → refresh; persist
      api_key / legacy encrypted key → decrypt API key
  → withCalApiKey(bearer, fn)  // unchanged call sites
```

### Env (Eve app)

| Variable | Role |
|----------|------|
| `CALCOM_OAUTH_CLIENT_ID` | OAuth client id |
| `CALCOM_OAUTH_CLIENT_SECRET` | Server-only secret |
| `CALCOM_OAUTH_REDIRECT_URI` | Exact registered redirect (e.g. `https://<host>/api/cal/oauth/callback`) |

Redirect URIs to register on Cal: production + `http://localhost:3000/api/cal/oauth/callback`.

### Scopes (user-level)

```text
PROFILE_READ
EVENT_TYPE_READ
EVENT_TYPE_WRITE
BOOKING_READ
BOOKING_WRITE
```

- `PROFILE_READ` — `GET /v2/me` after connect (username / timezone).
- Event-type + booking scopes — meeting-type sync/create and booking list/sync used by dashboard + agent.
- Create/cancel/reschedule/slots may be public per Cal docs; still send Bearer consistently.
- No `TEAM_*` / `ORG_*` in v1.

Access tokens expire in **30 minutes**; refresh via same token endpoint (`grant_type=refresh_token`).

## Schema

Migration on `public.workspaces`:

| Column | Type | Notes |
|--------|------|--------|
| `cal_oauth_access_encrypted` | `text` null | AES-GCM via `encryptSecret` |
| `cal_oauth_refresh_encrypted` | `text` null | AES-GCM |
| `cal_oauth_expires_at` | `timestamptz` null | Access expiry |
| `cal_oauth_scope` | `text` null | Granted scope string |
| `cal_auth_mode` | `text` null | Check: `api_key` \| `oauth` |

Keep `cal_api_key_encrypted`.

**Semantics**

- Connect OAuth success → `cal_auth_mode = 'oauth'`, write OAuth columns, set `cal_api_key_encrypted = null`.
- Legacy key-only row → treat as connected (`api_key`); optional lazy backfill of `cal_auth_mode = 'api_key'` on read/write.
- Disconnect → null OAuth columns, null API key, `cal_auth_mode = null`.
- `has_cal` / booking-live checks → connected if mode in (`api_key`,`oauth`) **or** legacy non-null `cal_api_key_encrypted` (and existing AI meeting-type rules unchanged).

RLS: no new tables; same workspace owner policies. Writes via admin client in trusted server routes/actions only, scoped by owner’s `workspace_id`.

## Module map

| Path | Responsibility |
|------|----------------|
| `lib/cal-oauth.ts` | Env validation, authorize URL, code exchange, refresh, scope constant |
| `lib/cal-oauth-state.ts` | Signed short-lived state (cookie); bind `workspaceId` + `returnTo` |
| `app/api/cal/oauth/start/route.ts` | Owner session required; set state; 302 to Cal |
| `app/api/cal/oauth/callback/route.ts` | Validate state; exchange; persist; redirect with flash/query |
| `lib/workspace.ts` | `getCalAccessTokenForWorkspace`; `getCalApiKeyForWorkspace` becomes thin alias/wrapper |
| `app/dashboard/setup/actions.ts` | Disconnect; hide/remove paste path for non-legacy |
| Settings action + UI | Connect/Disconnect parity with Setup |
| `components/setup-wizard.tsx` | Primary Connect CTA; paste only if `cal_auth_mode === 'api_key'` |
| `lib/errors/*` + `messages/en.json` + `messages/vi.json` | New error codes/copy |
| `docs/ops/production-env.md` + local-dev docs | Document OAuth env + Cal client approval |

**Do not** embed OAuth exchange in React components. Agent tools keep calling `getCalApiKeyForWorkspace` / `withCalApiKey` without Cal-OAuth awareness.

## UX

**Setup (Cal step)**

- Default: “Connect Cal.com” → `/api/cal/oauth/start?returnTo=/dashboard/setup`.
- Connected: “Connected · @username” + Disconnect.
- Legacy API-key workspaces: show paste/reconnect API key **or** upgrade via Connect (Connect preferred).

**Settings**

- Same Connect / Connected / Disconnect without full wizard re-run.
- After Connect, existing sync meeting-types / choose AI type flows unchanged.

**Guest / tools**

- Missing or invalidated credentials → existing `CAL_NOT_CONFIGURED` / `CAL_NOT_CONFIGURED_GUEST` product copy (extend messages if needed for “reconnect” hint to owners only).

## Errors

| Code | When |
|------|------|
| `CAL_OAUTH_NOT_CONFIGURED` | Missing Eve OAuth env |
| `CAL_OAUTH_DENIED` | User denies or `error` on callback |
| `CAL_OAUTH_STATE_INVALID` | Bad/expired/mismatched state |
| `CAL_OAUTH_EXCHANGE_FAILED` | Authorization code exchange fails |
| `CAL_OAUTH_REFRESH_FAILED` | Refresh fails (then clear credentials) |
| Existing `CAL_NOT_CONFIGURED*` | No usable credential |

Never surface raw Cal/provider strings in UI (`lib/errors` formatters).

## Security / tenant isolation

- OAuth client secret and tokens only on server; encrypt at rest with `WORKSPACE_SECRETS_KEY` path.
- State must be unguessable, workspace-bound, short TTL; reject cross-workspace callback.
- Start/callback require authenticated dashboard owner whose `profile.workspace_id` matches state.
- Real tenants never fall back to env `CALCOM_API_KEY`.
- Refresh failure must not leave a half-dead access token that 401-loops forever (clear OAuth auth).

## Ops prerequisites (before prod enable)

1. Create OAuth client at [https://app.cal.com/settings/developer/oauth](https://app.cal.com/settings/developer/oauth) with scopes above.
2. Wait for Cal **approval** (clients start pending).
3. Register redirect URIs; set env on Vercel / local.
4. Smoke on staging with a non-Pilot workspace.

## Testing (acceptance)

1. New workspace: Connect only → callback → username set → sync meeting types → booking live.
2. Legacy API-key workspace: still books; after Connect → `cal_auth_mode=oauth`, API key null, still books.
3. Disconnect → guest tools return `CAL_NOT_CONFIGURED_GUEST`; Setup shows Connect again.
4. Expired access + valid refresh → transparent refresh; next Cal call succeeds.
5. Invalid refresh → credentials cleared; owner must Connect; no Pilot key leak.
6. Workspace A token never used for workspace B.
7. `/chat` Pilot still uses env API key only.

## Out of scope (v1)

- Cal.com Platform / managed users / Atoms
- Self-hosted Cal (custom authorize/API base per workspace)
- Team / organization OAuth scopes
- Background refresh cron (lazy refresh is enough)
- Forced migration deadline for legacy API keys
- Re-encrypt script for `WORKSPACE_SECRETS_KEY` rotation (existing gap unchanged)

## Implementation order (high level)

1. Migration + error codes/i18n + env docs  
2. `lib/cal-oauth*` + start/callback routes  
3. Resolver in `lib/workspace.ts` (Pilot / oauth / api_key)  
4. Setup + Settings UI Connect/Disconnect; gate paste to legacy  
5. Smoke + doctor on UI files; `graphify update .`

Detailed task breakdown belongs in `docs/superpowers/plans/` after this spec is approved.
