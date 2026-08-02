/**
 * Zalo API client. Chunking is pure; transport is tested against a stubbed
 * global fetch using fixtures captured from the published API reference.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sendOk from "./__fixtures__/zalo/send-ok.json";
import errorInvalidToken from "./__fixtures__/zalo/error-invalid-token.json";
import {
  ZALO_TEXT_LIMIT,
  buildZaloOAuthUrl,
  chunkZaloText,
  exchangeZaloCode,
  refreshZaloToken,
  sendZaloText,
} from "./zalo";

const realFetch = globalThis.fetch;

function stubFetch(json: unknown, init: { status?: number; body?: string } = {}) {
  const fn = vi.fn(async () =>
    init.body !== undefined
      ? new Response(init.body, { status: init.status ?? 200 })
      : new Response(JSON.stringify(json), {
          status: init.status ?? 200,
          headers: { "Content-Type": "application/json" },
        }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("chunkZaloText", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkZaloText("xin chào")).toEqual(["xin chào"]);
  });

  it("returns no chunks for empty or whitespace-only text", () => {
    expect(chunkZaloText("")).toEqual([]);
    expect(chunkZaloText("   \n  ")).toEqual([]);
  });

  it("keeps text exactly at the limit in one chunk", () => {
    const text = "a".repeat(ZALO_TEXT_LIMIT);
    expect(chunkZaloText(text)).toHaveLength(1);
  });

  it("splits text over the limit and loses nothing", () => {
    const text = `${"a".repeat(ZALO_TEXT_LIMIT)} ${"b".repeat(200)}`;
    const chunks = chunkZaloText(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= ZALO_TEXT_LIMIT)).toBe(true);
    expect(chunks.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("prefers a paragraph break over a mid-word cut", () => {
    const head = "a".repeat(ZALO_TEXT_LIMIT - 100);
    const chunks = chunkZaloText(`${head}\n\n${"b".repeat(300)}`);
    expect(chunks[0]).toBe(head);
  });
});

describe("buildZaloOAuthUrl", () => {
  it("carries app id, redirect, state and code challenge", () => {
    const url = new URL(
      buildZaloOAuthUrl("state-1", "challenge-1", "http://localhost:3000/cb"),
    );
    expect(url.origin + url.pathname).toBe("https://oauth.zaloapp.com/v4/oa/permission");
    expect(url.searchParams.get("app_id")).toBe("test-zalo-app-id");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/cb");
  });
});

describe("exchangeZaloCode", () => {
  it("posts the verifier and secret key header, and returns an expiry", async () => {
    const fetchMock = stubFetch({
      access_token: "at-1",
      refresh_token: "rt-1",
      expires_in: "3600",
    });

    const before = Date.now();
    const tokens = await exchangeZaloCode("code-1", "verifier-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth.zaloapp.com/v4/oa/access_token");
    expect((init.headers as Record<string, string>).secret_key).toBe("test-zalo-app-secret");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );

    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code")).toBe("code-1");
    expect(sent.get("code_verifier")).toBe("verifier-1");
    expect(sent.get("app_id")).toBe("test-zalo-app-id");

    expect(tokens.accessToken).toBe("at-1");
    expect(tokens.refreshToken).toBe("rt-1");
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(before);
  });

  it("throws instead of returning a half-connected token set", async () => {
    stubFetch({ access_token: "at-1" });
    await expect(exchangeZaloCode("code-1", "verifier-1")).rejects.toThrow(
      /missing access_token or refresh_token/i,
    );
  });

  it("surfaces a Zalo error body", async () => {
    stubFetch({ error: -201, message: "Invalid code" });
    await expect(exchangeZaloCode("bad", "verifier-1")).rejects.toThrow("Invalid code");
  });
});

describe("refreshZaloToken", () => {
  it("posts grant_type=refresh_token and no code_verifier", async () => {
    const fetchMock = stubFetch({
      access_token: "at-2",
      refresh_token: "rt-2",
      expires_in: "3600",
    });

    await refreshZaloToken("rt-1");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = new URLSearchParams(init.body as string);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("rt-1");
    expect(sent.get("code_verifier")).toBeNull();
  });
});

describe("sendZaloText", () => {
  it("puts the token in the access_token header, never the query string", async () => {
    const fetchMock = stubFetch(sendOk);

    const result = await sendZaloText("at-1", "user_1", "xin chào");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openapi.zalo.me/v3.0/oa/message/cs");
    expect(url).not.toContain("access_token=");
    expect((init.headers as Record<string, string>).access_token).toBe("at-1");
    expect(JSON.parse(init.body as string)).toEqual({
      recipient: { user_id: "user_1" },
      message: { text: "xin chào" },
    });
    expect(result.messageId).toBe("msg_out_1");
  });

  it("sends long text as sequential chunks in order", async () => {
    const fetchMock = stubFetch(sendOk);
    await sendZaloText("at-1", "user_1", `${"a".repeat(ZALO_TEXT_LIMIT)} tail`);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    const texts = fetchMock.mock.calls.map((call) => {
      const init = (call as unknown as [string, RequestInit])[1];
      return JSON.parse(init.body as string).message.text as string;
    });
    expect(texts[0].startsWith("a")).toBe(true);
    expect(texts[texts.length - 1]).toContain("tail");
  });

  it("sends nothing for empty text", async () => {
    const fetchMock = stubFetch(sendOk);
    const result = await sendZaloText("at-1", "user_1", "   ");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.messageId).toBe("");
  });

  it("throws on a non-zero error field returned with HTTP 200", async () => {
    stubFetch(errorInvalidToken);
    await expect(sendZaloText("at-1", "user_1", "hi")).rejects.toThrow(
      "Access token is invalid",
    );
  });

  it("reports the HTTP status when the body is an HTML error page", async () => {
    stubFetch(null, { status: 502, body: "<html>Bad Gateway</html>" });
    await expect(sendZaloText("at-1", "user_1", "hi")).rejects.toThrow(/502/);
  });

  it("aborts rather than hanging when the request never settles", async () => {
    globalThis.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    ) as unknown as typeof fetch;

    await expect(sendZaloText("at-1", "user_1", "hi", 20)).rejects.toThrow(/timed out/i);
  });
});

describe("ZALO_DRY_RUN", () => {
  it("skips the network and returns a synthetic id when enabled", async () => {
    vi.stubEnv("ZALO_DRY_RUN", "1");
    vi.resetModules();
    const fetchMock = stubFetch(sendOk);

    const { sendZaloText: dryRunSend } = await import("./zalo");
    const result = await dryRunSend("at-1", "user_1", "xin chào");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.messageId).toMatch(/^dry-run:/);
  });

  it("refuses to load with dry run enabled in production", async () => {
    vi.stubEnv("ZALO_DRY_RUN", "1");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();

    await expect(import("./zalo")).rejects.toThrow(/ZALO_DRY_RUN/);
  });
});
