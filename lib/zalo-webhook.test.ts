/**
 * Zalo webhook parsing + signature verification.
 * Pure functions — no network, no DB.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseZaloEvents, verifyZaloSignature } from "./zalo-webhook";

const APP_ID = "test-zalo-app-id";
const OA_SECRET = "test-zalo-oa-secret";

function body(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app_id: APP_ID,
    oa_id: "oa_1",
    timestamp: "1800000000000",
    event_name: "user_send_text",
    sender: { id: "user_1" },
    recipient: { id: "oa_1" },
    message: { text: "cho mình đặt lịch", msg_id: "msg_1" },
    ...overrides,
  });
}

/** Zalo: mac = sha256(appId + data + timestamp + oaSecretKey) */
function sign(raw: string, secret = OA_SECRET, appId = APP_ID): string {
  const timestamp = JSON.parse(raw).timestamp as string;
  const mac = createHash("sha256")
    .update(appId + raw + timestamp + secret)
    .digest("hex");
  return `mac=${mac}`;
}

describe("verifyZaloSignature", () => {
  it("accepts a correct mac= signature", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw), APP_ID, OA_SECRET)).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw, "other"), APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a signature made for a different app id", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, sign(raw, OA_SECRET, "other-app"), APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const signature = sign(body());
    const tampered = body({ message: { text: "huỷ hết lịch", msg_id: "msg_1" } });
    expect(verifyZaloSignature(tampered, signature, APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a re-serialized body with identical meaning", () => {
    const raw = body();
    const signature = sign(raw);
    const reserialized = JSON.stringify(JSON.parse(raw), null, 2);
    expect(verifyZaloSignature(reserialized, signature, APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header without throwing", () => {
    const raw = body();
    expect(verifyZaloSignature(raw, null, APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "", APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "garbage", APP_ID, OA_SECRET)).toBe(false);
    expect(verifyZaloSignature(raw, "mac=zz", APP_ID, OA_SECRET)).toBe(false);
  });

  it("rejects a body that is not valid JSON", () => {
    expect(verifyZaloSignature("{oops", "mac=abc", APP_ID, OA_SECRET)).toBe(false);
  });
});

describe("parseZaloEvents", () => {
  it("extracts a user_send_text event", () => {
    const [event] = parseZaloEvents(body());
    expect(event).toEqual({
      oaId: "oa_1",
      userId: "user_1",
      text: "cho mình đặt lịch",
      msgId: "msg_1",
      timestamp: "1800000000000",
    });
  });

  it("falls back to recipient.id when oa_id is absent", () => {
    const raw = JSON.stringify({
      ...JSON.parse(body()),
      oa_id: undefined,
    });
    expect(parseZaloEvents(raw)[0]?.oaId).toBe("oa_1");
  });

  it("drops events that are not user_send_text", () => {
    expect(parseZaloEvents(body({ event_name: "follow" }))).toEqual([]);
    expect(parseZaloEvents(body({ event_name: "user_send_image" }))).toEqual([]);
  });

  it("drops an event with empty text", () => {
    expect(parseZaloEvents(body({ message: { text: "   ", msg_id: "m" } }))).toEqual([]);
  });

  it("handles an array of events", () => {
    const raw = `[${body()},${body({ message: { text: "hai", msg_id: "msg_2" } })}]`;
    expect(parseZaloEvents(raw)).toHaveLength(2);
  });

  it("returns [] for malformed JSON instead of throwing", () => {
    expect(parseZaloEvents("{not json")).toEqual([]);
  });
});
