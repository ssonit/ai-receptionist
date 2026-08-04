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
  upsertChatMessages: vi.fn(),
  updateChatSessionState: vi.fn(),
  createNotificationDebounced: vi.fn(),
}));

vi.mock("@/lib/chat-sessions", () => ({
  CHAT_MESSAGE_PAGE_LIMIT: 30,
  getChatMessagesAfter: vi.fn(),
  getChatMessagesPage: vi.fn(),
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

const { POST } = await import("./route");

function session(replyMode: "ai" | "human", workspaceId: string | null = WS_A) {
  return {
    id: SESSION_ID,
    workspace_id: workspaceId,
    title: "New chat",
    reply_mode: replyMode,
  };
}

function post(messages: { role: string; content: string }[]) {
  return POST(
    new Request(`http://localhost/api/chat/sessions/${SESSION_ID}/messages`, {
      method: "POST",
      body: JSON.stringify({ messages }),
    }),
    { params: Promise.resolve({ id: SESSION_ID }) },
  );
}

describe("POST /api/chat/sessions/[id]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateChatSessionState.mockResolvedValue(null);
    mocks.createNotificationDebounced.mockResolvedValue("notification-1");
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

  it("does not notify a session that lost its workspace", async () => {
    mocks.getChatSessionForActor.mockResolvedValue(session("human", null));

    await post([{ role: "user", content: "hello?" }]);

    expect(mocks.createNotificationDebounced).not.toHaveBeenCalled();
  });
});
