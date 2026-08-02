/**
 * Zalo channel handler. Every lib boundary is mocked, so this runs without a
 * database or network — what it proves is routing, gating and tenant
 * isolation, which is where a channel bug is most expensive.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const APP_ID = "test-zalo-app-id";
const OA_SECRET = "test-zalo-oa-secret";
const WS_A = "workspace-a";
const WS_B = "workspace-b";

const mocks = vi.hoisted(() => ({
  getChannelConnectionByExternalId: vi.fn(),
  assertWorkspaceSubscriptionActive: vi.fn(),
  getWorkspaceReplyLocale: vi.fn(),
  getZaloCredentialsForWorkspace: vi.fn(),
  sendZaloText: vi.fn(),
  getOrCreateChannelSession: vi.fn(),
  upsertChatMessages: vi.fn(),
  touchChannelSession: vi.fn(),
  chatMessageExists: vi.fn(),
  findChatSessionByEveSessionId: vi.fn(),
  checkAgentRateLimit: vi.fn(),
}));

vi.mock("@/lib/channel-connections", () => ({
  getChannelConnectionByExternalId: mocks.getChannelConnectionByExternalId,
}));
vi.mock("@/lib/workspace", () => ({
  assertWorkspaceSubscriptionActive: mocks.assertWorkspaceSubscriptionActive,
  getWorkspaceReplyLocale: mocks.getWorkspaceReplyLocale,
  getZaloCredentialsForWorkspace: mocks.getZaloCredentialsForWorkspace,
}));
vi.mock("@/lib/zalo", () => ({ sendZaloText: mocks.sendZaloText }));
vi.mock("@/lib/chat-sessions", () => ({
  channelVisitorId: (channel: string, id: string) => `${channel}:${id}`,
  getOrCreateChannelSession: mocks.getOrCreateChannelSession,
  upsertChatMessages: mocks.upsertChatMessages,
  touchChannelSession: mocks.touchChannelSession,
  chatMessageExists: mocks.chatMessageExists,
  findChatSessionByEveSessionId: mocks.findChatSessionByEveSessionId,
}));
vi.mock("@/lib/agent-rate-limit", () => ({
  checkAgentRateLimit: mocks.checkAgentRateLimit,
}));

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app_id: APP_ID,
    oa_id: "oa_a",
    timestamp: "1800000000000",
    event_name: "user_send_text",
    sender: { id: "user_1" },
    recipient: { id: "oa_a" },
    message: { text: "đặt lịch giúp mình", msg_id: "msg_1" },
    ...overrides,
  });
}

function sign(raw: string, secret = OA_SECRET): string {
  const timestamp = JSON.parse(raw).timestamp as string;
  return `mac=${createHash("sha256").update(APP_ID + raw + timestamp + secret).digest("hex")}`;
}

/** Resolve the POST /webhook handler from the channel definition. */
async function postHandler() {
  const channel = (await import("./channels/zalo")).default;
  const route = channel.routes.find(
    (r: { method: string; path: string }) => r.method === "POST" && r.path === "/webhook",
  );
  return route!.handler as (req: Request, args: unknown) => Promise<Response>;
}

function request(raw: string, signature: string | null) {
  return new Request("https://app.example.com/eve/v1/zalo/webhook", {
    method: "POST",
    headers: signature
      ? { "X-ZEvent-Signature": signature, "Content-Type": "application/json" }
      : { "Content-Type": "application/json" },
    body: raw,
  });
}

function args() {
  const sent: unknown[] = [];
  return {
    sent,
    send: vi.fn(async (payload: unknown) => {
      sent.push(payload);
      return { id: "eve-session-1" };
    }),
    waitUntil: (p: Promise<unknown>) => p,
    requestIp: "1.2.3.4",
  };
}

let prevAppId: string | undefined;
let prevSecret: string | undefined;

beforeEach(() => {
  prevAppId = process.env.ZALO_APP_ID;
  prevSecret = process.env.ZALO_OA_SECRET_KEY;
  process.env.ZALO_APP_ID = APP_ID;
  process.env.ZALO_OA_SECRET_KEY = OA_SECRET;

  mocks.getChannelConnectionByExternalId.mockResolvedValue({
    workspaceId: WS_A,
    provider: "zalo",
    externalId: "oa_a",
    displayName: "OA A",
    accessToken: "at-1",
    refreshToken: "rt-1",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    metadata: {},
  });
  mocks.assertWorkspaceSubscriptionActive.mockResolvedValue(undefined);
  mocks.getWorkspaceReplyLocale.mockResolvedValue("vi");
  mocks.getZaloCredentialsForWorkspace.mockResolvedValue({
    oaId: "oa_a",
    accessToken: "at-1",
  });
  mocks.getOrCreateChannelSession.mockResolvedValue({ id: "session-1", workspace_id: WS_A });
  mocks.upsertChatMessages.mockResolvedValue(undefined);
  mocks.touchChannelSession.mockResolvedValue(undefined);
  mocks.chatMessageExists.mockResolvedValue(false);
  mocks.checkAgentRateLimit.mockResolvedValue({ ok: true });
  mocks.sendZaloText.mockResolvedValue({ messageId: "out-1" });
});

