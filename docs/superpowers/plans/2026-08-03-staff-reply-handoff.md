# Staff Reply & Human Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let workspace staff take a conversation away from the agent, reply to the guest by hand on web chat / Messenger / Zalo, and hand it back without the agent contradicting what they said.

**Architecture:** A `reply_mode` column on `chat_sessions` gates whether the agent answers. Staff actions live in `lib/conversation-handoff.ts` and dispatch outbound text through a new `lib/channel-outbound.ts`. The three channel handlers skip the LLM while `reply_mode = 'human'`; the guest web widget learns about it through a 10s poll and suppresses its own agent turn. On hand back, the human exchange is injected into the agent's system prompt.

**Tech Stack:** Next.js (App Router, Server Actions), Supabase (Postgres + service-role writes), eve agent, vitest 4, next-intl-style JSON catalogs.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-08-03-staff-reply-handoff-design.md`. Every task's requirements implicitly include this section.

- **RLS does not protect this feature.** `authenticated` holds `select` only on `chat_sessions` / `chat_messages`; all writes run through `createAdminClient()` (service role) and bypass RLS. Explicit `workspace_id` scoping in application code is the sole control.
- **T1** — `workspaceId` is a required argument, never a default.
- **T2** — the workspace comes from the server session (`getDashboardUser()` → `profiles.workspace_id`). Never from a form field, route param, or request body.
- **T3** — a session with `workspace_id = null` is rejected with a typed error, never defaulted.
- **T4** — `sendTextToSession` reads `session.workspace_id` itself and accepts **no** `workspaceId` argument.
- **T5** — the take-over update carries `workspace_id` in its `WHERE`, not just `id`.
- **T6** — handoff context loads via `getWorkspaceChatSession(sessionId, workspaceId)`, never a bare session-id read.
- **T7** — notifications are written with `session.workspace_id`.
- **Order of operations:** write to `chat_messages` first, then dispatch to the platform. A failed send must leave the message visible with an error, never vanish.
- **Staff messages** are stored as `role: "assistant"` with `eve_message_id: null` and `raw = { sentBy: "staff", staffUserId, staffName }`. Handoff notices are `role: "system"` with `raw = { kind: "handoff", direction: "to_human" | "to_ai" }`.
- **Guest-facing copy** goes in `messages/en.json` + `messages/vi.json` and renders in the workspace reply locale via `getWorkspaceReplyLocale()` + `createTranslator()`. Dashboard sheet copy stays as plain English literals — `components/conversations-table.tsx` does not use the catalog and this work does not change that.
- **No `using (true)` RLS** on tenant tables, ever.
- After React/UI edits run `npm run doctor`. After code edits run `graphify update .`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `supabase/migrations/20260803000001_chat_session_reply_mode.sql` | New columns + partial index |
| `lib/chat-sessions.ts` (modify) | Row types, selects, required `workspaceId`, `getChatMessagesAfter` |
| `lib/channel-outbound.ts` (create) | `sendTextToSession` — the only place that maps a session to a platform send |
| `lib/conversation-handoff.ts` (create) | `takeOverConversation` / `handBackConversation` / `sendStaffMessage` |
| `lib/errors/app-codes.ts`, `app-messages.ts` (modify) | Three new codes + copy |
| `agent/channels/{eve,messenger,zalo}.ts` (modify) | Skip the LLM in human mode; notify staff of inbound |
| `agent/instructions.ts` (modify) | Handoff context block |
| `app/dashboard/conversations/actions.ts` (create) | Server actions; auth + workspace resolution |
| `app/api/dashboard/conversations/[id]/route.ts` (modify) | Expose `reply_mode`, `claimed_by`, `claimedByName` |
| `app/api/chat/sessions/[id]/messages/route.ts` (modify) | `after` cursor + `reply_mode` in response |
| `components/conversations-table.tsx` (modify) | Banner, take-over button, composer |
| `app/_components/agent-chat.tsx` (modify) | Poll loop, suppress turn in human mode |
| `messages/{en,vi}.json` (modify) | Two guest-facing handoff notices |

---

### Task 1: Require an explicit `workspaceId` in `lib/chat-sessions.ts`

Six functions silently default the tenant to the Pilot workspace. Nothing depends on that default — all eight call sites already pass `workspaceId` — so removing it is a type-level change that turns a silent mistarget into a compile error. Do it first so everything after is built on a safe signature.

**Files:**
- Modify: `lib/chat-sessions.ts:166`, `:196`, `:234`, `:248`, `:376`, `:539`, `:555`

**Interfaces:**
- Consumes: nothing.
- Produces: `listChatSessionsForActor`, `createChatSession`, `claimVisitorSessions`, `getChatSessionForActor`, `updateChatSessionState` all take `workspaceId: string` (required, in their input object). `listWorkspaceChatSessions(workspaceId: string, limit?: number)` and `getWorkspaceChatSession(id: string, workspaceId: string)` take it positionally with no default.

- [ ] **Step 1: Make the six signatures required**

In `lib/chat-sessions.ts`, change each `workspaceId?: string` in an input object to `workspaceId: string`, and drop the two positional defaults:

```ts
// :166 listChatSessionsForActor, :196 createChatSession,
// :234 claimVisitorSessions, :248 getChatSessionForActor,
// :376 updateChatSessionState — in each input type:
  workspaceId: string;   // was: workspaceId?: string;

