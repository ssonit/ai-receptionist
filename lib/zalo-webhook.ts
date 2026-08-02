/**
 * Zalo OA webhook — signature verification and event extraction.
 * Pure functions: no network, no database, no environment reads.
 */
import { createHash } from "node:crypto";

export type ZaloMessageEvent = {
  oaId: string;
  userId: string;
  text: string;
  msgId: string;
  timestamp: string;
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `X-ZEvent-Signature: mac=sha256(appId + rawBody + timestamp + oaSecretKey)`.
 *
 * Verification must run on the raw request text. Parsing and re-serializing
 * first changes key order and whitespace, which changes the hash — the body
 * would verify as tampered even when it is genuine.
 */
export function verifyZaloSignature(
  rawBody: string,
  header: string | null,
  appId: string,
  oaSecretKey: string,
): boolean {
  const received = header?.trim().replace(/^mac=/, "");
  if (!received) return false;

  let timestamp: string;
  try {
    const parsed = JSON.parse(rawBody) as { timestamp?: unknown };
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    timestamp = String((first as { timestamp?: unknown })?.timestamp ?? "");
  } catch {
    return false;
  }
  if (!timestamp) return false;

  const expected = createHash("sha256")
    .update(appId + rawBody + timestamp + oaSecretKey)
    .digest("hex");

  return timingSafeEqual(received, expected);
}

function toEvent(raw: unknown): ZaloMessageEvent | null {
  const e = raw as Record<string, unknown> | null;
  if (!e || e.event_name !== "user_send_text") return null;

  const message = e.message as Record<string, unknown> | undefined;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (!text) return null;

  const sender = e.sender as Record<string, unknown> | undefined;
  const recipient = e.recipient as Record<string, unknown> | undefined;

  const userId = typeof sender?.id === "string" ? sender.id : "";
  // `oa_id` is the documented field; `recipient.id` carries the same value and
  // covers payload variants that omit it.
  const oaId =
    (typeof e.oa_id === "string" && e.oa_id) ||
    (typeof recipient?.id === "string" ? recipient.id : "");

  if (!userId || !oaId) return null;

  return {
    oaId,
    userId,
    text,
    msgId: typeof message?.msg_id === "string" ? message.msg_id : "",
    timestamp: String(e.timestamp ?? ""),
  };
}

/** Never throws — a malformed delivery must not take the webhook down. */
export function parseZaloEvents(rawBody: string): ZaloMessageEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return [];
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.flatMap((entry) => {
    const event = toEvent(entry);
    return event ? [event] : [];
  });
}
