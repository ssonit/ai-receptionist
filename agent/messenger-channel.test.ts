/**
 * Messenger channel handler. Every lib boundary is mocked, so this runs
 * without a database or network — what it proves is routing, gating and
 * tenant isolation, which is where a channel bug is most expensive.
 *
 * Regression coverage for the workspace-resolution fix: the webhook used to
 * trust a `?workspace_id=` query param on a URL that is shared by every
 * connected Page, so a second workspace's messages could resolve against the
 * wrong tenant (or 400 outright if the param was missing). It now resolves
 * from the page id in the payload, mirroring how agent/channels/zalo.ts
 * resolves from oa_id.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const APP_SECRET = "test-messenger-app-secret";
const WS_A = "workspace-a";
const WS_B = "workspace-b";

const mocks = vi.hoisted(() => ({
  getChannelConnectionByExternalId: vi.fn(),
  assertWorkspaceSubscriptionActive: vi.fn(),
  getWorkspaceReplyLocale: vi.fn(),
  getMessengerCredentialsForWorkspace: vi.fn(),
  sendMessengerText: vi.fn(),
  getOrCreateChannelSession: vi.fn(),
  upsertChatMessages: vi.fn(),
  touchChannelSession: vi.fn(),
  findChatSessionByEveSessionId: vi.fn(),
  checkAgentRateLimit: vi.fn(),
}));

vi.mock("@/lib/channel-connections", () => ({
  getChannelConnectionByExternalId: mocks.getChannelConnectionByExternalId,
}));
vi.mock("@/lib/workspace", () => ({
  assertWorkspaceSubscriptionActive: mocks.assertWorkspaceSubscriptionActive,
  getWorkspaceReplyLocale: mocks.getWorkspaceReplyLocale,
  getMessengerCredentialsForWorkspace: mocks.getMessengerCredentialsForWorkspace,
}));
vi.mock("@/lib/messenger", () => ({ sendMessengerText: mocks.sendMessengerText }));
vi.mock("@/lib/chat-sessions", () => ({
  channelVisitorId: (channel: string, id: string) => `${channel}:${id}`,
  getOrCreateChannelSession: mocks.getOrCreateChannelSession,
  upsertChatMessages: mocks.upsertChatMessages,
  touchChannelSession: mocks.touchChannelSession,
  findChatSessionByEveSessionId: mocks.findChatSessionByEveSessionId,
}));
vi.mock("@/lib/agent-rate-limit", () => ({
  checkAgentRateLimit: mocks.checkAgentRateLimit,
}));

function body(pageId: string, psid: string, text: string, mid = "mid_1") {
  return JSON.stringify({
    object: "page",
    entry: [
      {
        id: pageId,
        messaging: [
          {
            sender: { id: psid },
            recipient: { id: pageId },
            timestamp: 1_800_000_000_000,
            message: { mid, text },
          },
        ],
      },
    ],
  });
}

function sign(raw: string, secret = APP_SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

/** Resolve the POST /webhook handler from the channel definition. */
async function postHandler() {
  const channel = (await import("./channels/messenger")).default;
  const route = channel.routes.find(
    (r: { method: string; path: string }) => r.method === "POST" && r.path === "/webhook",
  );
  return route!.handler as (req: Request, args: unknown) => Promise<Response>;
}