// :539
export async function listWorkspaceChatSessions(
  workspaceId: string,
  limit = 100,
): Promise<ChatSessionListItem[]> {

// :555
export async function getWorkspaceChatSession(
  id: string,
  workspaceId: string,
): Promise<ChatSessionRow | null> {
```

- [ ] **Step 2: Delete the fallback expressions in the bodies**

Replace every `input.workspaceId ?? getDefaultWorkspaceId()` with `input.workspaceId`, and every bare `workspaceId ?? getDefaultWorkspaceId()` with `workspaceId`. There are four in the input-object functions (`:173`, `:204`, `:243`, `:258`); the two positional ones lose their default in Step 1 and need no body change.

- [ ] **Step 3: Remove the now-unused import**

`getDefaultWorkspaceId` should have no remaining references in this file. Delete it from the `@/lib/workspace` import on `:11`. If your editor reports it still in use, a fallback was missed — go back to Step 2.

- [ ] **Step 4: Prove no call site depended on the default**

Run: `npm run typecheck`
Expected: PASS with zero errors. A pass is the proof that all eight call sites (`lib/conversations-dashboard.ts:69`, `lib/manage-link.ts:65`, `app/api/chat/forget/route.ts:37`, `app/api/chat/sessions/route.ts:15` and `:37`, `app/api/chat/sessions/[id]/route.ts:23`, `app/api/chat/sessions/[id]/messages/route.ts:25` and `:54`) were already explicit.

If it fails, do **not** add a default back. Fix the call site to pass the workspace it actually means — that error is the bug this task exists to surface.

- [ ] **Step 5: Run the existing suite**

Run: `npm test`
Expected: PASS. No test mocks these signatures by shape, so this should be green with no test edits.

- [ ] **Step 6: Commit**

```bash
git add lib/chat-sessions.ts
git commit -m "refactor(chat): require explicit workspaceId, drop Pilot fallbacks"
```

---

### Task 2: Add `reply_mode` to the schema and row types

**Files:**
- Create: `supabase/migrations/20260803000001_chat_session_reply_mode.sql`
- Modify: `lib/chat-sessions.ts:13-62` (types), `:109-117` (selects)

**Interfaces:**
- Consumes: Task 1's required-`workspaceId` signatures.
- Produces: `ChatSessionRow` gains `reply_mode: ChatSessionReplyMode`, `claimed_by: string | null`, `claimed_at: string | null`. `ChatSessionListItem` gains `reply_mode` only. New exported type `ChatSessionReplyMode = "ai" | "human"`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260803000001_chat_session_reply_mode.sql
-- Who is answering a conversation, independent of whether it is open or closed.

alter table public.chat_sessions
  add column reply_mode text not null default 'ai'
    check (reply_mode in ('ai', 'human')),
  add column claimed_by uuid references auth.users (id) on delete set null,
  add column claimed_at timestamptz;

comment on column public.chat_sessions.reply_mode is
  'ai = the agent answers; human = a staff member has taken over';
comment on column public.chat_sessions.claimed_by is
  'Informational: who pressed Take over. Not a lock — teammates may still reply';

-- Serves the dashboard filter "conversations a human is handling", the only
-- query that selects on reply_mode.
create index chat_sessions_workspace_reply_mode_idx
  on public.chat_sessions (workspace_id, reply_mode)
  where reply_mode = 'human';
```

No RLS or grant changes: writes already belong to `service_role` alone, and the existing select policies cover the new columns.

- [ ] **Step 2: Apply it**

Run: `npx supabase db reset`
Expected: completes without error, seed data loads.

- [ ] **Step 3: Add the type and extend the row types**

In `lib/chat-sessions.ts`, next to `ChatSessionStatus` on `:13`:

```ts
export type ChatSessionStatus = "active" | "closed";
export type ChatSessionReplyMode = "ai" | "human";
```

Add to `ChatSessionRow` (`:15`):

```ts
  reply_mode: ChatSessionReplyMode;
  claimed_by: string | null;
  claimed_at: string | null;
```

Add `"reply_mode"` to the `Pick<...>` union in `ChatSessionListItem` (`:49`).

- [ ] **Step 4: Extend the three select constants**

```ts
const SESSION_LIST_SELECT =
  "id, title, status, reply_mode, eve_session_id, visitor_id, user_id, channel, external_user_id, last_message_at, created_at, updated_at";

const SESSION_AUTH_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, reply_mode, claimed_by, claimed_at, continuation_token, stream_index, channel, external_user_id, last_message_at, created_at, updated_at";

const SESSION_FULL_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, reply_mode, claimed_by, claimed_at, continuation_token, stream_index, events, channel, external_user_id, last_message_at, created_at, updated_at";
```

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: PASS. `ConversationListRow` extends `ChatSessionListItem`, so the added field is additive and needs no downstream edit.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260803000001_chat_session_reply_mode.sql lib/chat-sessions.ts
git commit -m "feat(chat): add reply_mode and claim columns to chat_sessions"
```

---

### Task 3: `lib/channel-outbound.ts` — one place that sends text to a session

**Files:**
- Create: `lib/channel-outbound.ts`
- Create: `lib/channel-outbound.test.ts`

**Interfaces:**
- Consumes: `ChatSessionRow` from Task 2.
- Produces: `sendTextToSession(session: ChatSessionRow, text: string): Promise<void>`. Throws `Error("SESSION_NO_WORKSPACE")`, `Error("SESSION_NO_EXTERNAL_ID")`, or `Error("UNKNOWN_CHANNEL")`; propagates `MESSENGER_NOT_CONFIGURED` / `ZALO_NOT_CONFIGURED` and platform send failures unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// lib/channel-outbound.test.ts
/**
 * Every lib boundary is mocked, so this runs without a database or network.
 * What it proves is dispatch and tenant scoping — a wrong workspace here
 * would push one tenant's reply through another tenant's page token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSessionRow } from "@/lib/chat-sessions";

const mocks = vi.hoisted(() => ({
  getMessengerCredentialsForWorkspace: vi.fn(),
  getZaloCredentialsForWorkspace: vi.fn(),
  sendMessengerText: vi.fn(),
  sendZaloText: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  getMessengerCredentialsForWorkspace: mocks.getMessengerCredentialsForWorkspace,
  getZaloCredentialsForWorkspace: mocks.getZaloCredentialsForWorkspace,
}));
vi.mock("@/lib/messenger", () => ({ sendMessengerText: mocks.sendMessengerText }));
vi.mock("@/lib/zalo", () => ({ sendZaloText: mocks.sendZaloText }));

function session(overrides: Partial<ChatSessionRow> = {}): ChatSessionRow {
  return {
    id: "sess-1",
    workspace_id: "ws-a",
    eve_session_id: null,
    visitor_id: "v1",
    user_id: null,
    title: "Chat",
    status: "active",
    reply_mode: "human",
    claimed_by: null,
    claimed_at: null,
    continuation_token: null,
    stream_index: 0,
    events: [],
    channel: null,
    external_user_id: null,
    last_message_at: null,
    created_at: "2026-08-03T00:00:00.000Z",
    updated_at: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMessengerCredentialsForWorkspace.mockResolvedValue({
    pageId: "page-a",
    pageAccessToken: "mtok-a",
  });
  mocks.getZaloCredentialsForWorkspace.mockResolvedValue({
    oaId: "oa-a",
    accessToken: "ztok-a",
  });
});

describe("sendTextToSession", () => {
  it("is a no-op for a web session", async () => {
    const { sendTextToSession } = await import("./channel-outbound");
    await sendTextToSession(session({ channel: null }), "hi");

    expect(mocks.sendMessengerText).not.toHaveBeenCalled();
    expect(mocks.sendZaloText).not.toHaveBeenCalled();
  });

  it("sends Messenger text with that workspace's credentials", async () => {
    const { sendTextToSession } = await import("./channel-outbound");
    await sendTextToSession(
      session({ channel: "messenger", external_user_id: "psid-1" }),
      "hi",
    );

    expect(mocks.getMessengerCredentialsForWorkspace).toHaveBeenCalledWith("ws-a");
    expect(mocks.sendMessengerText).toHaveBeenCalledWith("mtok-a", "psid-1", "hi");
    expect(mocks.sendZaloText).not.toHaveBeenCalled();
  });

  it("sends Zalo text with that workspace's credentials", async () => {
    const { sendTextToSession } = await import("./channel-outbound");
    await sendTextToSession(
      session({ channel: "zalo", external_user_id: "user_1" }),
      "chào bạn",
    );

    expect(mocks.getZaloCredentialsForWorkspace).toHaveBeenCalledWith("ws-a");
    expect(mocks.sendZaloText).toHaveBeenCalledWith("ztok-a", "user_1", "chào bạn");
  });

  it("refuses a session with no workspace instead of defaulting (T3)", async () => {
    const { sendTextToSession } = await import("./channel-outbound");
    await expect(
      sendTextToSession(
        session({ channel: "zalo", external_user_id: "user_1", workspace_id: null }),
        "hi",
      ),
    ).rejects.toThrow("SESSION_NO_WORKSPACE");

    expect(mocks.sendZaloText).not.toHaveBeenCalled();
  });

  it("throws on an unrecognised channel rather than reporting success", async () => {
    const { sendTextToSession } = await import("./channel-outbound");
    await expect(
      sendTextToSession(
        session({ channel: "whatsapp", external_user_id: "x" }),
        "hi",
      ),
    ).rejects.toThrow("UNKNOWN_CHANNEL");
  });

  it("propagates a platform send failure", async () => {
    mocks.sendZaloText.mockRejectedValue(new Error("zalo 429"));
    const { sendTextToSession } = await import("./channel-outbound");

    await expect(
      sendTextToSession(
        session({ channel: "zalo", external_user_id: "user_1" }),
        "hi",
      ),
    ).rejects.toThrow("zalo 429");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/channel-outbound.test.ts`
Expected: FAIL — cannot resolve `./channel-outbound`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/channel-outbound.ts
/**
 * The single place that maps a chat session to an outbound platform send.
 *
 * Takes the session row rather than ids on purpose: the workspace is read
 * from `session.workspace_id` here, so no caller can pass a different one and
 * push a tenant's reply through another tenant's page token (spec T4).
 */
import type { ChatSessionRow } from "@/lib/chat-sessions";
import { sendMessengerText } from "@/lib/messenger";
import {
  getMessengerCredentialsForWorkspace,
  getZaloCredentialsForWorkspace,
} from "@/lib/workspace";
import { sendZaloText } from "@/lib/zalo";

export async function sendTextToSession(
  session: ChatSessionRow,
  text: string,
): Promise<void> {
  // Web sessions have no channel: the row in chat_messages is the delivery,
  // and the guest widget's poll picks it up.
  if (!session.channel) return;

  const workspaceId = session.workspace_id;
  if (!workspaceId) throw new Error("SESSION_NO_WORKSPACE");

  const externalUserId = session.external_user_id;
  if (!externalUserId) throw new Error("SESSION_NO_EXTERNAL_ID");

  switch (session.channel) {
    case "messenger": {
      const creds = await getMessengerCredentialsForWorkspace(workspaceId);
      await sendMessengerText(creds.pageAccessToken, externalUserId, text);
      return;
    }
    case "zalo": {
      // Goes through getZaloAccessToken() inside the helper, which refreshes an
      // expired token — reading the connection row directly would not.
      const creds = await getZaloCredentialsForWorkspace(workspaceId);
      await sendZaloText(creds.accessToken, externalUserId, text);
      return;
    }
    default:
      // A non-null channel we do not know is a bug, not a web session. Failing
      // loudly beats silently reporting a delivered message.
      throw new Error("UNKNOWN_CHANNEL");
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- lib/channel-outbound.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/channel-outbound.ts lib/channel-outbound.test.ts
git commit -m "feat(channels): add sendTextToSession outbound dispatcher"
```

---

### Task 4: Take over and hand back

**Files:**
- Create: `lib/conversation-handoff.ts`
- Create: `lib/conversation-handoff.test.ts`
- Modify: `lib/errors/app-codes.ts`, `lib/errors/app-messages.ts`
- Modify: `messages/en.json`, `messages/vi.json`

**Interfaces:**
- Consumes: `sendTextToSession` (Task 3), `ChatSessionReplyMode` (Task 2).
- Produces:
  ```ts
  export type HandoffResult = { ok: true } | { ok: false; code: AppErrorCode };
  export function takeOverConversation(input: {
    sessionId: string; workspaceId: string; staffUserId: string;
  }): Promise<HandoffResult>;
  export function handBackConversation(input: {
    sessionId: string; workspaceId: string;
  }): Promise<HandoffResult>;
  ```

- [ ] **Step 1: Add the error codes and copy**

In `lib/errors/app-codes.ts`, before the closing `} as const;`:

```ts
  CONVERSATION_ALREADY_CLAIMED: "conversation_already_claimed",
  CONVERSATION_NOT_HUMAN_MODE: "conversation_not_human_mode",
  CONVERSATION_NO_WORKSPACE: "conversation_no_workspace",
```

In `lib/errors/app-messages.ts`, add matching entries to the same map the other `APP_ERROR_CODE` keys use (open the file and follow its existing shape):

```ts
  [APP_ERROR_CODE.CONVERSATION_ALREADY_CLAIMED]:
    "Someone else already took over this conversation.",
  [APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE]:
    "Take over the conversation before replying.",
  [APP_ERROR_CODE.CONVERSATION_NO_WORKSPACE]:
    "This conversation is no longer linked to a workspace.",
```

- [ ] **Step 2: Add the guest-facing notices to both catalogs**

`messages/en.json`, inside the existing `"chat"` object (it already holds `rateLimited`):

```json
    "handoffToHuman": "A team member has joined the conversation.",
    "handoffToAi": "You're chatting with the assistant again."
```

`messages/vi.json`, same keys inside `"chat"`:

```json
    "handoffToHuman": "Một nhân viên đã tham gia cuộc trò chuyện.",
    "handoffToAi": "Bạn đang trò chuyện lại với trợ lý ảo."
```

- [ ] **Step 3: Write the failing test**

```ts
// lib/conversation-handoff.test.ts
/**
 * Proves the take-over race guard and tenant scoping. The Supabase client is
 * mocked as a thin chainable so the assertions are about which filters were
 * applied, which is exactly what stops a cross-tenant write here (RLS does
 * not — every write in this feature runs as service_role).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_ERROR_CODE } from "@/lib/errors";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  filters: [] as [string, unknown][],
  maybeSingle: vi.fn(),
  upsertChatMessages: vi.fn(),
  sendTextToSession: vi.fn(),
  getWorkspaceReplyLocale: vi.fn(),
}));

function chain() {
  const self: Record<string, unknown> = {
    update: (patch: unknown) => {
      mocks.update(patch);
      return self;
    },
    eq: (col: string, val: unknown) => {
      mocks.filters.push([col, val]);
      return self;
    },
    select: () => self,
    maybeSingle: mocks.maybeSingle,
  };
  return self;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => chain() }),
}));
vi.mock("@/lib/chat-sessions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chat-sessions")>()),
  upsertChatMessages: mocks.upsertChatMessages,
}));
vi.mock("@/lib/channel-outbound", () => ({
  sendTextToSession: mocks.sendTextToSession,
}));
vi.mock("@/lib/workspace", () => ({
  getWorkspaceReplyLocale: mocks.getWorkspaceReplyLocale,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters.length = 0;
  mocks.getWorkspaceReplyLocale.mockResolvedValue("en");
});

describe("takeOverConversation", () => {
  it("claims an unclaimed conversation and posts a handoff notice", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: null },
      error: null,
    });
    const { takeOverConversation } = await import("./conversation-handoff");

    const result = await takeOverConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
      staffUserId: "staff-1",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ reply_mode: "human", claimed_by: "staff-1" }),
    );
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith({
      sessionId: "sess-1",
      messages: [
        expect.objectContaining({
          role: "system",
          content: "A team member has joined the conversation.",
          raw: { kind: "handoff", direction: "to_human" },
        }),
      ],
    });
  });

  it("scopes the update by workspace and by current mode (T5)", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: null },
      error: null,
    });
    const { takeOverConversation } = await import("./conversation-handoff");

    await takeOverConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
      staffUserId: "staff-1",
    });

    expect(mocks.filters).toEqual([
      ["id", "sess-1"],
      ["workspace_id", "ws-a"],
      ["reply_mode", "ai"],
    ]);
  });

  it("reports ALREADY_CLAIMED when the update matches no row", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const { takeOverConversation } = await import("./conversation-handoff");

    const result = await takeOverConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
      staffUserId: "staff-2",
    });

    expect(result).toEqual({
      ok: false,
      code: APP_ERROR_CODE.CONVERSATION_ALREADY_CLAIMED,
    });
    expect(mocks.upsertChatMessages).not.toHaveBeenCalled();
  });

  it("pushes the notice to an external channel", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: "zalo" },
      error: null,
    });
    const { takeOverConversation } = await import("./conversation-handoff");

    await takeOverConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
      staffUserId: "staff-1",
    });

    expect(mocks.sendTextToSession).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "zalo" }),
      "A team member has joined the conversation.",
    );
  });

  it("uses the workspace reply locale for the notice", async () => {
    mocks.getWorkspaceReplyLocale.mockResolvedValue("vi");
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: null },
      error: null,
    });
    const { takeOverConversation } = await import("./conversation-handoff");

    await takeOverConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
      staffUserId: "staff-1",
    });

    expect(mocks.upsertChatMessages).toHaveBeenCalledWith({
      sessionId: "sess-1",
      messages: [
        expect.objectContaining({
          content: "Một nhân viên đã tham gia cuộc trò chuyện.",
        }),
      ],
    });
  });
});

describe("handBackConversation", () => {
  it("clears the claim and posts the return notice", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: null },
      error: null,
    });
    const { handBackConversation } = await import("./conversation-handoff");

    const result = await handBackConversation({
      sessionId: "sess-1",
      workspaceId: "ws-a",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        reply_mode: "ai",
        claimed_by: null,
        claimed_at: null,
      }),
    );
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith({
      sessionId: "sess-1",
      messages: [
        expect.objectContaining({
          raw: { kind: "handoff", direction: "to_ai" },
        }),
      ],
    });
  });

  it("scopes by workspace and requires human mode", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { id: "sess-1", workspace_id: "ws-a", channel: null },
      error: null,
    });
    const { handBackConversation } = await import("./conversation-handoff");

    await handBackConversation({ sessionId: "sess-1", workspaceId: "ws-a" });

    expect(mocks.filters).toEqual([
      ["id", "sess-1"],
      ["workspace_id", "ws-a"],
      ["reply_mode", "human"],
    ]);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test -- lib/conversation-handoff.test.ts`
Expected: FAIL — cannot resolve `./conversation-handoff`.

- [ ] **Step 5: Write the implementation**

```ts
// lib/conversation-handoff.ts
/**
 * Staff handoff: take a conversation from the agent, reply by hand, give it
 * back. Every function takes an explicit workspaceId and every query filters
 * on it — these tables grant writes to service_role only, so RLS will not
 * catch a mistake here (spec T1-T7).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  upsertChatMessages,
  type ChatSessionRow,
  type ChatSessionReplyMode,
} from "@/lib/chat-sessions";
import { sendTextToSession } from "@/lib/channel-outbound";
import { APP_ERROR_CODE, type AppErrorCode } from "@/lib/errors";
import { createTranslator } from "@/lib/i18n";
import { getWorkspaceReplyLocale } from "@/lib/workspace";

export type HandoffResult = { ok: true } | { ok: false; code: AppErrorCode };

const SESSION_SELECT =
  "id, workspace_id, channel, external_user_id, reply_mode, claimed_by, claimed_at";

type HandoffSession = Pick<
  ChatSessionRow,
  "id" | "workspace_id" | "channel" | "external_user_id" | "reply_mode"
>;

/**
 * Flip reply_mode only if it currently holds `from`. Zero rows back means a
 * teammate got there first — that conditional update is the whole race guard,
 * so there is no read-then-write window to lose.
 */
async function switchReplyMode(input: {
  sessionId: string;
  workspaceId: string;
  from: ChatSessionReplyMode;
  patch: Record<string, unknown>;
}): Promise<HandoffSession | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("workspace_id", input.workspaceId)
    .eq("reply_mode", input.from)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as HandoffSession | null) ?? null;
}

/** Store the notice, then push it to the platform. Order matters. */
async function postHandoffNotice(
  session: HandoffSession,
  direction: "to_human" | "to_ai",
): Promise<void> {
  const workspaceId = session.workspace_id;
  if (!workspaceId) return;

  const locale = await getWorkspaceReplyLocale(workspaceId);
  const t = createTranslator(locale);
  const content = t(
    direction === "to_human" ? "chat.handoffToHuman" : "chat.handoffToAi",
  );

  await upsertChatMessages({
    sessionId: session.id,
    messages: [{ role: "system", content, raw: { kind: "handoff", direction } }],
  });

  if (!session.channel) return;
  try {
    await sendTextToSession(session as ChatSessionRow, content);
  } catch (error) {
    // The mode already changed and the notice is stored; a failed push must
    // not roll that back or throw into the staff member's button click.
    console.error("[handoff] notice push failed", session.id, error);
  }
}

export async function takeOverConversation(input: {
  sessionId: string;
  workspaceId: string;
  staffUserId: string;
}): Promise<HandoffResult> {
  const now = new Date().toISOString();
  const session = await switchReplyMode({
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    from: "ai",
    patch: {
      reply_mode: "human",
      claimed_by: input.staffUserId,
      claimed_at: now,
    },
  });

  if (!session) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_ALREADY_CLAIMED };
  }

  await postHandoffNotice(session, "to_human");
  return { ok: true };
}

