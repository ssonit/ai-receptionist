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

/** Create a signed state token for OAuth authorize redirect. */
export function createOAuthState(workspaceId: string, returnTo: string): { token: string; payload: OAuthStatePayload } {
  const payload: OAuthStatePayload = {
    workspaceId,
    returnTo: returnTo.startsWith("/") ? returnTo : "/dashboard/setup",
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  return { token: signPayload(payload), payload };
}

/** Verify a state token from the callback. Returns payload or null. */
export function parseOAuthState(token: string, expectedWorkspaceId: string): OAuthStatePayload | null {
  const payload = verifyPayload(token);
  if (!payload) return null;
  if (payload.workspaceId !== expectedWorkspaceId) return null;
  return payload;
}

export const OAUTH_STATE_COOKIE = "eve_cal_oauth_state";
export { STATE_TTL_MS };
