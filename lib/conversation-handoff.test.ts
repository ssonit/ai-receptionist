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
  getWorkspaceChatSession: vi.fn(),
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
  getWorkspaceChatSession: mocks.getWorkspaceChatSession,
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