export async function handBackConversation(input: {
  sessionId: string;
  workspaceId: string;
}): Promise<HandoffResult> {
  const session = await switchReplyMode({
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    from: "human",
    patch: { reply_mode: "ai", claimed_by: null, claimed_at: null },
  });

  if (!session) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE };
  }

  await postHandoffNotice(session, "to_ai");
  return { ok: true };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- lib/conversation-handoff.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add lib/conversation-handoff.ts lib/conversation-handoff.test.ts lib/errors/app-codes.ts lib/errors/app-messages.ts messages/en.json messages/vi.json
git commit -m "feat(conversations): add take over and hand back"
```

---

### Task 5: `sendStaffMessage`

**Files:**
- Modify: `lib/conversation-handoff.ts`
- Modify: `lib/conversation-handoff.test.ts`

**Interfaces:**
- Consumes: `HandoffResult`, `sendTextToSession`, `getWorkspaceChatSession`.
- Produces:
  ```ts
  export function sendStaffMessage(input: {
    sessionId: string; workspaceId: string;
    staffUserId: string; staffName: string; text: string;
  }): Promise<HandoffResult>;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `lib/conversation-handoff.test.ts`. Add `getWorkspaceChatSession: vi.fn()` to the `mocks` object and to the `@/lib/chat-sessions` mock factory alongside `upsertChatMessages`.

