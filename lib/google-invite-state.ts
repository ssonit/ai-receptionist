/**
 * Signed state cookie carrying a staff invite token through the Google OAuth
 * redirect round trip — short-lived, HMAC-SHA256, single-use. Mirrors
 * lib/cal-oauth-state.ts's pattern; kept as a separate cookie name so a
 * Cal/Zalo connect in another tab can't collide with (or clear) this one.
 */
import { createHmac, randomBytes } from "node:crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateSecret(): string {
  return (
    process.env.WORKSPACE_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "dev-only-eve-workspace-secrets"
  );
}

export type GoogleInviteStatePayload = {
  inviteToken: string;
  next: string;
  nonce: string;
  exp: number;
};

function signPayload(payload: GoogleInviteStatePayload): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const hmac = createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${hmac}`;
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function verifyPayload(token: string): GoogleInviteStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", getStateSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let payload: GoogleInviteStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    !payload.inviteToken ||
    !payload.next ||
    !payload.nonce ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (Date.now() > payload.exp) return null;
  return payload;
}

/** Create a signed state token for the Google OAuth redirect. */
export function createGoogleInviteState(
  inviteToken: string,
  next: string,
): { token: string; payload: GoogleInviteStatePayload } {
  const payload: GoogleInviteStatePayload = {
    inviteToken,
    next,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  return { token: signPayload(payload), payload };
}

/** Verify a state token from the callback. Returns payload or null. */
export function parseGoogleInviteState(
  token: string,
): GoogleInviteStatePayload | null {
  return verifyPayload(token);
}

export const GOOGLE_INVITE_STATE_COOKIE = "eve_google_invite_state";
