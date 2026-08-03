# Staff reply & human handoff — design

Status: approved for planning
Date: 2026-08-03
Scope: let a workspace's staff take a conversation away from the agent, reply to the
guest by hand, and hand it back — on web chat, Messenger and Zalo.

## Goal

Today the agent is the only thing that ever answers a guest. `/dashboard/conversations`
is read-only. When a guest complains, negotiates, or asks something outside the agent's
competence, staff have no way to step in without leaving the product.

After this change: staff open a conversation, press **Take over**, type, and the guest
receives their message on whichever channel they are using. Pressing **Hand back to AI**
returns the conversation to the agent, which is told what the human said so it does not
contradict them.

## Non-goals

Each is a separate spec if it ever happens.

- **Automatic escalation.** The agent never decides on its own to hand off. No
  sentiment detection, no keyword triggers, no confidence thresholds. Manual only.
- **Automatic hand back.** No inactivity timeout returns a conversation to the agent.
  Staff press the button. This avoids the agent cutting in while someone is mid-reply,
  and avoids needing a cron to expire claims.
- **A dedicated inbox page.** Staff reply inside the existing conversation detail sheet,
  not a new Intercom-style two-pane screen.
- **Hard conversation locking.** `claimed_by` records who took over; it does not stop
  another teammate from replying. A hard lock strands conversations when the claimer
  goes offline.
- **Attachments, images, canned replies, internal notes, typing indicators.** Text only.
- **Staff-initiated outbound.** Staff can only reply inside a conversation the guest
  started, same constraint the agent already has on Messenger and Zalo.

## Architecture

### Data model

`chat_sessions.status` already means "is this conversation open or closed"
(`supabase/migrations/20260724000001_init_schema.sql:365`). Who is answering is a
separate axis, so it gets its own column rather than new `status` values.

```sql
alter table public.chat_sessions
  add column reply_mode text not null default 'ai'
    check (reply_mode in ('ai', 'human')),
  add column claimed_by uuid references auth.users (id) on delete set null,
  add column claimed_at timestamptz;

create index chat_sessions_workspace_reply_mode_idx
  on public.chat_sessions (workspace_id, reply_mode)
  where reply_mode = 'human';
```

The partial index serves the dashboard filter "conversations a human is handling",
which is the only query that selects on `reply_mode`.

`reply_mode` must be added to `SESSION_LIST_SELECT`, `SESSION_AUTH_SELECT` and
`SESSION_FULL_SELECT` in `lib/chat-sessions.ts:109-117`, and to `ChatSessionRow` /
`ChatSessionListItem`. `claimed_by` / `claimed_at` go in the auth and full selects only —
the list view shows a claimed badge, which `reply_mode` alone already answers.

### Messages

Staff messages are stored as ordinary assistant messages so every existing reader —
guest widget, channel handlers, `loadConversationDetail()` — keeps working untouched.
The sender is recorded in `raw`:

```ts
// staff-sent message
raw = { sentBy: "staff", staffUserId: "<uuid>", staffName: "Linh" }

// handoff notice
raw = { kind: "handoff", direction: "to_human" | "to_ai" }
```

`role` stays `"assistant"` for staff replies. Handoff notices use `role: "system"`.

`staffName` is denormalized on purpose: conversation history should still say who
replied after that person leaves the workspace.

Staff messages carry `eve_message_id: null`, so `upsertChatMessages()`
(`lib/chat-sessions.ts:443`) routes them down the `withoutEveId` branch and no
uniqueness conflict is possible with channel-provided ids.

### Reply-mode state machine

Two transitions, both staff-initiated, both server actions.

**Take over** — a single conditional update, which is what makes it race-safe:

```sql
update public.chat_sessions
   set reply_mode = 'human', claimed_by = $user, claimed_at = now(), updated_at = now()
 where id = $id and workspace_id = $ws and reply_mode = 'ai'
returning *;
```

Zero rows returned means another teammate claimed it first. The action returns a
typed error and the sheet refreshes to show who holds it. No advisory lock, no
read-then-write window.

**Hand back** — sets `reply_mode = 'ai'`, clears `claimed_by` / `claimed_at`, and
attaches handoff context (below).

Sending a staff message requires `reply_mode = 'human'`; the action rejects otherwise.
This is enforced server-side, not just by disabling the input.

### Suppressing the agent, on both sides

The guest widget kills a turn that produces no events: `agent-chat.tsx:653` polls every
second and, past `CHAT_TURN_IDLE_TIMEOUT_MS`, logs an error, sets `turnTimedOut` and
stops the turn. So silently dropping the agent server-side would show the guest a
**false timeout error**. Both sides must handle `human` mode:

