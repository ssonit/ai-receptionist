import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "session-1";

const mocks = vi.hoisted(() => ({
  getChatSessionForActor: vi.fn(),
  getChatMessagesPage: vi.fn(),
  countChatMessages: vi.fn(),
}));

vi.mock("@/lib/chat-sessions", () => ({
  CHAT_MESSAGE_INITIAL_LIMIT: 20,
  countChatMessages: mocks.countChatMessages,
  getChatMessagesPage: mocks.getChatMessagesPage,
  getChatSessionForActor: mocks.getChatSessionForActor,
  toClientSession: (session: Record<string, unknown>) => session,
  updateChatSessionState: vi.fn(),
}));

vi.mock("@/lib/chat-api", () => ({
  chatErrorResponse: (error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
  getChatActor: async () => ({ visitorId: "visitor-1", userId: null }),
  getChatWorkspaceId: async () => "workspace-a",
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

const { GET } = await import("./route");

describe("GET /api/chat/sessions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getChatSessionForActor.mockResolvedValue({
      id: SESSION_ID,
      guest_visible_after: "2026-08-06T09:00:00.000Z",
    });
    mocks.getChatMessagesPage.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });
    mocks.countChatMessages.mockResolvedValue(0);
  });

  it("filters guest-visible history using the restart watermark", async () => {
    const res = await GET(
      new Request(`http://localhost/api/chat/sessions/${SESSION_ID}`),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.getChatMessagesPage).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        visibleAfter: "2026-08-06T09:00:00.000Z",
      }),
    );
    expect(mocks.countChatMessages).toHaveBeenCalledWith(SESSION_ID, {
      visibleAfter: "2026-08-06T09:00:00.000Z",
    });
  });
});
