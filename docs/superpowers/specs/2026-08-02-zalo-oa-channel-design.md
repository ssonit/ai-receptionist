# Zalo OA channel — design

Status: approved for planning
Date: 2026-08-02
Scope: Zalo Official Account as a third agent channel, alongside web chat and Messenger.

## Goal

A guest messages the tenant's Zalo Official Account; the eve agent answers and books
appointments, in the tenant's own workspace, with the same behaviour the guest gets on
`/b/[slug]` and on Messenger.

## Non-goals

Explicitly out of scope. Each is a separate spec if it ever happens.

- **WhatsApp.** Deferred. Meta made Tech Provider enrollment mandatory for ISVs in
  April 2026, and from 2026-10-01 Meta bills non-template replies inside the 24-hour
  service window that used to be free — so WhatsApp carries both an approval
  dependency and a per-message cost that the current flat pricing does not cover.
- **ZNS (Zalo Notification Service).** No appointment reminders over Zalo. ZNS needs
  per-template approval and is billed per message.
- **Images and attachments.** Text only, both directions.
- **Agent-initiated messages.** The channel only replies inside a conversation the
  guest started, same as Messenger today.
- **Fixing Messenger's workspace resolution.** See "Known adjacent problem" below.

## Prerequisite (manual, blocks end-to-end verification only)

No Zalo OA and no Zalo developer app exist yet. Before the channel can be tested
against the live API, someone must:

1. Create an Official Account at `oa.zalo.me` and get it verified.
2. Create an app at `developers.zalo.me` and request the Official Account API
   permission.
3. Link the OA to the app.
4. Set the app-level webhook URL to `https://<domain>/eve/v1/zalo/webhook`.

New environment variables: `ZALO_APP_ID`, `ZALO_APP_SECRET`, `ZALO_OA_SECRET_KEY`,
`ZALO_REDIRECT_URI`. Add them to `.env.example`.

**This is a prerequisite for confirming the integration, not for building or exercising
it.** Everything except the OAuth connect handshake is verifiable locally through the
simulator and the test layers described under "Testing", including the real agent
answering a real booking request. Treat the timeline for these accounts as independent
from the implementation.

## Known adjacent problem (do not fix here)

`agent/channels/messenger.ts:78` resolves the tenant from `?workspace_id=` on the
webhook URL. Both Meta and Zalo register **one** webhook URL per app, shared by every
connected Page/OA, so there is no per-tenant URL to carry that parameter. The Messenger
channel therefore only resolves correctly while a single workspace is connected.

Zalo must not copy that approach — see "Workspace resolution". Messenger's own handler
is left alone here; this spec moves where its credentials are *stored*, not how its
webhook resolves a tenant. Worth a follow-up once Zalo proves the `external_id` lookup
in production.

## Architecture

### Workspace resolution

Resolve from the payload, not the URL: every Zalo webhook event carries the receiving
OA id, so the channel looks up `workspaces` by `zalo_oa_id`. A `?workspace_id=` query
parameter, if present, is treated as a hint and cross-checked against the row found by
`oa_id`; a mismatch is rejected rather than trusted. This mirrors the existing rule in
`.claude/rules/tenant-isolation.md`: a tenant hint that does not resolve is a failure,
never a fallback.

### Data model

Messenger stored its credentials as five columns on `workspaces`. Repeating that per
channel does not scale: every new channel widens the busiest table in the schema with
columns that are null for almost every row, and each one needs its own ad-hoc
`get<Channel>CredentialsForWorkspace`. Zalo is the second channel, which is the right
moment to normalise — a third would make it a rewrite.

Migration `supabase/migrations/20260802000001_channel_connections.sql`:

```sql
create table if not exists public.workspace_channel_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
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

create unique index if not exists wcc_workspace_provider_uidx
  on public.workspace_channel_connections (workspace_id, provider);

create unique index if not exists wcc_provider_external_uidx
  on public.workspace_channel_connections (provider, external_id);
```

`external_id` is the Page id for Messenger, the OA id for Zalo. Fields a provider does
not use stay null — Messenger has no refresh token, Zalo has no long-lived one.
Anything genuinely provider-specific goes in `metadata`, not a new column.