- **Client.** The widget knows `reply_mode` (returned by the poll, below). In `human`
  mode a guest send persists the message via the existing
  `POST /api/chat/sessions/[id]/messages` and starts **no agent turn** — no spinner, no
  watchdog.
- **Server.** `agent/channels/eve.ts` cannot cancel the turn. Its `onMessage` hook
  returns `{ auth, context }` (`node_modules/eve/docs/channels/eve.mdx:105`) with no
  cancel in that contract, and the web channel has no custom route to return early from
  the way Messenger and Zalo do. Note this is a limit of the *hook*, not of eve: the
  runtime does have a per-turn `turn.cancelled` event, documented as "always followed by
  `session.waiting`" with the session then accepting the next message normally. Nothing
  here is global, and nothing is switched off.

  So the turn runs, held to one sentence by two independent guards:

  1. **`context`** — `onMessage` injects a per-request directive, the framework's
     documented hook for adding context "before the agent sees the user message". It
     augments the prompt, so the agent still has the FAQ and its tools in reach.
  2. **The auth stamp** — `replyModeHuman: "1"` on the auth attributes, mirroring
     `agentRateLimited` at `agent/channels/eve.ts:83` / `lib/agent-booking-auth.ts:87`.
     `agent/instructions.ts` reads it and returns the holding prompt *instead of*
     assembling the normal one, so there is no FAQ and no reason to reach for a tool.

  Guard 1 is cheap and idiomatic; guard 2 is what holds if the model ignores it.

  This makes **client-side suppression the primary mechanism**, not a convenience. The
  server side is the safety net for the ~10s race where the guest presses send before
  their widget learns about the takeover: the cost is one cheap turn producing a
  harmless "someone will reply shortly", instead of the agent talking over the human.

Messenger (`agent/channels/messenger.ts`) and Zalo (`agent/channels/zalo.ts`) have no
stream to close: after `upsertChatMessages()` stores the inbound message they return
without calling `args.send()`, so no LLM turn is billed.

### Delivering a staff message

There is no shared outbound dispatcher today. `sendMessengerText` is called only from
`agent/channels/messenger.ts:211` and `sendZaloText` only from
`agent/channels/zalo.ts:77`, each fetching its own credentials. Staff reply needs the
same capability from a dashboard server action.

New `lib/channel-outbound.ts`:

```ts
sendTextToSession(session: ChatSessionRow, text: string): Promise<void>
```

It switches on `session.channel` and calls `sendMessengerText` / `sendZaloText` with
credentials from `getMessengerCredentialsForWorkspace()` (`lib/workspace.ts:650`) and
`getZaloCredentialsForWorkspace()` (`lib/workspace.ts:672`) — the same helpers the
channel handlers already use. Not `getChannelConnection()` directly: the Zalo helper
routes through `getZaloAccessToken()` to refresh an expired token, so bypassing it would
send staff replies with a stale token. Both helpers already take `workspaceId`
explicitly and throw `MESSENGER_NOT_CONFIGURED` / `ZALO_NOT_CONFIGURED`, which map onto
the existing `APP_ERROR_CODE` entries of the same names.

Web sessions have `channel = null` — `createChatSession()` (`lib/chat-sessions.ts:196`)
inserts no channel, only `getOrCreateChannelSession()` (`lib/chat-sessions.ts:604`)
sets one. `null` is therefore the
web case and dispatch is a no-op: the message is already in `chat_messages` and the
widget's poll picks it up. An unrecognised non-null channel is a bug, not a web session,
so it throws rather than silently no-opping and reporting success.

Order matters: **write to `chat_messages` first, then dispatch.** A failed platform send
must leave the message visible to staff with an error, not vanish.

Migrating the two existing call sites onto this module is a follow-up, not part of this
work — it keeps the diff small and avoids touching a channel path that is already
covered by tests.

**Send failures are surfaced, never swallowed.** Messenger enforces a 24-hour window
from the guest's last message and Zalo OA has its own window and quota; a late reply
fails at the API. The action maps the failure to a code in `lib/errors/` and the sheet
shows it inline next to the message.

### Web delivery: polling

The widget currently receives messages only through the SSE stream of a turn it
started. **Agent replies are unaffected by this design and keep streaming token by
token.** Polling exists solely to deliver messages that arrive outside the guest's own
turn: staff replies and handoff notices.

`GET /api/chat/sessions/[id]/messages` gains an `after` cursor, mirroring the existing
`before` decode in `getChatMessagesPage()` (`lib/chat-sessions.ts:300`), and returns
`reply_mode` alongside the page. Folding session state into the messages response is
deliberate: the alternative is a second request every tick, and the widget needs both
values together to decide whether to open a turn.

