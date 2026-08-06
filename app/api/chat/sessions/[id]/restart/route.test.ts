import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION_ID = "session-1";
const WS_A = "workspace-a";

const mocks = vi.hoisted(() => ({
  restartGuestChatSession: vi.fn(),
  getChatMessagesPage: vi.fn(),
}));

vi.mock("@/lib/chat-sessions", () => ({
  restartGuestChatSession: mocks.restartGuestChatSession,
  getChatMessagesPage: mocks.getChatMessagesPage,
  toClientSession: (session: Record<string, unknown>) => session,
}));

vi.mock("@/lib/chat-api", () => ({
  chatErrorResponse: (error: unknown) =>
    Response.json({ error: String(error) }, { status: 500 }),
  getChatActor: async () => ({ visitorId: "visitor-1", userId: null }),
  getChatWorkspaceId: async () => WS_A,
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

const { POST } = await import("./route");

describe("POST /api/chat/sessions/[id]/restart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.restartGuestChatSession.mockResolvedValue({
      id: SESSION_ID,
      guest_visible_after: "2026-08-06T09:00:00.000Z",
    });
    mocks.getChatMessagesPage.mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("resets session in place and reloads with visibility watermark", async () => {
    const res = await POST(
      new Request(`http://localhost/api/chat/sessions/${SESSION_ID}/restart`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id: SESSION_ID }) },
    );

    expect(res.status).toBe(200);
    expect(mocks.restartGuestChatSession).toHaveBeenCalledWith({
      id: SESSION_ID,
      visitorId: "visitor-1",
      userId: null,
      workspaceId: WS_A,
    });
    expect(mocks.getChatMessagesPage).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        visibleAfter: "2026-08-06T09:00:00.000Z",
      }),
    );
  });
});
