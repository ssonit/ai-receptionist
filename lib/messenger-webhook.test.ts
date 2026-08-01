/**
 * Messenger webhook parsing + signature verification.
 * Pure functions — no network, no DB.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseMessengerEvents,
  verifyMessengerSignature,
  verifyWebhookToken,
} from "./messenger-webhook";

const SECRET = "test-app-secret";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function messageEntry(pageId: string, psid: string, text: string) {
  return {
    id: pageId,
    messaging: [
      {
        sender: { id: psid },
        recipient: { id: pageId },
        timestamp: 1_800_000_000_000,
        message: { mid: `mid_${psid}_${text}`, text },
      },
    ],
  };
}

describe("verifyMessengerSignature", () => {
  it("accepts a correct sha256= signature", () => {
    const body = JSON.stringify({ object: "page" });
    expect(verifyMessengerSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const body = JSON.stringify({ object: "page" });
    expect(verifyMessengerSignature(body, sign(body, "other"), SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(JSON.stringify({ object: "page" }));
    expect(verifyMessengerSignature('{"object":"evil"}', signature, SECRET)).toBe(false);
  });

  it("rejects an empty header or empty secret", () => {
    const body = "{}";
    expect(verifyMessengerSignature(body, "", SECRET)).toBe(false);
    expect(verifyMessengerSignature(body, sign(body), "")).toBe(false);
  });

  it("does not throw when the signature length differs", () => {
    expect(verifyMessengerSignature("{}", "sha256=abc", SECRET)).toBe(false);
  });
});

describe("parseMessengerEvents", () => {
  it("returns every message in a batched delivery", () => {
    // Meta batches entries — returning only the first would silently drop the
    // rest, so a guest sending two messages fast loses one.
    const body = JSON.stringify({
      object: "page",
      entry: [
        messageEntry("page-1", "psid-a", "first"),
        messageEntry("page-1", "psid-a", "second"),
        messageEntry("page-1", "psid-b", "from another guest"),
      ],
    });

    const events = parseMessengerEvents(body);
    expect(events.map((e) => e.text)).toEqual([
      "first",
      "second",
      "from another guest",
    ]);
    expect(events.map((e) => e.psid)).toEqual(["psid-a", "psid-a", "psid-b"]);
  });

  it("skips echoes, empty text and non-message events", () => {
    const body = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            { sender: { id: "p1" }, message: { text: "echo", is_echo: true } },
            { sender: { id: "p2" }, message: { text: "   " } },
            { sender: { id: "p3" }, read: { watermark: 1 } },
            { message: { text: "no sender" } },
            { sender: { id: "p4" }, message: { mid: "m", text: "real" } },
          ],
        },
      ],
    });

    const events = parseMessengerEvents(body);
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe("real");
  });

  it("falls back to recipient.id when entry.id is missing", () => {
    const body = JSON.stringify({
      object: "page",
      entry: [
        {
          messaging: [
            {
              sender: { id: "psid" },
              recipient: { id: "page-fallback" },
              message: { mid: "m", text: "hi" },
            },
          ],
        },
      ],
    });

    expect(parseMessengerEvents(body)[0].pageId).toBe("page-fallback");
  });

  it("returns [] for malformed JSON or a non-page object", () => {
    expect(parseMessengerEvents("not json")).toEqual([]);
    expect(parseMessengerEvents(JSON.stringify({ object: "instagram" }))).toEqual([]);
    expect(parseMessengerEvents(JSON.stringify({ object: "page" }))).toEqual([]);
  });
});

describe("verifyWebhookToken", () => {
  const params = (entries: Record<string, string>) =>
    new URLSearchParams(entries);

  it("returns the challenge on a valid subscribe handshake", () => {
    expect(
      verifyWebhookToken(
        params({
          "hub.mode": "subscribe",
          "hub.verify_token": "tok",
          "hub.challenge": "12345",
        }),
        "tok",
      ),
    ).toBe("12345");
  });

  it("rejects a wrong token, wrong mode, or empty expected token", () => {
    const good = {
      "hub.mode": "subscribe",
      "hub.verify_token": "tok",
      "hub.challenge": "12345",
    };
    expect(verifyWebhookToken(params({ ...good, "hub.verify_token": "bad" }), "tok")).toBeNull();
    expect(verifyWebhookToken(params({ ...good, "hub.mode": "unsubscribe" }), "tok")).toBeNull();
    expect(verifyWebhookToken(params(good), "")).toBeNull();
  });
});