The widget polls every 10s while the document is visible and no turn is streaming, and
stops when hidden. Supabase Realtime was rejected: guests are anonymous (`visitor_id`,
no `auth.uid()`), so subscribing them to `chat_messages` would need a permissive anon
policy, which collides with the standing rule against `using (true)` on tenant tables. A
dedicated SSE endpoint was rejected as serverless function time held open for every
guest with a chat window.

Consequence, accepted: takeover is visible to a web guest up to ~10s late, so one last
agent reply can still land in that window. Staff see it in the transcript.

### Guest-visible handoff notices

Both directions produce a notice, because a guest told a human joined will keep waiting
for a human unless told otherwise:

- to human — "A team member has joined the conversation."
- to AI — "You're chatting with the assistant again."

Copy lives in `messages/en.json` + `messages/vi.json` and renders in the guest locale
(`eve_guest_locale`), never the dashboard locale.

On web the notice is a `role: "system"` row rendered as a centered inline divider.
`lib/chat-message-display.ts` must render `raw.kind === "handoff"` this way; if
`chatMessageRowToEveMessage()` currently drops system rows, extend it rather than
promoting the notice to an assistant message.

Messenger and Zalo have no system-message concept, so there the notice is sent as
ordinary text through `sendTextToSession()`.

### Handback context: the agent must not contradict the human

`agent/channels/zalo.ts:179` passes a deterministic `continuationToken`
(`zalo:${workspaceId}:${userId}`), so the eve runtime keeps its own thread. Staff
messages written straight into `chat_messages` never enter it. Without a fix, the first
agent turn after a hand back is blind to the human exchange and can contradict a promise
staff just made — the worst failure this feature could ship.

Fix: `agent/instructions.ts` already builds the system prompt per request from the
resolved workspace. It gains a handoff block. When the session has staff messages after
the most recent `direction: "to_human"` notice, those messages are fetched by
`chatSessionId` and inserted as:

> A human teammate replied to this guest directly. Here is what they said. Treat it as
> authoritative and do not contradict it.

Bounded to the last 10 staff messages or 2000 characters, whichever is smaller, so a
long manual exchange cannot crowd out the rest of the prompt.

### Dashboard UI

All inside `ConversationDetailSheet` (`components/conversations-table.tsx:77`):

- A status banner: "AI is replying" / "You're handling this" / "Handled by Linh".
- The primary button toggles **Take over** ↔ **Hand back to AI**.
- A composer below the transcript, enabled only in `human` mode.
- Staff messages render with a "Staff · Linh" badge so history is readable later.
- Send failures render inline against the failed message.

Access follows the existing dashboard role rules. `OWNER_ONLY_PATHS`
(`lib/dashboard-access.ts:33`) lists settings, setup, agent, faq, meetingTypes, embed
and billing — conversations is deliberately absent, so staff as well as owners can
reply, which is the point of the feature. No role gate is added here.

The banner needs the claimer's display name, and `claimed_by` is only a `uuid`.
`loadConversationDetail()` (`lib/conversations-dashboard.ts:144`) resolves it to a name
from `profiles` and returns `claimedByName`. The sheet never receives a bare uuid.
This is separate from the `staffName` stored in `raw`: that one freezes the sender's
name into history, this one reflects who holds the conversation right now.

### Staff awareness

When a guest message arrives while `reply_mode = 'human'`, the channel handler calls
`createNotificationDebounced()` (`lib/notifications-write.ts:90`) with a new type added
to `NOTIFICATION_TYPES`. Debounced so a guest sending five lines does not produce five
notifications. Nothing else pings the agent, so without this a taken-over conversation
can sit unanswered.

### Layer placement

| File | Responsibility |
|------|----------------|
| `supabase/migrations/<ts>_chat_session_reply_mode.sql` | New columns + partial index |
| `lib/conversation-handoff.ts` (new) | `takeOverConversation` / `handBackConversation` / `sendStaffMessage`. UI-free domain logic |
| `lib/channel-outbound.ts` (new) | `sendTextToSession` dispatcher |
| `lib/chat-sessions.ts` | Selects, row types, `reply_mode` accessor; `workspaceId` made required (preparatory commit) |
| `app/dashboard/conversations/actions.ts` | Server actions; auth via `getDashboardUser()`, session scoped via `getWorkspaceChatSession(id, workspaceId)` |
| `components/conversations-table.tsx` | Sheet UI |
| `app/_components/agent-chat.tsx` | Poll loop, suppress turn in `human` mode |
| `agent/instructions.ts` | Handoff context block |
| `agent/channels/{eve,messenger,zalo}.ts` | Skip the LLM in `human` mode |
| `messages/{en,vi}.json` | Handoff notices, banner and composer copy |

