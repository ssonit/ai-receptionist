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
