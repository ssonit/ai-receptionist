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

All code and all unit tests in this spec are written and verified against fixtures
without these accounts. Only the final smoke test needs them.

## Known adjacent problem (do not fix here)

`agent/channels/messenger.ts:78` resolves the tenant from `?workspace_id=` on the
webhook URL. Both Meta and Zalo register **one** webhook URL per app, shared by every
connected Page/OA, so there is no per-tenant URL to carry that parameter. The Messenger
channel therefore only resolves correctly while a single workspace is connected.

This spec does not change Messenger. It does mean Zalo must not copy that approach.

## Architecture

### Workspace resolution

Resolve from the payload, not the URL: every Zalo webhook event carries the receiving
OA id, so the channel looks up `workspaces` by `zalo_oa_id`. A `?workspace_id=` query
parameter, if present, is treated as a hint and cross-checked against the row found by
`oa_id`; a mismatch is rejected rather than trusted. This mirrors the existing rule in
`.claude/rules/tenant-isolation.md`: a tenant hint that does not resolve is a failure,
never a fallback.

### Data model

Migration `supabase/migrations/20260802000001_zalo_oa.sql`, following the shape already
set by `20260731000000_cal_oauth.sql`:

```sql
alter table public.workspaces
  add column if not exists zalo_oa_id text,
  add column if not exists zalo_oa_name text,
  add column if not exists zalo_access_encrypted text,
  add column if not exists zalo_refresh_encrypted text,
  add column if not exists zalo_expires_at timestamptz,
  add column if not exists zalo_refresh_lock_at timestamptz;

create unique index if not exists workspaces_zalo_oa_id_uidx
  on public.workspaces (zalo_oa_id)
  where zalo_oa_id is not null;
```

The index is unique, not merely an index: one OA must map to exactly one workspace, or
webhook resolution is ambiguous and a guest conversation could land in the wrong
tenant. Connecting an OA already claimed by another workspace fails with a clear error.

No new RLS policies. `workspaces` is already scoped by
`workspace_id in (select workspace_id from profiles where id = auth.uid())`, tokens are
encrypted at rest via `lib/workspace-secrets.ts`, and they are only ever read through
the admin client server-side — the same handling `messenger_page_access_token_encrypted`
already gets.

`chat_sessions` needs no migration: `channel` and `external_user_id` plus the
`(workspace_id, channel, external_user_id)` unique index already exist from
`20260801000001_channel_sessions.sql`, whose own comment anticipates Zalo.

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
update public.workspaces
   set zalo_refresh_lock_at = now()
 where id = $1
   and (zalo_refresh_lock_at is null
        or zalo_refresh_lock_at < now() - interval '30 seconds')
returning zalo_refresh_encrypted;
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

**`lib/zalo-oauth.ts`** — persist, clear, and the refresh-with-lock logic above.
`getZaloAccessToken(workspaceId)` is the single entry point callers use; it returns a
token guaranteed fresh or throws.

**`lib/workspace.ts`** — add `getZaloCredentialsForWorkspace(workspaceId)` next to the
existing `getMessengerCredentialsForWorkspace`.

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
workspace-match checks.

New codes in `lib/errors/app-codes.ts`: `ZALO_NOT_CONFIGURED`, `ZALO_SEND_FAILED`,
`ZALO_OAUTH_FAILED`, `ZALO_DISCONNECT_FAILED`, `ZALO_OA_ALREADY_LINKED`.

All routes use constants from `lib/routes.ts`; no hardcoded paths.

## Testing

Vitest is configured (`npm test`). Everything below runs without Zalo credentials.

**`lib/zalo-webhook.test.ts`**
- valid signature accepted; wrong secret, tampered body, and missing header rejected
- verification uses raw body, so a semantically-equal but re-serialized body fails
- `parseZaloEvents` keeps `user_send_text`, drops other event types, handles a batch,
  and returns `[]` for malformed JSON instead of throwing

**`lib/zalo-send.test.ts`**
- text at, just under, and well over the length limit chunks correctly
- chunks are sent sequentially and in order
- an API error surfaces as a thrown error with Zalo's message, not a generic one

**`lib/zalo-oauth.test.ts`**
- two concurrent `getZaloAccessToken` calls on an expired token result in exactly one
  refresh request, and both callers receive the same fresh token
- a stale lock older than 30 seconds is reclaimed
- a token expiring within the 5-minute skew is refreshed; one outside it is not
- a rejected refresh token clears credentials and raises the owner notification

**Manual smoke test** (needs the prerequisite accounts, follows
`.claude/skills/test-feature`): connect an OA from Settings, message it from a second
Zalo account, confirm the agent replies, confirm the booking lands in the correct
workspace, disconnect and confirm the agent stops answering.

## Verification

`npm run typecheck`, `npm test`, `npm run doctor` (UI touched), `npx supabase db reset`
to prove the migration applies from scratch, then `graphify update .`.

## Risks

- **Zalo app permission approval** is a third-party dependency with no committed
  timeline. It gates the smoke test, not the code.
- **Token rotation** is the highest-risk component; the concurrency test is not
  optional.
- **OA-to-workspace uniqueness** is enforced by a database constraint rather than only
  in application code, because getting it wrong routes one tenant's guests into another
  tenant's workspace.