### Tenant isolation

**RLS is not the enforcing layer for this feature.** `init_schema.sql:490-493` grants
`authenticated` only `select` on `chat_sessions` / `chat_messages`; `insert, update,
delete` go to `service_role` alone, and the RLS policies at `init_schema.sql:612-623`
are select-only. Every write this feature performs therefore runs through
`createAdminClient()`, which bypasses RLS entirely. Explicit scoping in application code
is the only control, so it is specified here as testable requirements rather than an
assumption.

**T1 — `workspaceId` is a required argument, never a default.** Applies to the new
functions in `lib/conversation-handoff.ts` and `lib/channel-outbound.ts`, and is also
applied retroactively to `lib/chat-sessions.ts` as the first step of the work — see
below.

#### Preparatory change: remove the Pilot fallbacks from `lib/chat-sessions.ts`

Six functions currently default the tenant to the Pilot workspace when the caller omits
it: `listChatSessionsForActor` (`:173`), `createChatSession` (`:204`),
`claimVisitorSessions` (`:243`), `getChatSessionForActor` (`:258`),
`listWorkspaceChatSessions` (`:540`) and `getWorkspaceChatSession` (`:557`). A forgotten
argument does not fail — it silently reads or writes the Pilot workspace, which is the
exact silent fallback `.claude/rules/architecture.md` forbids. This feature adds several
new callers, so the trap gets more chances to fire.

All eight existing call sites already pass `workspaceId` explicitly:
`lib/conversations-dashboard.ts:69`, `lib/manage-link.ts:65`,
`app/api/chat/forget/route.ts:37`, `app/api/chat/sessions/route.ts:15` and `:37`,
`app/api/chat/sessions/[id]/route.ts:23`, and
`app/api/chat/sessions/[id]/messages/route.ts:25` and `:54`.
`getWorkspaceChatSession` has no caller outside the module at all.

Nothing depends on the defaults, so making `workspaceId` required is a type-level
change with no behavioural change and no call-site edits expected. `npm run typecheck`
proves it: if it passes, every caller was already explicit. Do this first, as its own
commit, so the rest of the feature is built on a signature that cannot silently
mistarget a tenant.

**T2 — the workspace comes from the server session.** `getDashboardUser()` →
`profiles.workspace_id`. Never a form field, route param, or request body. The
conversation id supplied by the client is a lookup key, never an authority.

**T3 — a null workspace is a hard error.** `chat_sessions.workspace_id` is nullable
(`init_schema.sql:360`, `on delete set null`). `takeOverConversation`,
`handBackConversation` and `sendStaffMessage` reject a session whose `workspace_id` is
null with a typed error. They never fall back to a default.

**T4 — outbound credentials derive from the session row.** `sendTextToSession` takes the
`ChatSessionRow` and reads `session.workspace_id` itself; it does **not** accept a
`workspaceId` argument from its caller. The credential helpers all take the workspace as
a plain positional argument (`getMessengerCredentialsForWorkspace(workspaceId)`,
`getZaloCredentialsForWorkspace(workspaceId)`, and `getChannelConnection(workspaceId,
provider)` beneath them), so a caller passing the wrong one would push tenant A's reply
through tenant B's page token. Removing the parameter removes the mistake.

**T5 — the take-over update carries `workspace_id` in its `WHERE`,** not just `id`. The
conditional update in the state machine above already does; it is non-negotiable.

**T6 — handoff context is workspace-scoped.** `chatSessionId` reaches
`agent/instructions.ts` from the client-supplied `x-eve-chat-session` header. The
handoff block resolves the tenant with `resolveWorkspaceIdFromAgentContext()` and then
loads the transcript via `getWorkspaceChatSession(sessionId, workspaceId)` — never a
bare session-id read, which would be a new unowned read path into another tenant's
conversation.

**T7 — notifications carry the session's workspace.** `createNotificationDebounced()`
receives `session.workspace_id`, so a taken-over conversation never lands in another
tenant's inbox.

The guest-side poll needs no new rule: `GET /api/chat/sessions/[id]/messages` already
runs `getChatSessionForActor()`, which combines `.eq("workspace_id", ...)` with
`actorOwnsSession()`. A forged `?w=` fails closed because the session is not in the
named workspace.

## Testing

The repo runs vitest `^4.1.10` (`npm test` → `vitest run`), with channel coverage
already in `agent/messenger-channel.test.ts`, `agent/zalo-channel.test.ts` and
`lib/zalo.test.ts` to model on.