Both indexes are unique and both matter. `(workspace_id, provider)` keeps one workspace
from connecting two OAs and making "which one replies" undefined.
`(provider, external_id)` is the tenant-isolation constraint: one OA maps to exactly one
workspace, so webhook resolution can never be ambiguous. Without it a second workspace
could claim an OA and start receiving another tenant's guest conversations. Connecting
an already-claimed account fails with `ZALO_OA_ALREADY_LINKED`.

**RLS is stricter here than on `workspaces`.** Enable RLS and grant `authenticated` no
policies at all — the table holds secrets, and `.claude/rules/supabase-migrations.md`
says a secret-bearing table should be reachable only through the service-role client.
The dashboard settings page is a Server Component that has already resolved the caller's
workspace through `getDashboardUser()`, so it reads through the admin client scoped to
that id; no browser-side query needs this table. This is deliberately tighter than the
existing `messenger_page_access_token_encrypted` column, which authenticated users can
select (encrypted, so not a breach, but not a pattern worth extending).

**Messenger moves too.** The same migration backfills existing rows:

```sql
insert into public.workspace_channel_connections
  (workspace_id, provider, external_id, display_name, access_encrypted)
select id, 'messenger', messenger_page_id, messenger_page_name,
       messenger_page_access_token_encrypted
  from public.workspaces
 where messenger_page_id is not null
on conflict (workspace_id, provider) do nothing;
```

The old `messenger_*` columns are **not** dropped in this migration. Backfill and cut
the code over first; drop them in a follow-up migration once a deploy has proven the new
path, so this release stays rollback-safe. Leaving two write paths live is not an
option — `lib/messenger-oauth.ts` and `getMessengerCredentialsForWorkspace` switch to
the table in this change, so the columns become read-only dead weight immediately.

Cal.com OAuth stays on its `cal_oauth_*` columns. It is a booking backend, not a
messaging channel, and it carries an `api_key | oauth` dual mode that does not fit this
table. Folding it in would be a drive-by refactor.

`chat_sessions` needs no migration: `channel` and `external_user_id` plus the
`(workspace_id, channel, external_user_id)` unique index already exist from
`20260801000001_channel_sessions.sql`, whose own comment anticipates Zalo.

### Channel connection access layer

One module, `lib/channel-connections.ts`, replaces the per-provider credential getters:

```ts
getChannelConnection(workspaceId, provider)
getChannelConnectionByExternalId(provider, externalId)   // webhook resolution
upsertChannelConnection({ workspaceId, provider, ... })
deleteChannelConnection(workspaceId, provider)
claimRefreshLock(workspaceId, provider)                  // see Token rotation
```

Provider-agnostic and secret-agnostic: it encrypts on write and decrypts on read through
`lib/workspace-secrets.ts`, and never reaches into Zalo or Meta APIs.
`getMessengerCredentialsForWorkspace` and the new `getZaloCredentialsForWorkspace` in
`lib/workspace.ts` become thin adapters over it, so their callers do not change. Adding a
third channel later means one new `provider` value and a new `lib/<channel>.ts` client —
no schema change.

### Token rotation

This is the part with no precedent in the repo and the most likely source of a
production outage.

A Zalo OA access token is valid for **1 hour**. Its refresh token is **single-use** and
valid for 3 months: refreshing returns a new access token *and* a new refresh token,
and invalidates the old one. Messenger's long-lived page token needs none of this.

The failure mode: two webhook deliveries arrive within the same second on an expired
token, both read the same refresh token, both call refresh. The second call presents an
already-consumed token, Zalo rejects it, and — because the first call has already
overwritten the stored refresh token — there is no valid credential left. The channel
is dead until someone reconnects by hand, with no error surfaced to the tenant.

Guard it with a claim at the database level, so the lock holds across serverless
instances:

```sql
update public.workspace_channel_connections
   set refresh_lock_at = now()
 where workspace_id = $1
   and provider = 'zalo'
   and (refresh_lock_at is null
        or refresh_lock_at < now() - interval '30 seconds')
returning refresh_encrypted;
```

