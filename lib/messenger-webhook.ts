/**
 * Facebook Messenger webhook — signature verification and event parsing.
 * Framework-agnostic; usable from Next.js routes and eve channel routes alike.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

// ── Signature verification ──

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 * The header format is `sha256=<hex>`.
 */
export function verifyMessengerSignature(
  rawBody: string,
  header: string,
  appSecret: string,
): boolean {
  if (!header || !appSecret) return false;

  const prefix = "sha256=";
  const sig = header.startsWith(prefix) ? header.slice(prefix.length) : header;
  if (!sig) return false;

  try {
    const hmac = createHmac("sha256", appSecret);
    hmac.update(rawBody);
    const digest = hmac.digest("hex");
    return timingSafeEqual(Buffer.from(digest), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ── Event types ──

export type MessengerWebhookEvent = MessengerMessageEvent | MessengerUnknownEvent;

export interface MessengerMessageEvent {
  type: "message";
  psid: string;
  pageId: string;
  text: string;
  mid: string;
  timestamp: number;
}

export interface MessengerUnknownEvent {
  type: "unknown";
  eventName: string;
}

// ── Parsing ──

interface MetaMessagingEntry {
  sender?: { id?: string };
  recipient?: { id?: string };
  message?: {
    text?: string;
    mid?: string;
    is_echo?: boolean;
    quick_reply?: unknown;
  };
  timestamp?: number;
}

interface MetaEntry {
  id?: string;
  messaging?: MetaMessagingEntry[];
}

interface MetaWebhookBody {
  object?: string;
  entry?: MetaEntry[];
}

/**
 * Parse a Messenger webhook body. Returns the first actionable messaging event
 * or null if the payload is a non-message event (echo, read receipt, etc.).
 */
export function parseMessengerEvent(
  rawBody: string,
): MessengerWebhookEvent | null {
  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (body.object !== "page" || !body.entry?.length) return null;

  for (const entry of body.entry) {
    const pageId = entry.id;
    if (!entry.messaging?.length) continue;

    for (const msg of entry.messaging) {
      // Skip echo (our own messages) and non-text
      if (msg.message?.is_echo) continue;
      if (!msg.sender?.id) continue;

      const text = msg.message?.text?.trim();
      if (!text) continue;

      return {
        type: "message",
        psid: msg.sender.id,
        pageId: pageId ?? msg.recipient?.id ?? "",
        text,
        mid: msg.message?.mid ?? "",
        timestamp: msg.timestamp ?? Date.now(),
      };
    }
  }

  return null;
}

// ── Verify token (webhook challenge) ──

export function verifyWebhookToken(
  params: URLSearchParams,
  expectedToken: string,
): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode !== "subscribe") return null;
  if (!token || !challenge) return null;
  if (!expectedToken || token !== expectedToken) return null;

  return challenge;
}