Note: `.claude/rules/architecture.md` claims there is no automated test suite. That is
stale and should be corrected separately.

Unit / integration, no browser needed:

1. **Take over is atomic** — two concurrent calls; exactly one succeeds, the second
   returns the "already claimed" error.
2. **Hand back clears the claim** and restores `reply_mode = 'ai'`.
3. **`human` mode skips the LLM** — a Messenger and a Zalo inbound both store the guest
   message and never call `args.send()`.
4. **`sendTextToSession` dispatches correctly** — Messenger session hits
   `sendMessengerText`, Zalo hits `sendZaloText`, `channel = null` hits neither and
   still persists, an unknown non-null channel throws.
5. **Message ordering and shape** — a staff message persists with `role: "assistant"`,
   `eve_message_id: null`, `raw.sentBy === "staff"`, and sorts correctly through
   `compareChatMessagesChronological()`.
6. **Send failure keeps the message** — a rejecting platform send leaves the row in
   `chat_messages` and surfaces a typed error.
7. **Sending requires `human` mode** — the action rejects while `reply_mode = 'ai'`.
8. **Handoff context is bounded** — 30 staff messages in, at most 10 (and ≤2000 chars)
   reach the prompt.
9. **Tenant isolation** — one test per requirement above, since RLS will not catch a
   regression here:
   - staff of workspace B cannot take over, read, or reply to a workspace A session;
   - a session with `workspace_id = null` is rejected by all three actions (T3);
   - `sendTextToSession` on a workspace A session loads workspace A's connection, and
     the function exposes no way to pass a different workspace (T4);
   - the take-over update does not match a row when the workspace differs, even with
     the correct session id (T5);
   - the handoff-context loader returns nothing for a session id outside the resolved
     workspace (T6);
   - the inbound notification is written with the session's `workspace_id` (T7).

## Verification

Manual, following `.claude/skills/test-feature`, on top of the automated suite:

1. Guest opens `/b/[slug]`, sends a message, gets an agent reply.
2. Staff open the conversation, press Take over. Within ~10s the guest sees "A team
   member has joined" and the agent stops answering.
3. Staff send a message; the guest receives it, badged as staff in the dashboard.
4. Guest replies; staff get a notification and see the message, with no agent reply.
5. Staff hand back; the guest sees the return notice.
6. Guest asks something referencing what the human promised; the agent's answer is
   consistent with it.
7. Repeat 2–6 over Zalo using `npm run zalo:sim`.
8. Confirm a second workspace's staff cannot see or touch that conversation.
9. `npm run typecheck`, `npm test`, and `npm run doctor` after the UI work.

## Risks

- **~10s takeover latency on web.** One trailing agent reply can land after staff press
  Take over. Accepted; the alternative costs held-open connections or an anon RLS hole.
- **Platform messaging windows.** A reply outside Messenger's 24-hour window or Zalo's
  equivalent will fail. Mitigated by surfacing the error inline rather than reporting a
  false success. The window is not tracked or displayed pre-emptively in this iteration.
- **Conversations left in `human` mode.** With no auto-handback, staff can strand a
  conversation with nobody answering. Mitigated by the claimed badge in the list, the
  filter for human-held conversations, and inbound notifications.
- **Handoff context grows the prompt.** Capped at 10 messages / 2000 characters.
- **Two staff replying at once.** Deliberately allowed; both messages send. The banner
  showing the current holder is the only guard.
- **The poll runs the subscription check every tick.** `getChatWorkspaceId()`
  (`lib/chat-api.ts:41`) is the deliberate subscription chokepoint for `app/api/chat/**`
  and calls `assertWorkspaceSubscriptionActive()` on every request, so a 10s poll means
  a workspace lookup plus a subscription check per open widget per tick. Two
  consequences: measurable load once many guests are chatting, and a workspace whose
  subscription lapses mid-takeover leaves the guest silently no longer receiving staff
  replies (the poll starts returning 402). Acceptable for this iteration — the same
  gate already stops the agent answering — but if the poll is ever widened or its
  interval shortened, cache the check rather than repeating it.
- **Writes bypass RLS by construction.** Since `authenticated` holds no write grant on
  these tables, correctness rests entirely on the T1–T7 scoping rules and their tests.
  A future contributor adding a query without `.eq("workspace_id", ...)` gets no
  database-level backstop.

## Follow-ups (explicitly out of scope)

- Move `agent/channels/{messenger,zalo}.ts` onto `lib/channel-outbound.ts`.
- Correct the stale "no automated test suite" claim in `.claude/rules/architecture.md`.
- Track and display remaining platform messaging window before staff type a reply.