```ts
describe("sendStaffMessage", () => {
  const base = {
    sessionId: "sess-1",
    workspaceId: "ws-a",
    staffUserId: "staff-1",
    staffName: "Linh",
    text: "  Let me check that for you.  ",
  };

  it("refuses while the agent still owns the conversation", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue({
      id: "sess-1", workspace_id: "ws-a", channel: null, reply_mode: "ai",
    });
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage(base);

    expect(result).toEqual({
      ok: false,
      code: APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE,
    });
    expect(mocks.upsertChatMessages).not.toHaveBeenCalled();
  });

  it("refuses a session that is not in this workspace", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue(null);
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage(base);

    expect(result).toEqual({ ok: false, code: APP_ERROR_CODE.NOT_FOUND });
    expect(mocks.getWorkspaceChatSession).toHaveBeenCalledWith("sess-1", "ws-a");
  });

  it("refuses a session with no workspace (T3)", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue({
      id: "sess-1", workspace_id: null, channel: null, reply_mode: "human",
    });
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage(base);

    expect(result).toEqual({
      ok: false,
      code: APP_ERROR_CODE.CONVERSATION_NO_WORKSPACE,
    });
  });

  it("stores a trimmed assistant message tagged as staff", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue({
      id: "sess-1", workspace_id: "ws-a", channel: null, reply_mode: "human",
    });
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage(base);

    expect(result).toEqual({ ok: true });
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith({
      sessionId: "sess-1",
      messages: [
        {
          role: "assistant",
          content: "Let me check that for you.",
          eve_message_id: null,
          raw: { sentBy: "staff", staffUserId: "staff-1", staffName: "Linh" },
        },
      ],
    });
  });

  it("stores before dispatching, and keeps the message when the send fails", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue({
      id: "sess-1", workspace_id: "ws-a", channel: "messenger",
      external_user_id: "psid-1", reply_mode: "human",
    });
    mocks.sendTextToSession.mockRejectedValue(new Error("outside 24h window"));
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage(base);

    expect(mocks.upsertChatMessages).toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      code: APP_ERROR_CODE.MESSENGER_SEND_FAILED,
    });
  });

  it("rejects an empty message", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue({
      id: "sess-1", workspace_id: "ws-a", channel: null, reply_mode: "human",
    });
    const { sendStaffMessage } = await import("./conversation-handoff");

    const result = await sendStaffMessage({ ...base, text: "   " });

    expect(result).toEqual({ ok: false, code: APP_ERROR_CODE.INVALID_INPUT });
    expect(mocks.upsertChatMessages).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/conversation-handoff.test.ts`
Expected: FAIL — `sendStaffMessage` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `lib/conversation-handoff.ts`, and extend the `@/lib/chat-sessions` import with `getWorkspaceChatSession`:

```ts
/** Map a platform send failure onto the channel's existing error code. */
function sendFailureCode(channel: string | null): AppErrorCode {
  if (channel === "messenger") return APP_ERROR_CODE.MESSENGER_SEND_FAILED;
  if (channel === "zalo") return APP_ERROR_CODE.ZALO_SEND_FAILED;
  return APP_ERROR_CODE.SAVE_FAILED;
}

export async function sendStaffMessage(input: {
  sessionId: string;
  workspaceId: string;
  staffUserId: string;
  staffName: string;
  text: string;
}): Promise<HandoffResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: APP_ERROR_CODE.INVALID_INPUT };

  // Scoped read: a session outside this workspace comes back null.
  const session = await getWorkspaceChatSession(input.sessionId, input.workspaceId);
  if (!session) return { ok: false, code: APP_ERROR_CODE.NOT_FOUND };
  if (!session.workspace_id) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NO_WORKSPACE };
  }
  if (session.reply_mode !== "human") {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE };
  }

  // Store first. A failed platform send must leave the message visible to
  // staff with an error, not disappear.
  await upsertChatMessages({
    sessionId: session.id,
    messages: [
      {
        role: "assistant",
        content: text,
        eve_message_id: null,
        raw: {
          sentBy: "staff",
          staffUserId: input.staffUserId,
          staffName: input.staffName,
        },
      },
    ],
  });

  try {
    await sendTextToSession(session, text);
  } catch (error) {
    console.error("[handoff] staff send failed", session.id, error);
    return { ok: false, code: sendFailureCode(session.channel) };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/conversation-handoff.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/conversation-handoff.ts lib/conversation-handoff.test.ts
git commit -m "feat(conversations): add sendStaffMessage"
```

---

### Task 6: Stop the agent answering in human mode

**Files:**
- Modify: `agent/channels/zalo.ts` (around `:153`), `agent/channels/messenger.ts` (around `:120`), `agent/channels/eve.ts`
- Modify: `agent/zalo-channel.test.ts`, `agent/messenger-channel.test.ts`

**Interfaces:**
- Consumes: `reply_mode` on the session row (Task 2), `createNotificationDebounced` (existing).
- Produces: no new exports. Behavioural contract: while `reply_mode === "human"`, an inbound guest message is stored and notified, and `args.send()` is never called.

- [ ] **Step 1: Write the failing test for Zalo**

Add to `agent/zalo-channel.test.ts`. Add `createNotificationDebounced: vi.fn()` to `mocks` and mock `@/lib/notifications-write` with it. `getOrCreateChannelSession` already returns the session — give it a `reply_mode`.

```ts
it("stores the message but does not run the agent in human mode", async () => {
  mocks.getOrCreateChannelSession.mockResolvedValue({
    id: "sess-1",
    workspace_id: WS_A,
    channel: "zalo",
    external_user_id: "user_1",
    reply_mode: "human",
  });
  const handler = await postHandler();
  const send = vi.fn();
  const raw = body();

  await handler(
    new Request("https://x/zalo/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-zevent-signature": sign(raw) },
    }),
    { send, waitUntil: (p: Promise<unknown>) => p },
  );

  expect(mocks.upsertChatMessages).toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(mocks.sendZaloText).not.toHaveBeenCalled();
});

it("notifies staff of an inbound message in human mode, scoped to the workspace (T7)", async () => {
  mocks.getOrCreateChannelSession.mockResolvedValue({
    id: "sess-1",
    workspace_id: WS_A,
    channel: "zalo",
    external_user_id: "user_1",
    reply_mode: "human",
  });
  const handler = await postHandler();
  const raw = body();

  await handler(
    new Request("https://x/zalo/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-zevent-signature": sign(raw) },
    }),
    { send: vi.fn(), waitUntil: (p: Promise<unknown>) => p },
  );

  expect(mocks.createNotificationDebounced).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "conversation_needs_reply",
      workspaceId: WS_A,
      entityId: "sess-1",
    }),
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- agent/zalo-channel.test.ts`
Expected: FAIL — `send` was called, and `createNotificationDebounced` was not.

- [ ] **Step 3: Add the notification type**

In `lib/notifications-write.ts:11`, add to `NOTIFICATION_TYPES`:

```ts
  "conversation_needs_reply",
```

- [ ] **Step 4: Gate the agent in the Zalo handler**

In `agent/channels/zalo.ts`, immediately after the `upsertChatMessages(...)` call that stores the inbound message (`:153`) and before `const run = await args.send(`:

```ts
        // A staff member owns this conversation: store the guest's message and
        // notify them, but never spend an LLM turn answering over the top.
        if (session.reply_mode === "human") {
          await createNotificationDebounced({
            type: "conversation_needs_reply",
            title: "New message in a conversation you took over",
            body: msg.text.slice(0, 140),
            severity: "high",
            workspaceId,
            entityType: "chat_session",
            entityId: session.id,
            href: `${DASHBOARD_PATH.conversations}?session=${session.id}`,
            windowMinutes: 5,
          });
          return;
        }
```

Import `createNotificationDebounced` from `@/lib/notifications-write` and `DASHBOARD_PATH` from `@/lib/dashboard-access`.

- [ ] **Step 5: Run the Zalo test to verify it passes**

Run: `npm test -- agent/zalo-channel.test.ts`
Expected: PASS.

- [ ] **Step 6: Repeat for Messenger**

Add the same two tests to `agent/messenger-channel.test.ts`, adapted to that file's existing request/signature helpers, and add the identical guard block to `agent/channels/messenger.ts` after its inbound `upsertChatMessages` call and before its `args.send(`. Use `channel: "messenger"` in the mocked session.

Run: `npm test -- agent/messenger-channel.test.ts`
Expected: PASS.

- [ ] **Step 7: Stamp human mode and inject a holding directive**

The web channel cannot cancel the turn: `onMessage` returns `{ auth, context }` (`node_modules/eve/docs/channels/eve.mdx:105`) and there is no cancel in that contract, nor a custom route to return early from the way Messenger and Zalo have. But `context` is the framework's documented hook for adding **request-specific context before the agent sees the user message**, which is exactly this situation.

Use both guards. They are independent and fail differently:

- `context` shapes this one message. It **augments** the prompt, so the agent still has the FAQ and its tools within reach — good, but not airtight on its own.
- The auth stamp lets `instructions.ts` (Step 9) **replace** the prompt outright, removing everything the agent could wander into.

In `onMessage`, after the rate-limit block and before the final `return { auth: base }`:

```ts
    // Going silent is not an option: the widget's idle watchdog
    // (app/_components/agent-chat.tsx:653) would fire and show the guest a
    // timeout error that is not real. So the turn runs, but held to one
    // sentence by both the context below and the prompt in instructions.ts.
    const chatSessionId = request.headers
      .get(EVE_CHAT_SESSION_HEADER)
      ?.trim();
    if (base && chatSessionId) {
      const { findChatSessionById } = await import("@/lib/chat-sessions");
      const session = await findChatSessionById(chatSessionId);
      if (session?.reply_mode === "human") {
        return {
          auth: {
            ...base,
            attributes: { ...base.attributes, replyModeHuman: "1" },
          },
          context: [
            "A human teammate is handling this conversation right now.",
            "Reply with exactly one short sentence telling the guest a team",
            "member will respond shortly. Do not answer their question, do not",
            "call any tool, and do not add anything else.",
          ].join(" "),
        };
      }
    }
```

This whole block is a safety net for the ~10s race, not the main mechanism — Task 10 Step 7 stops the widget opening a turn at all. The cost is one cheap turn producing a holding sentence instead of the agent talking over the human.

- [ ] **Step 8: Add the session lookup helper**

`getWorkspaceChatSession` needs a workspace, which this hook has not resolved yet. Add a narrow reader to `lib/chat-sessions.ts` that returns only what the check needs — `workspace_id` is deliberately **not** selected, since the caller only reads the mode and a smaller select is a smaller thing to leak:

```ts
/** Reply mode by session id, for the web channel's pre-turn check. */
export async function findChatSessionById(
  id: string,
): Promise<Pick<ChatSessionRow, "id" | "reply_mode"> | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, reply_mode")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as Pick<ChatSessionRow, "id" | "reply_mode">) ?? null;
}
```

This reads no message content and no tenant data at all — only whether a session id exists and who is answering it. It is not a new read path into another tenant's conversation, and it does not widen the existing `x-eve-chat-session` surface that `resolveWorkspaceIdFromAgentContext()` already depends on.