- Zero rows returned means another caller is mid-refresh. Back off briefly (short
  bounded retry, ~200 ms steps up to ~3 s), then re-read the row and use the token that
  caller stored.
- The 30-second staleness window releases a lock orphaned by a crashed instance.
- The lock is cleared on both success and failure.
- Refresh proactively when the token expires within 5 minutes, so a request never
  races its own expiry.

If Zalo rejects the refresh token outright (rather than failing transiently), the
credentials are unrecoverable. Clear them, and raise a dashboard notification through
the existing `lib/notifications*.ts` so the owner learns the channel is down instead of
discovering it through a silent absence of messages.

### lib layer

Mirrors the Messenger file split, so the two channels stay comparable.

**`lib/zalo.ts`** — API client, no persistence. `buildZaloOAuthUrl`,
`exchangeCodeForTokens`, `refreshZaloTokens`, `getOaProfile`, `sendZaloText`,
`chunkZaloText`. Every call gets the timeout and non-JSON-response guards that
`graphFetch` in `lib/messenger.ts` already has — Zalo, like Meta, can answer with an
HTML error page from an edge proxy, and an unguarded `.json()` would mask the real
status. The access token goes in the `access_token` request header; Zalo does not use
`Authorization: Bearer`.

`chunkZaloText` splits on paragraph, then line, then word boundaries at the Zalo text
limit, same algorithm as `chunkMessengerText`. A reply over the limit is otherwise
rejected whole and the guest sees nothing. The exact character limit is read from the
current Zalo OA API docs at implementation time and exported as a named constant, the
way `MESSENGER_TEXT_LIMIT` is — it is not hardcoded inline from memory.

**`lib/zalo-webhook.ts`** — `verifyZaloSignature(rawBody, header, appId, oaSecretKey)`
computes `sha256(appId + rawBody + timestamp + oaSecretKey)` and compares timing-safely
against `X-ZEvent-Signature`. Verification uses the **raw** body text, before any JSON
parsing. `parseZaloEvents(rawBody)` keeps `user_send_text` events and returns
`{ oaId, userId, text, msgId, timestamp }`, ignoring everything else.

**`lib/zalo-oauth.ts`** — the Zalo-specific half of connect/refresh: PKCE state, code
exchange, and the refresh-with-lock policy above. It does not talk to the database
directly; persistence goes through `lib/channel-connections.ts`.
`getZaloAccessToken(workspaceId)` is the single entry point callers use; it returns a
token guaranteed fresh or throws.

**`lib/workspace.ts`** — `getZaloCredentialsForWorkspace(workspaceId)` next to the
existing `getMessengerCredentialsForWorkspace`; both become thin adapters over
`lib/channel-connections.ts` rather than reading `workspaces` columns.

### OAuth flow and PKCE

Zalo OA OAuth v4 requires PKCE. The `code_verifier` generated at `start` must survive
the redirect to `callback`.

Reuse the existing signed-state mechanism rather than adding storage: extend the payload
of `lib/cal-oauth-state.ts` to carry the verifier alongside the workspace id and
`returnTo`. It is already an httpOnly, signed, TTL-bounded cookie, which is exactly the
property the verifier needs. The Messenger start route
(`app/api/messenger/oauth/start/route.ts`) already reuses this module, so a third
consumer is the established pattern.

Routes:

- `app/api/zalo/oauth/start/route.ts` — `requireOwnerWorkspace`, then
  `assertWorkspaceFeature(workspaceId, PLAN_FEATURE.ZALO)`, then env validation, then
  redirect to the Zalo permission URL with `code_challenge` and the state cookie set.
- `app/api/zalo/oauth/callback/route.ts` — verify state, exchange code plus verifier for
  tokens, read the OA profile for `oa_id` and name, reject if that `oa_id` already
  belongs to another workspace, persist encrypted, redirect to `returnTo`.

Both follow `app/api/messenger/oauth/*` exactly, including returning
`PLAN_UPGRADE_REQUIRED` as a 403.

### Channel

**`agent/channels/zalo.ts`**, structurally a copy of `agent/channels/messenger.ts`:

