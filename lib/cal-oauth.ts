/**
 * Cal.com Developer OAuth — authorize URL, code exchange, token refresh.
 * All functions throw on failure; callers wrap in try/catch for user-facing errors.
 */
import { encryptSecret } from "@/lib/workspace-secrets";

export const CAL_OAUTH_SCOPES = [
  "PROFILE_READ",
  "EVENT_TYPE_READ",
  "EVENT_TYPE_WRITE",
  "BOOKING_READ",
  "BOOKING_WRITE",
].join(" ");

const CAL_AUTHORIZE_URL = "https://app.cal.com/auth/oauth2/authorize";
const CAL_TOKEN_URL = "https://api.cal.com/v2/auth/oauth2/token";

export function validateOAuthEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.CALCOM_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.CALCOM_OAUTH_CLIENT_SECRET?.trim();
  const redirectUri = process.env.CALCOM_OAUTH_REDIRECT_URI?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("CAL_OAUTH_NOT_CONFIGURED");
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildCalOAuthAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = validateOAuthEnv();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CAL_OAUTH_SCOPES,
    state,
  });
  return `${CAL_AUTHORIZE_URL}?${params.toString()}`;
}

type OAuthTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
};

async function postToken(body: Record<string, string>): Promise<OAuthTokenResponse> {
  const { clientId, clientSecret, redirectUri } = validateOAuthEnv();

  const params = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body });
  // redirect_uri only needed for authorization_code grant
  if (body.grant_type === "authorization_code") {
    params.set("redirect_uri", redirectUri);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(CAL_TOKEN_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: params.toString(),
    });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : typeof json.message === "string" ? json.message : `Token request failed (${res.status})`;
    throw new Error(msg);
  }

  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
    throw new Error("Cal.com token response missing access_token or refresh_token");
  }

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: typeof json.expires_in === "number" ? json.expires_in : 1800,
    scope: typeof json.scope === "string" ? json.scope : "",
  };
}

export async function exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
  if (!code?.trim()) throw new Error("Authorization code is required");
  return postToken({ grant_type: "authorization_code", code: code.trim() });
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
  if (!refreshToken?.trim()) throw new Error("Refresh token is required");
  return postToken({ grant_type: "refresh_token", refresh_token: refreshToken.trim() });
}

export type OAuthTokenStore = {
  accessEncrypted: string;
  refreshEncrypted: string;
  expiresAt: string;
  scope: string;
};

export function persistOAuthTokens(token: OAuthTokenResponse): OAuthTokenStore {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  return {
    accessEncrypted: encryptSecret(token.access_token),
    refreshEncrypted: encryptSecret(token.refresh_token),
    expiresAt,
    scope: token.scope,
  };
}

/** GET /v2/me with an explicit Bearer token — no global override. */
export async function getCalMeProfileWithToken(token: string): Promise<{
  id: number;
  username: string;
  email: string;
  name: string | null;
  timeZone: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch("https://api.cal.com/v2/me", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "cal-api-version": "2024-06-14",
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message : `Cal.com /me failed (${res.status})`;
    throw new Error(msg);
  }

  const data = (json.data ?? json) as Record<string, unknown>;
  const username = String(data.username ?? "").trim();
  const id = Number(data.id);

  if (!username || !Number.isFinite(id)) {
    throw new Error("Cal.com /me response missing username");
  }

  return {
    id,
    username,
    email: String(data.email ?? "").trim(),
    name: typeof data.name === "string" ? data.name : null,
    timeZone: typeof data.timeZone === "string" ? data.timeZone : "",
  };
}
