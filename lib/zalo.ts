/**
 * Zalo Official Account API — OAuth v4, OA profile, and the message Send API.
 * All functions throw on failure; callers wrap in try/catch.
 *
 * Two Zalo-specific traps this module absorbs:
 *  - failures arrive as `{"error": -216}` with HTTP 200, so a status check
 *    alone would treat them as success;
 *  - the token goes in an `access_token` header, not `Authorization: Bearer`.
 */

const ZALO_OPENAPI_BASE = "https://openapi.zalo.me";
const ZALO_OAUTH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
const ZALO_OAUTH_PERMISSION_URL = "https://oauth.zaloapp.com/v4/oa/permission";

/**
 * Maximum characters in one OA text message.
 *
 * Confirm against the current OA message API reference before first release
 * and update the value plus `lib/__fixtures__/zalo/` if it has changed —
 * this is documentation-derived, not observed from a live account.
 */
export const ZALO_TEXT_LIMIT = 2000;

export const ZALO_FETCH_TIMEOUT_MS = 12_000;

/**
 * Local testing without a Zalo Official Account: log the outbound message
 * instead of calling the API, so the whole inbound pipeline can be exercised
 * end to end. See scripts/zalo-sim.mjs.
 *
 * Hard-guarded against production. A flag that silently stops delivering
 * customer messages is a worse failure than the one it helps test.
 */
const ZALO_DRY_RUN = process.env.ZALO_DRY_RUN === "1";

if (ZALO_DRY_RUN && process.env.NODE_ENV === "production") {
  throw new Error("ZALO_DRY_RUN must never be enabled in production");
}

export type ZaloTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** ISO timestamp. */
  expiresAt: string;
};

export function validateZaloEnv(): {
  appId: string;
  appSecret: string;
  oaSecretKey: string;
} {
  const appId = process.env.ZALO_APP_ID?.trim();
  const appSecret = process.env.ZALO_APP_SECRET?.trim();
  const oaSecretKey = process.env.ZALO_OA_SECRET_KEY?.trim();

  if (!appId || !appSecret || !oaSecretKey) {
    throw new Error("ZALO_NOT_CONFIGURED");
  }
  return { appId, appSecret, oaSecretKey };
}

async function zaloFetch(
  url: string,
  init: RequestInit,
  timeoutMs = ZALO_FETCH_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Zalo request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  // An edge proxy can answer with HTML; an unguarded .json() would throw
  // SyntaxError and hide the real status.
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const message = typeof json.message === "string" ? json.message : null;
    throw new Error(message ?? `Zalo request failed (${res.status})`);
  }

  // Zalo reports application errors with HTTP 200 and a non-zero `error`.
  if (typeof json.error === "number" && json.error !== 0) {
    const message = typeof json.message === "string" ? json.message : null;
    throw new Error(message ?? `Zalo request failed (error ${json.error})`);
  }

  return json;
}

/** Split on paragraph, then line, then word boundaries. */
export function chunkZaloText(text: string, limit = ZALO_TEXT_LIMIT): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(" "),
    );
    const end = cut > limit * 0.5 ? cut : limit;
    chunks.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

export function buildZaloOAuthUrl(
  state: string,
  codeChallenge: string,
  redirectUri: string,
): string {
  const { appId } = validateZaloEnv();
  const params = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
  });
  return `${ZALO_OAUTH_PERMISSION_URL}?${params.toString()}`;
}

function toTokenSet(json: Record<string, unknown>): ZaloTokenSet {
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw new Error("Zalo token response missing access_token or refresh_token");
  }

  // `expires_in` arrives as a string of seconds. Default to one hour, the
  // documented OA access token lifetime, if it is absent.
  const seconds = Number(json.expires_in) || 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  };
}

async function postToken(fields: Record<string, string>): Promise<ZaloTokenSet> {
  const { appId, appSecret } = validateZaloEnv();
  const json = await zaloFetch(ZALO_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      secret_key: appSecret,
    },
    body: new URLSearchParams({ app_id: appId, ...fields }).toString(),
  });
  return toTokenSet(json);
}

export function exchangeZaloCode(
  code: string,
  codeVerifier: string,
): Promise<ZaloTokenSet> {
  return postToken({
    code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
  });
}

export function refreshZaloToken(refreshToken: string): Promise<ZaloTokenSet> {
  if (!refreshToken?.trim()) throw new Error("Refresh token is required");
  return postToken({
    refresh_token: refreshToken.trim(),
    grant_type: "refresh_token",
  });
}

export async function getZaloOaProfile(
  accessToken: string,
): Promise<{ oaId: string; name: string }> {
  const json = await zaloFetch(`${ZALO_OPENAPI_BASE}/v2.0/oa/getoa`, {
    method: "GET",
    headers: { access_token: accessToken },
  });

  const data = json.data as Record<string, unknown> | undefined;
  const oaId = typeof data?.oa_id === "string" ? data.oa_id : "";
  if (!oaId) throw new Error("Zalo OA profile response missing oa_id");

  return { oaId, name: typeof data?.name === "string" ? data.name : "Zalo OA" };
}

async function sendOneZaloText(
  accessToken: string,
  userId: string,
  text: string,
  timeoutMs: number,
): Promise<string> {
  const json = await zaloFetch(
    `${ZALO_OPENAPI_BASE}/v3.0/oa/message/cs`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
    },
    timeoutMs,
  );

  const data = json.data as Record<string, unknown> | undefined;
  return String(data?.message_id ?? "");
}

/**
 * Send text to a Zalo user, splitting anything over the limit. Sequential on
 * purpose — Zalo preserves send order per recipient. Returns the last id.
 */
export async function sendZaloText(
  accessToken: string,
  userId: string,
  text: string,
  timeoutMs = ZALO_FETCH_TIMEOUT_MS,
): Promise<{ messageId: string }> {
  const chunks = chunkZaloText(text);
  if (chunks.length === 0) return { messageId: "" };

  if (ZALO_DRY_RUN) {
    for (const chunk of chunks) {
      console.log(`[zalo:dry-run] → ${userId}: ${chunk}`);
    }
    return { messageId: `dry-run:${Date.now()}` };
  }

  let last = "";
  for (const chunk of chunks) {
    last = await sendOneZaloText(accessToken, userId, chunk, timeoutMs);
  }
  return { messageId: last };
}