- [ ] **Step 9: Replace the prompt when the stamp is set**

In `agent/instructions.ts`, read the attribute the same way `lib/agent-booking-auth.ts:87` reads `agentRateLimited`, and return early **before** the FAQ, branding and handoff sections are assembled:

```ts
  if (authAttr(attrs, "replyModeHuman") === "1") {
    return [
      "A human teammate is handling this conversation right now.",
      "Reply with exactly one short sentence telling the guest a team member",
      "will respond shortly. Do not answer their question, do not call any",
      "tool, and do not add anything else.",
    ].join(" ");
  }
```

Returning early is the point: the agent gets no FAQ, no booking context and no reason to reach for a tool. This is the guard that holds if the model ignores the injected `context`.

- [ ] **Step 9b: Test both guards**

Add to `agent/handoff-context.test.ts` (or a new `agent/eve-channel.test.ts` if the channel has no test file yet):

```ts
it("returns the holding prompt and ignores workspace context in human mode", async () => {
  const { buildInstructions } = await import("./instructions");

  const out = await buildInstructions({
    attributes: { replyModeHuman: "1", chatSessionId: "sess-1" },
  });

  expect(out).toContain("will respond shortly");
  expect(out).not.toContain("FAQ");
});
```

Adapt the call to whatever `agent/instructions.ts` actually exports — the assertion that matters is that the human-mode branch returns the short prompt and none of the normal sections.

- [ ] **Step 10: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add agent lib/chat-sessions.ts lib/notifications-write.ts
git commit -m "feat(channels): skip the agent while a human owns the conversation"
```

---

### Task 7: Tell the agent what the human said

**Files:**
- Modify: `agent/instructions.ts`
- Create: `agent/handoff-context.test.ts`

**Interfaces:**
- Consumes: `getWorkspaceChatSession`, `getChatMessages`.
- Produces: `buildHandoffContext(sessionId: string, workspaceId: string): Promise<string>` — exported from `agent/instructions.ts`, returns `""` when there is nothing to add.

- [ ] **Step 1: Write the failing test**

```ts
// agent/handoff-context.test.ts
/**
 * The agent must not contradict a promise staff just made. chatSessionId
 * arrives from a client-supplied header, so the load is workspace-scoped
 * (spec T6).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceChatSession: vi.fn(),
  getChatMessages: vi.fn(),
}));

vi.mock("@/lib/chat-sessions", () => ({
  getWorkspaceChatSession: mocks.getWorkspaceChatSession,
  getChatMessages: mocks.getChatMessages,
}));

function staffMsg(content: string, at: string) {
  return {
    id: at, session_id: "sess-1", role: "assistant", content,
    eve_message_id: null, eve_event_index: 0, created_at: at,
    raw: { sentBy: "staff", staffUserId: "staff-1", staffName: "Linh" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWorkspaceChatSession.mockResolvedValue({ id: "sess-1", workspace_id: "ws-a" });
});

describe("buildHandoffContext", () => {
  it("returns empty when the session is not in this workspace (T6)", async () => {
    mocks.getWorkspaceChatSession.mockResolvedValue(null);
    const { buildHandoffContext } = await import("./instructions");

    expect(await buildHandoffContext("sess-1", "ws-b")).toBe("");
    expect(mocks.getWorkspaceChatSession).toHaveBeenCalledWith("sess-1", "ws-b");
    expect(mocks.getChatMessages).not.toHaveBeenCalled();
  });

  it("returns empty when no staff message follows the last takeover", async () => {
    mocks.getChatMessages.mockResolvedValue([
      { id: "a", role: "user", content: "hi", created_at: "1", raw: null },
      { id: "b", role: "assistant", content: "hello", created_at: "2", raw: null },
    ]);
    const { buildHandoffContext } = await import("./instructions");

    expect(await buildHandoffContext("sess-1", "ws-a")).toBe("");
  });

  it("includes staff messages sent after the takeover notice", async () => {
    mocks.getChatMessages.mockResolvedValue([
      { id: "a", role: "assistant", content: "old bot reply", created_at: "1", raw: null },
      {
        id: "b", role: "system", content: "joined", created_at: "2",
        raw: { kind: "handoff", direction: "to_human" },
      },
      staffMsg("I'll waive the fee for you.", "3"),
    ]);
    const { buildHandoffContext } = await import("./instructions");

    const out = await buildHandoffContext("sess-1", "ws-a");

    expect(out).toContain("I'll waive the fee for you.");
    expect(out).toContain("do not contradict");
    expect(out).not.toContain("old bot reply");
  });

  it("caps the block at 10 messages", async () => {
    mocks.getChatMessages.mockResolvedValue([
      {
        id: "h", role: "system", content: "joined", created_at: "0",
        raw: { kind: "handoff", direction: "to_human" },
      },
      ...Array.from({ length: 30 }, (_, i) => staffMsg(`line ${i}`, String(i + 1))),
    ]);
    const { buildHandoffContext } = await import("./instructions");

    const out = await buildHandoffContext("sess-1", "ws-a");

    expect(out).toContain("line 29");
    expect(out).not.toContain("line 19");
    expect(out.length).toBeLessThanOrEqual(2000 + 300);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- agent/handoff-context.test.ts`
Expected: FAIL — `buildHandoffContext` is not exported.

- [ ] **Step 3: Write the implementation**

Add to `agent/instructions.ts`:

```ts
const HANDOFF_MAX_MESSAGES = 10;
const HANDOFF_MAX_CHARS = 2000;

/**
 * What a staff member said while they owned this conversation.
 *
 * The eve runtime keeps its own thread keyed by continuationToken, so staff
 * messages written straight into chat_messages never reach it. Without this
 * the first turn after a hand back can contradict a promise staff just made.
 */
export async function buildHandoffContext(
  sessionId: string,
  workspaceId: string,
): Promise<string> {
  // chatSessionId comes from a client-supplied header — scope the read.
  const session = await getWorkspaceChatSession(sessionId, workspaceId);
  if (!session) return "";

  const messages = await getChatMessages(sessionId);

  let start = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const raw = messages[i]!.raw as { kind?: string; direction?: string } | null;
    if (raw?.kind === "handoff" && raw.direction === "to_human") {
      start = i;
      break;
    }
  }
  if (start === -1) return "";

  const staffLines = messages
    .slice(start + 1)
    .filter((m) => {
      const raw = m.raw as { sentBy?: string } | null;
      return raw?.sentBy === "staff" && m.content.trim();
    })
    .slice(-HANDOFF_MAX_MESSAGES)
    .map((m) => `- ${m.content.trim()}`);

  if (staffLines.length === 0) return "";

  let block = staffLines.join("\n");
  if (block.length > HANDOFF_MAX_CHARS) {
    block = block.slice(-HANDOFF_MAX_CHARS);
  }

  return [
    "A human teammate replied to this guest directly. Here is what they said.",
    "Treat it as authoritative and do not contradict it.",
    block,
  ].join("\n");
}
```

Import `getChatMessages` and `getWorkspaceChatSession` from `@/lib/chat-sessions`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- agent/handoff-context.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Wire it into the system prompt**

In `agent/instructions.ts`, find the function that assembles and returns the prompt. It already resolves the workspace and reads auth attributes; get the session id the same way `lib/agent-booking-auth.ts:89` does, then append the block where the prompt sections are joined:

```ts
  const chatSessionId = authAttr(attrs, "chatSessionId");
  const handoff =
    chatSessionId && workspaceId
      ? await buildHandoffContext(chatSessionId, workspaceId)
      : "";
```

```ts
  // …wherever the sections are combined:
  return [
    // …existing sections unchanged
    ...(handoff ? [handoff] : []),
  ].join("\n\n");
