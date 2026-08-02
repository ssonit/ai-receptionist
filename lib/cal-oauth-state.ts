/**
 * Signed OAuth state cookie — short-lived, workspace-bound, HMAC-SHA256.
 * Route handlers call sign/verify; cookie read/write stays in the handler.
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

export type OAuthStatePayload = {
  workspaceId: string;
  returnTo: string;
  nonce: string;
  exp: number;
  codeVerifier?: string;
};

function signPayload(payload: OAuthStatePayload): string {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  const hmac = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return `${encoded}.${hmac}`;
}

function verifyPayload(token: string): OAuthStatePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload.workspaceId || !payload.returnTo || !payload.nonce || typeof payload.exp !== "number") {
    return null;
  }

  if (Date.now() > payload.exp) return null;
  return payload;
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Same-origin path guard for the post-OAuth redirect.
 *
 * `startsWith("/")` alone is not enough: a protocol-relative `//evil.com`
 * passes it, and `new URL("//evil.com", "https://app…")` resolves to
 * `https://evil.com` — an open redirect reachable through any OAuth start
 * route via `?returnTo=//evil.com`.
 */
export function safeReturnTo(returnTo: string, fallback: string): string {
  const value = returnTo.trim();
  if (!value.startsWith("/")) return fallback;
  // Reject protocol-relative ("//host") and backslash variants ("/\host").
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** Create a signed state token for OAuth authorize redirect. */
export function createOAuthState(
  workspaceId: string,
  returnTo: string,
  codeVerifier?: string,
): { token: string; payload: OAuthStatePayload } {
  const payload: OAuthStatePayload = {
    workspaceId,
    returnTo: safeReturnTo(returnTo, "/dashboard/setup"),
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
    // PKCE: the verifier must survive the redirect, and this cookie is already
    // signed, httpOnly and TTL-bounded — exactly the properties it needs.
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  return { token: signPayload(payload), payload };
}

/** Verify a state token from the callback. Returns payload or null. */
export function parseOAuthState(token: string, expectedWorkspaceId: string): OAuthStatePayload | null {
  const payload = verifyPayload(token);
  if (!payload) return null;
  if (payload.workspaceId !== expectedWorkspaceId) return null;
  // Re-check on read: tokens minted before the guard existed are still valid
  // signatures for their 10-minute TTL.
  return { ...payload, returnTo: safeReturnTo(payload.returnTo, "/dashboard/setup") };
}

export const OAUTH_STATE_COOKIE = "eve_cal_oauth_state";
/**
 * Separate from the Cal/Messenger cookie so a Zalo connect started in one tab
 * cannot clobber a Cal connect started in another.
 */
export const ZALO_OAUTH_STATE_COOKIE = "eve_zalo_oauth_state";
export { STATE_TTL_MS };
