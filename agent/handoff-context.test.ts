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

describe("humanModeHoldingPrompt", () => {
  it("returns the holding prompt and ignores workspace context in human mode", async () => {
    const { humanModeHoldingPrompt } = await import("./instructions");

    const out = humanModeHoldingPrompt();

    expect(out).toContain("will respond shortly");
    expect(out).not.toContain("FAQ");
  });
});
