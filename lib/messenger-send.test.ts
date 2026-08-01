/**
 * Messenger Send API — chunking and transport.
 * Stubs global fetch; asserts the access token never lands in the URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chunkMessengerText, MESSENGER_TEXT_LIMIT, sendMessengerText } from "./messenger";

const TOKEN = "page-access-token-abc123";
const PSID = "psid-1";

function okResponse(messageId = "mid_1") {
  return new Response(JSON.stringify({ message_id: messageId }), { status: 200 });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("chunkMessengerText", () => {
  it("leaves a short message untouched", () => {
    expect(chunkMessengerText("hello")).toEqual(["hello"]);
  });

  it("drops an empty message", () => {
    expect(chunkMessengerText("   ")).toEqual([]);
  });

  it("splits past the 2000-character limit", () => {
    const long = "a".repeat(MESSENGER_TEXT_LIMIT + 500);
    const chunks = chunkMessengerText(long);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MESSENGER_TEXT_LIMIT);
    }
    expect(chunks.join("").length).toBe(long.length);
  });

  it("prefers a word boundary over a hard cut", () => {
    const words = `${"word ".repeat(500)}END`;
    const chunks = chunkMessengerText(words);

    expect(chunks.length).toBeGreaterThan(1);
    // A hard cut would leave a truncated "wor"/"wo" fragment.
    expect(chunks[0].endsWith("word")).toBe(true);
  });
});

describe("sendMessengerText", () => {
  it("sends the page token as a bearer header, never in the URL", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchSpy);

    await sendMessengerText(TOKEN, PSID, "hi");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    // Query strings end up in proxy/CDN access logs.
    expect(url).not.toContain(TOKEN);
    expect(url).not.toContain("access_token");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("sends one request per chunk for an over-long reply", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchSpy);

    await sendMessengerText(TOKEN, PSID, "a".repeat(MESSENGER_TEXT_LIMIT + 500));

    expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    for (const call of fetchSpy.mock.calls) {
      const body = JSON.parse((call[1] as RequestInit).body as string);
      expect(body.message.text.length).toBeLessThanOrEqual(MESSENGER_TEXT_LIMIT);
      expect(body.recipient.id).toBe(PSID);
    }
  });

  it("surfaces the Meta error message on a failed send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "(#551) User unavailable" } }),
          { status: 400 },
        ),
      ),
    );

    await expect(sendMessengerText(TOKEN, PSID, "hi")).rejects.toThrow(
      "User unavailable",
    );
  });

  it("does not choke on a non-JSON error page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })),
    );

    await expect(sendMessengerText(TOKEN, PSID, "hi")).rejects.toThrow(
      "Meta request failed (502)",
    );
  });

  it("sends nothing for an empty reply", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal("fetch", fetchSpy);

    await sendMessengerText(TOKEN, PSID, "   ");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
