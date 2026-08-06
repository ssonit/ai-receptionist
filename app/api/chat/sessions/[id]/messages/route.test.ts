/**
 * Web-guest persist route. Every lib boundary is mocked, so this runs without
 * a database — what it proves is the staff-awareness gate.
 *
 * Regression coverage: when staff take a conversation over the widget posts
 * the guest's message straight here and the agent never runs, so this route is
 * the only thing that can tell staff a guest replied. The messenger and zalo
 * handlers already notify (agent/messenger-channel.test.ts); the web channel
 * used to stay silent, which is the surface most guests actually use.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const WS_A = "workspace-a";
const SESSION_ID = "session-1";

const mocks = vi.hoisted(() => ({
  getChatSessionForActor: vi.fn(),
  getChatMessagesAfter: vi.fn(),
  getChatMessagesPage: vi.fn(),
  upsertChatMessages: vi.fn(),
  updateChatSessionState: vi.fn(),
  createNotificationDebounced: vi.fn(),
  checkAgentRateLimit: vi.fn(),
}));

vi.mock("@/lib/chat-sessions", () => ({
  CHAT_MESSAGE_PAGE_LIMIT: 30,
  getChatMessagesAfter: mocks.getChatMessagesAfter,
  getChatMessagesPage: mocks.getChatMessagesPage,
  getChatSessionForActor: mocks.getChatSessionForActor,
  messageCursorFromRow: vi.fn(),
  titleFromFirstUserMessage: (content: string) => content.slice(0, 40),
  updateChatSessionState: mocks.updateChatSessionState,
  upsertChatMessages: mocks.upsertChatMessages,
}));
vi.mock("@/lib/chat-api", () => ({
  chatErrorResponse: (error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
  getChatActor: async () => ({ visitorId: "visitor-1", userId: null }),
  getChatWorkspaceId: async () => WS_A,
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));
vi.mock("@/lib/dashboard-access", () => ({
  DASHBOARD_PATH: { conversations: "/dashboard/conversations" },
}));
vi.mock("@/lib/notifications-write", () => ({
  createNotificationDebounced: mocks.createNotificationDebounced,
}));
vi.mock("@/lib/agent-rate-limit", () => ({
  checkAgentRateLimit: mocks.checkAgentRateLimit,
  clientIpFromRequest: () => "203.0.113.1",
}));

const { GET, POST } = await import("./route");

function session(replyMode: "ai" | "human", workspaceId: string | null = WS_A) {
  return {
    id: SESSION_ID,
    workspace_id: workspaceId,
    title: "New chat",
    reply_mode: replyMode,
    guest_visible_after: "2026-08-06T09:00:00.000Z",
  };
}

function post(
  messages: { role: string; content: string }[],
  mode?: "staff",
) {
  return POST(
    new Request(
      `http://localhost/api/chat/sessions/${SESSION_ID}/messages?w=acme`,
      {
        method: "POST",
        body: JSON.stringify(mode ? { mode, messages } : { messages }),
      },
    ),
    { params: Promise.resolve({ id: SESSION_ID }) },
  );
}

describe("POST /api/chat/sessions/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateChatSessionState.mockResolvedValue(null);
    mocks.createNotificationDebounced.mockResolvedValue("notification-1");
    mocks.checkAgentRateLimit.mockResolvedValue({ ok: true });
    mocks.getChatMessagesAfter.mockResolvedValue([]);
    mocks.getChatMessagesPage.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("passes guest visibility watermark when loading paged messages", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("ai"));

    const res = await GET(
      new Request(
        `http://localhost/api/chat/sessions/${SESSION_ID}/messages?before=cursor-1`,
      ),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.getChatMessagesPage).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        before: "cursor-1",
        visibleAfter: "2026-08-06T09:00:00.000Z",
      }),
    );
  });

  it("passes guest visibility watermark when polling after cursor", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("ai"));

    const res = await GET(
      new Request(
        `http://localhost/api/chat/sessions/${SESSION_ID}/messages?after=cursor-2`,
      ),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.getChatMessagesAfter).toHaveBeenCalledWith(
      SESSION_ID,
      "cursor-2",
      30,
      { visibleAfter: "2026-08-06T09:00:00.000Z" },
    );
  });

  it("notifies staff when a guest replies to a conversation they took over", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human"));

    const res = await post([{ role: "user", content: "are you still there?" }]);

    expect(res.status).toBe(200);
    expect(mocks.upsertChatMessages).toHaveBeenCalledOnce();
    expect(mocks.createNotificationDebounced).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "conversation_needs_reply",
        workspaceId: WS_A,
        entityType: "chat_session",
        entityId: SESSION_ID,
        href: `/dashboard/conversations?session=${SESSION_ID}`,
      }),
    );
  });

  it("stays quiet while the agent is answering", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("ai"));

    await post([{ role: "user", content: "hello" }]);

    expect(mocks.createNotificationDebounced).not.toHaveBeenCalled();
  });

  it("does not notify when the batch carries no guest message", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human"));

    await post([{ role: "assistant", content: "a teammate will reply" }]);

    expect(mocks.createNotificationDebounced).not.toHaveBeenCalled();
  });

  it("stores nothing when staff handed back before the post landed", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("ai"));

    const res = await post([{ role: "user", content: "still there?" }], "staff");

    // Storing here would strand the message: no agent turn ran for it, and the
    // human-mode notification does not fire either.
    expect(mocks.upsertChatMessages).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({
      stored: false,
      replyMode: "ai",
    });
  });

  it("stores a staff-mode message while the conversation is still human-held", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human"));

    const res = await post([{ role: "user", content: "hi" }], "staff");

    expect(res.status).toBe(200);
    expect(mocks.upsertChatMessages).toHaveBeenCalledOnce();
    expect(mocks.createNotificationDebounced).toHaveBeenCalledOnce();
  });

  it("rate limits staff-mode posts, which no agent turn gates", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human"));
    mocks.checkAgentRateLimit.mockResolvedValue({
      ok: false,
      errorCode: "agent_rate_limited",
    });

    const res = await post([{ role: "user", content: "spam" }], "staff");

    expect(res.status).toBe(429);
    expect(mocks.upsertChatMessages).not.toHaveBeenCalled();
  });

  it("leaves ordinary agent-turn persists unmetered", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("ai"));

    await post([{ role: "assistant", content: "sure thing" }]);

    expect(mocks.checkAgentRateLimit).not.toHaveBeenCalled();
    expect(mocks.upsertChatMessages).toHaveBeenCalledOnce();
  });

  it("does not notify a session that lost its workspace", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human", null));

    await post([{ role: "user", content: "hello?" }]);

    expect(mocks.createNotificationDebounced).not.toHaveBeenCalled();
  });
});