afterEach(() => {
  process.env.ZALO_APP_ID = prevAppId;
  process.env.ZALO_OA_SECRET_KEY = prevSecret;

  vi.clearAllMocks();
  vi.resetModules();
});

describe("zalo webhook", () => {
  it("rejects a bad signature and never invokes the agent", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw, "wrong-secret")), a);

    expect(res.status).toBe(401);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header", async () => {
    const handler = await postHandler();
    const raw = body();
    expect((await handler(request(raw, null), args())).status).toBe(401);
  });

  it("404s an oa_id that maps to no workspace, without falling back", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue(null);
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(404);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("opens the session in the workspace the oa_id belongs to, not another", async () => {
    mocks.getChannelConnectionByExternalId.mockResolvedValue({
      workspaceId: WS_B,
      provider: "zalo",
      externalId: "oa_b",
      displayName: "OA B",
      accessToken: "at-b",
      refreshToken: null,
      expiresAt: null,
      metadata: {},
    });
    const handler = await postHandler();
    const raw = body({ oa_id: "oa_b", recipient: { id: "oa_b" } });

    await handler(request(raw, sign(raw)), args());

    expect(mocks.getOrCreateChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS_B, channel: "zalo" }),
    );
  });

  it("skips an inactive subscription without burning an LLM turn", async () => {
    mocks.assertWorkspaceSubscriptionActive.mockRejectedValue(new Error("inactive"));
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(a.send).not.toHaveBeenCalled();
  });

  it("tells a rate-limited guest instead of dropping the message", async () => {
    mocks.checkAgentRateLimit.mockResolvedValue({ ok: false, errorCode: "agent_rate_limited" });
    const handler = await postHandler();
    const a = args();
    const raw = body();

    await handler(request(raw, sign(raw)), a);

    expect(a.send).not.toHaveBeenCalled();
    expect(mocks.sendZaloText).toHaveBeenCalled();
  });

  it("ignores a redelivered msg_id", async () => {
    mocks.chatMessageExists.mockResolvedValue(true);
    const handler = await postHandler();
    const a = args();
    const raw = body();

    await handler(request(raw, sign(raw)), a);

    expect(a.send).not.toHaveBeenCalled();
    expect(mocks.sendZaloText).not.toHaveBeenCalled();
  });

  it("drives the agent and records the eve session on the happy path", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body();

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(a.send).toHaveBeenCalledWith(
      { message: "đặt lịch giúp mình" },
      expect.objectContaining({
        continuationToken: `zalo:${WS_A}:user_1`,
        auth: expect.objectContaining({
          authenticator: "zalo",
          principalId: "user_1",
          attributes: expect.objectContaining({ channel: "zalo", chatSessionId: "session-1" }),
        }),
      }),
    );
    expect(mocks.upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        messages: [expect.objectContaining({ role: "user", eve_message_id: "zalo:msg_1" })],
      }),
    );
    expect(mocks.touchChannelSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1", eveSessionId: "eve-session-1" }),
    );
  });

  it("returns 200 with skipped:true for a non-text event", async () => {
    const handler = await postHandler();
    const a = args();
    const raw = body({ event_name: "follow" });

    const res = await handler(request(raw, sign(raw)), a);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ skipped: true });
    expect(a.send).not.toHaveBeenCalled();
  });
});

describe("message.completed", () => {
  it("persists the reply and delivers it", async () => {
    mocks.findChatSessionByEveSessionId.mockResolvedValue({
      id: "session-1",
      workspace_id: WS_A,
      external_user_id: "user_1",
    });
    const channel = (await import("./channels/zalo")).default;

    await (channel as any).events["message.completed"](
      { message: "mai 3h chiều nhé", turnId: "t1", sequence: 0, finishReason: "stop" },
      null,
      { session: { id: "eve-session-1" } },
    );

    expect(mocks.upsertChatMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [expect.objectContaining({ role: "assistant", content: "mai 3h chiều nhé" })],
      }),
    );
    expect(mocks.sendZaloText).toHaveBeenCalledWith("at-1", "user_1", "mai 3h chiều nhé");
  });

  it("does not throw into the turn loop when delivery fails", async () => {
    mocks.findChatSessionByEveSessionId.mockResolvedValue({
      id: "session-1",
      workspace_id: WS_A,
      external_user_id: "user_1",
    });
    mocks.sendZaloText.mockRejectedValue(new Error("zalo down"));
    const channel = (await import("./channels/zalo")).default;

    await expect(
      (channel as any).events["message.completed"](
        { message: "xin chào", turnId: "t1", sequence: 0, finishReason: "stop" },
        null,
        { session: { id: "eve-session-1" } },
      ),
    ).resolves.not.toThrow();
  });
});