```

Place it after the workspace FAQ and branding sections so it is the most recent context the model sees. If the prompt is built by string concatenation rather than an array, append `handoff` with a blank line before it under the same non-empty guard.

- [ ] **Step 6: Run the suite and commit**

Run: `npm test`

```bash
git add agent/instructions.ts agent/handoff-context.test.ts
git commit -m "feat(agent): feed the human exchange back into the prompt after hand back"
```

---

### Task 8: Server actions and conversation detail payload

**Files:**
- Create: `app/dashboard/conversations/actions.ts`
- Modify: `app/api/dashboard/conversations/[id]/route.ts`
- Modify: `lib/conversations-dashboard.ts` (`ConversationDetail` type, `loadConversationDetail`)

**Interfaces:**
- Consumes: `takeOverConversation`, `handBackConversation`, `sendStaffMessage` (Tasks 4–5).
- Produces:
  ```ts
  export function takeOverAction(sessionId: string): Promise<{ error?: string }>;
  export function handBackAction(sessionId: string): Promise<{ error?: string }>;
  export function sendStaffMessageAction(
    sessionId: string, text: string,
  ): Promise<{ error?: string }>;
  ```
  `ConversationDetail.session` gains `reply_mode`, `claimed_by`, and `claimedByName: string | null`.

- [ ] **Step 1: Write the actions**

```ts
// app/dashboard/conversations/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  handBackConversation,
  sendStaffMessage,
  takeOverConversation,
} from "@/lib/conversation-handoff";
import { getDashboardUser } from "@/lib/dashboard-user";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { ROUTES } from "@/lib/routes";

/**
 * Workspace and identity come from the server session only — never from the
 * caller (spec T2). The sessionId argument is a lookup key, and every lib
 * function below filters on the resolved workspace.
 */
async function requireStaff() {
  const user = await getDashboardUser();
  if (!user) return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  if (!user.workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }
  return {
    workspaceId: user.workspaceId,
    staffUserId: user.userId,
    staffName: user.navUser.name,
  };
}