function request(raw: string, signature: string | null) {
  return new Request("https://app.example.com/webhook", {
    method: "POST",
    headers: signature
      ? { "X-Hub-Signature-256": signature, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" },
    body: raw,
  });
}

function args() {
  const sent: unknown[] = [];
  let waitUntilPromise: Promise<unknown> | null = null;
  return {
    sent,
    send: vi.fn(async (payload: unknown) => {
      sent.push(payload);
      return { id: "eve-session-1" };
    }),
    waitUntilPromise: () => waitUntilPromise ?? Promise.resolve(),
    waitUntil: (p: Promise<unknown>) => {
      waitUntilPromise = p;
    },
    requestIp: "1.2.3.4",
  };
}

beforeEach(() => {
  mocks.getChannelConnectionByExternalId.mockResolvedValue({
    workspaceId: WS_A,
    provider: "messenger",
    externalId: "page_a",
    displayName: "Page A",
    accessToken: "page-token-a",
    refreshToken: null,
    expiresAt: null,
    metadata: {},
  });
  mocks.assertWorkspaceSubscriptionActive.mockResolvedValue(undefined);
  mocks.getWorkspaceReplyLocale.mockResolvedValue("vi");
  mocks.getMessengerCredentialsForWorkspace.mockResolvedValue({
    pageId: "page_a",
    pageAccessToken: "page-token-a",
  });
  mocks.getOrCreateChannelSession.mockResolvedValue({ id: "session-1", workspace_id: WS_A });
  mocks.upsertChatMessages.mockResolvedValue(undefined);
  mocks.touchChannelSession.mockResolvedValue(undefined);
  mocks.checkAgentRateLimit.mockResolvedValue({ ok: true });
  mocks.sendMessengerText.mockResolvedValue({ messageId: "out-1" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("messenger webhook", () => {
  it("rejects a bad signature and never invokes the agent", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");

    const res = await handler(request(raw, sign(raw, "wrong-secret")), a);

    expect(res.status).toBe(401);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header", async () => {
    const handler = await postHandler();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");
    expect((await handler(request(raw, null), args())).status).toBe(401);
  });

  it("404s a page id that maps to no workspace, without falling back", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue(null);
    const handler = await postHandler();
    const a = args();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(404);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("resolves the workspace from the page id in the payload, not a URL query param", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue({
      workspaceId: WS_B,
      provider: "messenger",
      externalId: "page_b",
      displayName: "Page B",
      accessToken: "page-token-b",
      refreshToken: null,
      expiresAt: null,
      metadata: {},
    });
    const handler = await postHandler();
    const raw = body("page_b", "user_1", "đặt lịch giúp mình");
    const a = args();

    // No ?workspace_id= on the URL at all — resolution must not need it.
    await handler(request(raw, sign(raw)), a);
    await a.waitUntilPromise();

    expect(mocks.getChannelConnectionByExternalId).toHaveBeenCalledWith("messenger", "page_b");
    expect(mocks.getOrCreateChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_B, channel: "messenger" }),
    );
  });

  it("skips an event whose page id does not match the resolved connection", async () => {
    // A batch could in principle carry an entry for a different page than the
    // one resolution locked onto; it must never cross the tenant boundary.
    const handler = await postHandler();
    const a = args();
    const raw = body("page_other", "user_1", "đặt lịch giúp mình");

    await handler(request(raw, sign(raw)), a);
    await a.waitUntilPromise();

    expect(a.send).not.toHaveBeenCalled();
  });

  it("skips an inactive subscription without burning an LLM turn", async () => {
    mocks.assertWorkspaceSubscriptionActive.mockRejectedValue(new Error("inactive"));
    const handler = await postHandler();
    const a = args();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");

    const res = await handler(request(raw, sign(raw)), a);
    await a.waitUntilPromise();

    expect(res.status).toBe(200);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("tells a rate-limited guest instead of dropping the message", async () => {
    mocks.checkAgentRateLimit.mockResolvedValue({ ok: false, errorCode: "agent_rate_limited" });
    const handler = await postHandler();
    const a = args();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");

    await handler(request(raw, sign(raw)), a);
    await a.waitUntilPromise();

    expect(a.send).not.toHaveBeenCalled();
    expect(mocks.sendMessengerText).toHaveBeenCalled();
  });

  it("drives the agent and records the eve session on the happy path", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body("page_a", "user_1", "đặt lịch giúp mình");

    const res = await handler(request(raw, sign(raw)), a);
    await a.waitUntilPromise();

    expect(res.status).toBe(200);
    expect(a.send).toHaveBeenCalledWith(
      { message: "đặt lịch giúp mình" },
      expect.objectContaining({
        continuationToken: `messenger:${WS_A}:user_1`,
        auth: expect.objectContaining({
          authenticator: "messenger",
          principalId: "user_1",
          attributes: expect.objectContaining({ channel: "messenger", chatSessionId: "session-1" }),
        }),
      }),
    );
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        messages: [expect.objectContaining({ role: "user", content: "đặt lịch giúp mình" })],
      }),
    );
    expect(mocks.touchChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", eveSessionId: "eve-session-1" }),
    );
  });

  it("returns 200 with skipped:true for a batch with no actionable events", async () => {
    const handler = await postHandler();
    const a = args();
    // An echo of our own outbound message — parseMessengerEvents drops it.
    const raw = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page_a",
          messaging: [
            {
              sender: { id: "page_a" },
              recipient: { id: "user_1" },
              message: { mid: "mid_echo", text: "hi", is_echo: true },
            },
          ],
        },
      ],
    });

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(a.send).not.toHaveBeenCalled();
  });
});