1. `POST /webhook` reads the raw body and verifies the signature before anything else.
2. Parse events; empty parse returns `{ ok: true, skipped: true }`.
3. Resolve the workspace from `oa_id`; unresolved is a 404, never a Pilot fallback.
4. `assertWorkspaceSubscriptionActive` — an unpaid workspace must not burn LLM turns
   through Zalo any more than through web chat.
5. `checkAgentRateLimit`; when limited, reply with the translated `chat.rateLimited`
   string rather than dropping the message silently.
6. `getOrCreateChannelSession({ channel: "zalo", externalUserId: userId })`,
   `upsertChatMessages` for the inbound turn, `args.send(...)` with
   `continuationToken: zalo:<workspaceId>:<userId>`, then `touchChannelSession`.
7. `args.waitUntil` drives the agent in the background so Zalo gets a fast 200;
   messages from one guest are handled sequentially to preserve order.
8. The `message.completed` event persists the assistant turn and delivers it with
   `sendZaloText`. A delivery failure is logged with the workspace id, never thrown back
   into the turn loop.

`GET /webhook` returns 200 for health checks. Zalo has no Meta-style challenge
handshake; it verifies domain ownership in the developer dashboard instead.

The plan feature gate is deliberately **absent** from this file. Per the contract
documented in `lib/plan-features.ts`, the gate belongs only on the connect path: an OA
that is already connected keeps being answered even if the workspace later downgrades,
because cutting off a live channel would break the tenant's own customer conversations.
A workspace that stops paying entirely is already stopped in step 4.

### Message deduplication

Zalo retries a webhook when it does not get a timely 200. Without dedupe, one guest
message is answered twice and billed twice in LLM turns.

Drop an event whose `msg_id` has already been processed for that session. The inbound
turn is persisted through `upsertChatMessages` with the Zalo `msg_id` written into the
existing `eve_message_id` column, prefixed `zalo:` to keep it distinct from the
`turnId:sequence` values assistant turns use. The upsert constraint from
`20260725000005_chat_messages_upsert_constraint.sql` then makes a repeated delivery a
no-op write rather than a second row, and the channel checks whether that row already
existed to decide whether to invoke the agent. No new table, no new column.

The check runs after signature verification and before the agent is invoked. Confirm
during implementation that the existing constraint covers `(session_id, eve_message_id)`
for inbound rows; if it does not, extend it in the same migration as the Zalo columns.

### Plan gating

Zalo is a **Starter** feature. Messenger stays Pro. This is intentional and not an
oversight: Zalo is the default messaging channel in Vietnam, which is this product's
primary market, so gating it behind Pro would leave the Starter tier without a usable
channel there.

In `lib/plan-features.ts`:

- `PLAN_FEATURE.ZALO: "zalo"`
- `PLAN_FEATURE_TIERS.zalo: ["starter", "pro"]`
- add `PLAN_FEATURE.ZALO` to `FEATURE_ORDER`

Both the dashboard billing card and the landing page pricing read from this table, so
the copy follows automatically once `plans.features.zalo` is added to
`messages/en.json` and `messages/vi.json`. Remove the "Zalo and WhatsApp are
deliberately absent" note from the module docstring and narrow it to WhatsApp.

### Dashboard UI

`app/_components/zalo-connection-card.tsx`, a sibling of
`messenger-connection-card.tsx`: connected state shows the OA name and a Disconnect
button; disconnected state shows either Connect or an upgrade link depending on
`canConnect`. `disconnectZaloAction` goes in `app/dashboard/settings/actions.ts`
alongside `disconnectMessengerAction`, with the same `requireOwnerWorkspace` and
workspace-match checks; it deletes the connection row rather than nulling fields, so
there is no state where the card reads "disconnected" while a usable token is still
stored — the failure `clearMessengerTokens` guards against today.

The settings page reads both connections server-side through
`lib/channel-connections.ts` after `getDashboardUser()` has resolved the workspace, and
passes only `{ externalId, displayName }` into the client component. Tokens never cross
the server/client boundary.