export async function takeOverAction(sessionId: string) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await takeOverConversation({
    sessionId,
    workspaceId: ctx.workspaceId,
    staffUserId: ctx.staffUserId,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}

export async function handBackAction(sessionId: string) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await handBackConversation({
    sessionId,
    workspaceId: ctx.workspaceId,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}

export async function sendStaffMessageAction(sessionId: string, text: string) {
  const ctx = await requireStaff();
  if ("error" in ctx) return ctx;

  const result = await sendStaffMessage({
    sessionId,
    workspaceId: ctx.workspaceId,
    staffUserId: ctx.staffUserId,
    staffName: ctx.staffName,
    text,
  });
  if (!result.ok) return { error: appErrorMessage(result.code) };

  revalidatePath(ROUTES.DASHBOARD_CONVERSATIONS);
  return {};
}
```

This file depends on a change to `getDashboardUser()` — do that first, in Step 0 below, or `staffUserId` above will not compile.

- [ ] **Step 0: Expose the auth user id from `getDashboardUser()`**

`lib/dashboard-user.ts:46` currently returns `navUser`, `workspaceId`, `workspaceSlug`, `bookingPagePath` and `role` — no user id. `claimed_by` is a `uuid` foreign key to `auth.users`, so passing an email or a display name would fail the constraint at insert time.

Add `userId` to both the return type (`:14`) and the returned object (`:46`):

```ts
export async function getDashboardUser(): Promise<{
  navUser: DashboardNavUser;
  userId: string;
  workspaceId: string | null;
  // …unchanged
} | null> {
```

```ts
  return {
    navUser: { /* unchanged */ },
    userId: user.id,
    workspaceId: profile?.workspace_id ?? null,
    // …unchanged
  };
```

Then use `staffUserId: user.userId` in `requireStaff()` above, keeping `staffName: user.navUser.name` for the `raw` tag.

- [ ] **Step 2: Resolve the claimer's display name**

In `lib/conversations-dashboard.ts`, extend `ConversationDetail["session"]` with:

```ts
    reply_mode: ChatSessionReplyMode;
    claimed_by: string | null;
    claimedByName: string | null;
```

In `loadConversationDetail`, after loading the session, resolve the name (the sheet must never receive a bare uuid):

```ts
  let claimedByName: string | null = null;
  if (session.claimed_by) {
    const { data: claimer } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", session.claimed_by)
      .maybeSingle();
    claimedByName = claimer?.full_name || claimer?.email || null;
  }
```

Include `reply_mode`, `claimed_by` and `claimedByName` in the returned `session` object, and confirm `app/api/dashboard/conversations/[id]/route.ts` passes the detail through unchanged (it should already spread it).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/conversations/actions.ts lib/conversations-dashboard.ts lib/dashboard-user.ts app/api/dashboard/conversations
git commit -m "feat(dashboard): add conversation handoff server actions"
```

---

### Task 9: Take over / reply UI in the conversation sheet

**Files:**
- Modify: `components/conversations-table.tsx:77-260` (`ConversationDetailSheet`)

**Interfaces:**
- Consumes: `takeOverAction`, `handBackAction`, `sendStaffMessageAction` (Task 8); `reply_mode`, `claimedByName` from the detail payload.
- Produces: no exports.

- [ ] **Step 1: Hold the new fields in state**

Alongside the existing `useState` calls at `:82-95`:

```tsx
  const [replyMode, setReplyMode] = React.useState<"ai" | "human">("ai");
  const [claimedByName, setClaimedByName] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
```

In the load effect (`:107-119`), add:

```tsx
        setReplyMode(data.session?.reply_mode === "human" ? "human" : "ai");
        setClaimedByName(data.session?.claimedByName ?? null);
```

- [ ] **Step 2: Extract a reload helper**

The take-over and send handlers both need to refresh the transcript. Pull the body of the existing load effect into a `reload` callback the effect also calls, so there is one fetch path rather than three copies.

- [ ] **Step 3: Add the banner and toggle**

Render above the transcript. Copy stays as English literals — this component does not use the message catalog:

```tsx
  <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
    <p className="text-sm text-muted-foreground">
      {replyMode === "human"
        ? claimedByName
          ? `Handled by ${claimedByName}`
          : "Handled by a team member"
        : "The assistant is replying"}
    </p>
    <Button
      size="sm"
      variant={replyMode === "human" ? "outline" : "default"}
      disabled={sending}
      onClick={async () => {
        setSending(true);
        setActionError(null);
        const run = replyMode === "human" ? handBackAction : takeOverAction;
        const res = await run(sessionId);
        if (res.error) setActionError(res.error);
        else await reload();
        setSending(false);
      }}
    >
      {replyMode === "human" ? "Hand back to AI" : "Take over"}
    </Button>
  </div>
```

- [ ] **Step 4: Add the composer**

Below the transcript, enabled only in human mode:

```tsx
  {replyMode === "human" && (
    <form
      className="flex items-end gap-2 border-t px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || sending) return;
        setSending(true);
        setActionError(null);
        const res = await sendStaffMessageAction(sessionId, text);
        if (res.error) {
          setActionError(res.error);
        } else {
          setDraft("");
          await reload();
        }
        setSending(false);
      }}
    >
      <textarea
        className="min-h-16 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
        placeholder="Reply to the guest…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={sending}
      />
      <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
        Send
      </Button>
    </form>
  )}
  {actionError && (
    <p className="px-4 pb-3 text-sm text-destructive">{actionError}</p>
  )}
```

- [ ] **Step 5: Badge staff messages in the transcript**

Where each message is rendered, read the sender off `raw` so history stays readable once several people have replied:

```tsx
  const staff = (message.raw as { sentBy?: string; staffName?: string } | null);
  const senderLabel =
    message.role === "assistant" && staff?.sentBy === "staff"
      ? `Staff · ${staff.staffName ?? "Team"}`
      : message.role === "assistant"
        ? "Assistant"
        : message.role === "user"
          ? "Guest"
          : message.role;
```

Render `role: "system"` rows whose `raw.kind === "handoff"` as a centered muted line rather than a normal bubble.

- [ ] **Step 6: Verify in the browser**

Run the app, open `/dashboard/conversations`, open a conversation, press Take over, send a message, press Hand back. Confirm the banner, badge and composer states all change and no console errors appear.

- [ ] **Step 7: Run react-doctor**

Run: `npm run doctor`
Expected: no new errors. Fix any it reports before continuing.

- [ ] **Step 8: Commit**

```bash
git add components/conversations-table.tsx
git commit -m "feat(dashboard): reply to a conversation from the detail sheet"
```

---

### Task 10: Deliver staff messages to the web guest

**Files:**
- Modify: `lib/chat-sessions.ts` (add `getChatMessagesAfter`)
- Modify: `app/api/chat/sessions/[id]/messages/route.ts:20-47`
- Modify: `app/_components/agent-chat.tsx`
- Create: `lib/chat-messages-after.test.ts`

**Interfaces:**
- Consumes: `reply_mode` (Task 2), handoff notices (Task 4).
- Produces: `getChatMessagesAfter(sessionId: string, after: string | null, limit?: number): Promise<ChatMessageRow[]>`. `GET /api/chat/sessions/[id]/messages?after=<cursor>` returns `{ messages, replyMode, cursor }`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/chat-messages-after.test.ts
import { describe, expect, it } from "vitest";
import { decodeMessageCursor, encodeMessageCursor } from "./chat-sessions";

describe("message cursors", () => {
  it("round-trips a cursor", () => {
    const cursor = encodeMessageCursor({ createdAt: "2026-08-03T10:00:00.000Z", id: "m1" });
    expect(decodeMessageCursor(cursor)).toEqual({
      createdAt: "2026-08-03T10:00:00.000Z",
      id: "m1",
    });
  });

  it("rejects a malformed cursor instead of throwing", () => {
    expect(decodeMessageCursor("not-a-cursor")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm test -- lib/chat-messages-after.test.ts`
Expected: PASS — these helpers already exist. This locks the cursor contract before the new reader depends on it.

- [ ] **Step 3: Add the forward reader**

In `lib/chat-sessions.ts`, next to `getChatMessagesPage`:

```ts
/**
 * Messages strictly after `after`, oldest first. The polling counterpart to
 * getChatMessagesPage's backward paging — used to pick up staff replies and
 * handoff notices that arrive outside the guest's own turn.
 */
export async function getChatMessagesAfter(
  sessionId: string,
  after: string | null,
  limit = 50,
): Promise<ChatMessageRow[]> {
  const supabase = createAdminClient();
  const cursor = after ? decodeMessageCursor(after) : null;

  let query = supabase
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (cursor) {
    query = query.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as ChatMessageRow[])
    .slice()
    .sort(compareChatMessagesChronological);
}
```

- [ ] **Step 4: Serve `after` and `replyMode` from the route**

In `app/api/chat/sessions/[id]/messages/route.ts`, inside `GET` after the existing session lookup (which already enforces ownership and workspace scoping, so no new guard is needed):

```ts
    const after = url.searchParams.get("after");
    if (after !== null) {
      const messages = await getChatMessagesAfter(id, after || null);
      const newest = messages[messages.length - 1];
      return Response.json({
        messages,
        replyMode: session.reply_mode,
        cursor: newest ? messageCursorFromRow(newest) : after,
      });
    }
```

Leave the existing `before` branch untouched, and add `replyMode: session.reply_mode` to its response object too so the widget gets the mode on first load.

- [ ] **Step 5: Poll from the widget**

In `app/_components/agent-chat.tsx`, add a `replyMode` state and an effect that polls while the document is visible and no turn is streaming:

```tsx
  const [replyMode, setReplyMode] = React.useState<"ai" | "human">("ai");
  const pollCursorRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!sessionId) return;
    const busy = agent.status === "submitted" || agent.status === "streaming";
    if (busy) return;

    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const params = new URLSearchParams({ after: pollCursorRef.current ?? "" });
        if (workspaceSlug) params.set("w", workspaceSlug);
        const res = await fetch(
          `/api/chat/sessions/${sessionId}/messages?${params}`,
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setReplyMode(data.replyMode === "human" ? "human" : "ai");
        pollCursorRef.current = data.cursor ?? pollCursorRef.current;
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          appendPolledMessages(data.messages);
        }
      } catch {
        // A dropped poll is retried on the next tick — nothing to surface.
      }
    };

    const interval = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, agent.status, workspaceSlug]);
```

`appendPolledMessages` maps rows through the existing `chatMessageRowsToEveMessages()` (`lib/chat-message-display.ts:22`) and merges them into the thread, skipping ids already present — the component already keeps a `historyIds` set at `:687` for exactly this kind of dedupe.

Include `?w=` on the fetch as the tenant-isolation rule requires for `app/api/chat/**`.

- [ ] **Step 6: Render the handoff notice in the guest thread**

The notices are `role: "system"` rows. Open `lib/chat-message-display.ts:5` and check whether `chatMessageRowToEveMessage()` keeps system rows or drops them. If it drops them, extend it to pass through rows whose `raw.kind === "handoff"` — do **not** promote them to assistant messages, which would make the guest read "A team member has joined" as something the bot said.

Render them in the thread as a centered muted line, not a chat bubble:

```tsx
  const handoff = (message.raw as { kind?: string } | null)?.kind === "handoff";
  if (handoff) {
    return (
      <p className="py-2 text-center text-xs text-muted-foreground">
        {message.content}
      </p>
    );
  }
```

- [ ] **Step 7: Suppress the guest's agent turn in human mode**

In the submit handler, when `replyMode === "human"`, persist the guest's message through the existing `POST /api/chat/sessions/[id]/messages` path and return **without** starting an agent turn. Starting one would sit in `submitted` with no events and trip the idle watchdog at `:653`, showing the guest a timeout error that is not real.

- [ ] **Step 8: Verify end to end in the browser**

Open `/b/<slug>` in one window and `/dashboard/conversations` in another. Take over from the dashboard; within ~10s the guest window shows "A team member has joined the conversation." Send a staff message; it appears for the guest. Type as the guest; no agent reply arrives and no spinner hangs. Hand back; the guest sees the return notice and the agent answers again.

Check `read_console_messages` for errors on the guest page.

- [ ] **Step 9: Run doctor, the suite and typecheck**

```bash
npm run doctor && npm test && npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add lib/chat-sessions.ts lib/chat-message-display.ts lib/chat-messages-after.test.ts app/api/chat/sessions app/_components/agent-chat.tsx
git commit -m "feat(chat): deliver staff replies to the web guest"
```

---

### Task 11: Update the graph and close out

- [ ] **Step 1: Refresh the knowledge graph**

Run: `graphify update .`

- [ ] **Step 2: Full verification pass**

```bash
npm run typecheck && npm test && npm run doctor:full && npm run build
```

Expected: all green. Fix anything that is not before opening a PR.

- [ ] **Step 3: Walk the spec's Verification list**

Work through the nine numbered steps in the spec's "Verification" section, including the Zalo pass via `npm run zalo:sim` and the two-workspace isolation check.

- [ ] **Step 4: Commit**

```bash
git add graphify-out
git commit -m "chore(graphify): update graph after staff reply handoff"
```

---

## Notes for the implementer

**Where the tenant checks actually live.** Do not add a `workspace_id` filter in the UI or the action and assume it holds. Every lib function in Tasks 3–5 filters internally, and the tests in those tasks assert the filters. If you find yourself passing a workspace id into `sendTextToSession`, stop — that parameter was removed on purpose (T4).

**The order in `sendStaffMessage` is not stylistic.** Store then dispatch. Reversing it means a message that failed to send disappears, and staff retype it not knowing whether the guest got the first one.

**`raw` is redacted on write.** `upsertChatMessages` runs `redactBookingSecretsDeep()` over `raw` (`lib/chat-sessions.ts:497`). `sentBy` / `staffUserId` / `staffName` pass through untouched, but if you add a field there, check it survives.

**Testing style.** Follow `agent/zalo-channel.test.ts`: mock every lib boundary with `vi.hoisted` + `vi.mock`, so tests run with no database and no network. What these tests prove is routing, gating and tenant scoping — which is where a bug here is most expensive.