New codes in `lib/errors/app-codes.ts`: `ZALO_NOT_CONFIGURED`, `ZALO_SEND_FAILED`,
`ZALO_OAUTH_FAILED`, `ZALO_DISCONNECT_FAILED`, `ZALO_OA_ALREADY_LINKED`.

All routes use constants from `lib/routes.ts`; no hardcoded paths.

## Testing

**Constraint: there is no Zalo OA and no Zalo developer app, and there may not be one
for a while.** The feature must be verifiable without them, and the strategy below is
built around that rather than treating it as a footnote. Vitest is already configured
(`npm test`); no new test dependency is needed — `globalThis.fetch` is stubbed directly,
matching the existing dependency-free style of `lib/messenger-webhook.test.ts`.

### Layer 1 — pure functions, no network, no DB

Same shape as the existing Messenger tests.

**`lib/zalo-webhook.test.ts`**
- valid signature accepted; wrong secret, tampered body, and missing header rejected
- verification uses the raw body, so a semantically-equal but re-serialized body fails
- comparison is timing-safe and does not throw on a malformed header
- `parseZaloEvents` keeps `user_send_text`, drops other event types, handles a batch,
  and returns `[]` for malformed JSON instead of throwing

**`lib/zalo-send.test.ts`** (chunking half)
- text at, just under, and well over the limit chunks correctly
- splits prefer paragraph, then line, then word boundaries
- empty and whitespace-only input produce no messages rather than an empty send

### Layer 2 — API contract, fetch stubbed

Stub `globalThis.fetch` and assert the request we *would* send, plus how every response
shape is handled. This is what stands in for the live API, so it checks the request as
strictly as the response.

**`lib/zalo-send.test.ts`** (transport half)
- request goes to the documented endpoint with the token in the `access_token` header,
  not `Authorization: Bearer`, and not in the query string
- chunks are sent sequentially, in order, one request each
- a Zalo error body surfaces its message; an HTML error page from an edge proxy
  surfaces the HTTP status instead of throwing `SyntaxError`
- a hung request aborts at the timeout rather than hanging the turn

**`lib/zalo-oauth.test.ts`** (exchange half)
- the authorize URL carries `code_challenge` and the state token
- code exchange posts `code_verifier` and the secret key header, and stores both tokens
  encrypted — asserted by decrypting, so a plaintext regression fails the test
- a response missing `access_token` or `refresh_token` throws instead of persisting a
  half-connected row

Fixtures live in `lib/__fixtures__/zalo/` as JSON captured from the published API
reference, each with a comment naming the doc page it came from. When the real account
exists, the first live call is compared against them.

### Layer 3 — token rotation, against real Postgres

**`lib/zalo-oauth.test.ts`** (rotation half) runs against the local Supabase database,
not a mocked client. The whole point of the claim is how Postgres behaves under
concurrent `update`; a mocked DB would make the test pass while proving nothing.

- two concurrent `getZaloAccessToken` calls on an expired token produce exactly **one**
  refresh request, and both callers receive the same fresh token
- a lock older than 30 seconds is reclaimed; a fresh one is not
- a token expiring within the 5-minute skew refreshes; one outside it does not
- the lock is released on the failure path, not only on success
- a rejected refresh token clears the connection row and raises the owner notification

These require `npx supabase start`. Gate them so `npm test` skips rather than fails when
no local database is running, and document that in the test file header.

### Layer 4 — channel handler, end to end in-process

**`agent/channels/zalo.test.ts`** drives the real `POST /webhook` handler with a
correctly signed payload, stubbing only `args.send` and outbound fetch. This is where
tenant isolation is actually proven:

- bad signature → 401, and the agent is never invoked
- unknown `oa_id` → 404, never a Pilot fallback
- an `oa_id` belonging to workspace A never opens a session in workspace B
- inactive subscription → skipped, no LLM turn
- rate-limited guest → gets the translated notice, no LLM turn
- a repeated `msg_id` → no second agent invocation and no second reply
- happy path → session created with `channel: "zalo"`, inbound turn persisted,
  `args.send` called with the right continuation token
- `message.completed` → assistant turn persisted and delivery attempted; a delivery
  failure is logged and does not throw into the turn loop

### Layer 5 — local simulator, the substitute for owning an OA

`scripts/zalo-sim.mjs` — a small CLI that signs a `user_send_text` payload with the
local `ZALO_OA_SECRET_KEY` and POSTs it at the running dev server's webhook:

```bash
node scripts/zalo-sim.mjs --oa <oa_id> --user <fake_user_id> --text "cho mình đặt lịch mai 3h chiều"
```

This exercises the entire real pipeline — signature verification, workspace resolution,
session creation, the real agent, real Cal.com booking — with only the outbound Zalo
send replaced. The conversation shows up in the dashboard like any other, so the feature
can be judged by looking at it rather than by reading test output.

Supporting pieces:

- **`ZALO_DRY_RUN=1`** makes `sendZaloText` log the payload and record it instead of
  calling `openapi.zalo.me`. Hard-guarded: the flag is ignored when
  `NODE_ENV === "production"`, and the module throws at import time if it is set there.
  A dry-run flag that can silently disable message delivery in production is a worse bug
  than the one it helps test.
- **`supabase/seed.sql`** gains a fake `zalo` connection row for the Pilot workspace —
  fake `oa_id`, fake encrypted tokens with a far-future expiry — so the simulator has a
  target immediately after `npx supabase db reset`.
- `scripts/zalo-sim.mjs` refuses to run against a non-localhost target.

### What this does not cover

Honest gap, recorded rather than papered over: **the OAuth connect flow cannot be
verified without a real Zalo app.** Layer 2 proves the requests are shaped as documented
and the responses are handled, but nothing proves Zalo accepts them. The same applies to
the real signature format and the real text length limit — all three are taken from the
published docs.

So when the account does exist, run this before trusting the channel:

1. Connect the OA from Settings; confirm tokens persist and the card shows the OA name.
2. Message the OA from a second Zalo account; confirm the agent replies.
3. Compare the first live webhook body against the Layer 2 fixtures and reconcile any
   difference.
4. Send a reply longer than the text limit; confirm chunking delivers all of it.
5. Leave the conversation idle past one hour, then message again — this is the only real
   test of token refresh.
6. Confirm the booking landed in the correct workspace.
7. Disconnect; confirm the agent stops answering.

Recorded in `.claude/skills/test-feature/SKILL.md` so it is not lost between now and
whenever the account exists.

## Verification

The feature is done when all of these pass, not when the code is written:

1. `npx supabase db reset` — migration and backfill apply from scratch.
2. `npm test` — all five layers, with the local database running so Layer 3 does not
   skip.
3. `npm run typecheck`.
4. `npm run doctor` — UI was touched.
5. `node scripts/zalo-sim.mjs` against `npm run dev` — a simulated guest message
   produces an agent reply and a real Cal.com booking in the correct workspace, visible
   in the dashboard.
6. Messenger regression pass — connect, message, disconnect still work after the
   credential move.
7. `graphify update .`.

Step 5 is the one that answers "does this actually work"; steps 1–4 only say nothing is
obviously broken.

## Risks

- **No live account.** The largest risk is not a bug but an unknown: three things
  (OAuth acceptance, exact signature format, exact text limit) are implemented from
  documentation and cannot be confirmed until an OA exists. Layers 1–5 make everything
  else verifiable; the checklist in "What this does not cover" is what closes the rest.
- **Zalo app permission approval** is a third-party dependency with no committed
  timeline. It gates that checklist, not the code.
- **Token rotation** is the highest-risk component. Its test runs against real Postgres
  for a reason and is not optional.
- **The Messenger migration** touches a working channel. Backfill is verified by
  `npx supabase db reset` plus a Messenger regression pass before the Zalo work is
  considered done; the old columns stay in place so a bad deploy can be rolled back.
- **`ZALO_DRY_RUN`** is a flag that disables message delivery. It is guarded at import
  time against production for that reason, and the guard needs its own test.
- **OA-to-workspace uniqueness** is enforced by a database constraint rather than only
  in application code, because getting it wrong routes one tenant's guests into another
  tenant's workspace.
