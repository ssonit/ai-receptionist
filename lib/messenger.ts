/**
 * Facebook Messenger Platform — Send API + token management.
 * All functions throw on failure; callers wrap in try/catch.
 */

const META_GRAPH_API_BASE = "https://graph.facebook.com/v22.0";
const META_OAUTH_BASE = "https://graph.facebook.com/v22.0/oauth";
const META_DIALOG_BASE = "https://www.facebook.com/v22.0/dialog/oauth";

/** Messenger rejects a text message longer than this. */
export const MESSENGER_TEXT_LIMIT = 2000;

const META_FETCH_TIMEOUT_MS = 12_000;

/**
 * Graph API call with the access token in the `Authorization` header rather
 * than `?access_token=` — query strings land in proxy and CDN access logs, and
 * a page access token is long-lived.
 */
async function graphFetch(
  url: URL,
  accessToken: string,
  init?: RequestInit,
  timeoutMs = META_FETCH_TIMEOUT_MS,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      ...init,
      signal: controller.signal,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Meta request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Meta can answer with an HTML error page from an edge proxy; an unguarded
    // .json() would throw SyntaxError and mask the real status.
    const errJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = errJson.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof err?.message === "string"
        ? err.message
        : `Meta request failed (${res.status})`,
    );
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Split on paragraph/word boundaries so a long agent reply still delivers. */
export function chunkMessengerText(
  text: string,
  limit = MESSENGER_TEXT_LIMIT,
): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed ? [trimmed] : [];

  const chunks: string[] = [];
  let rest = trimmed;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    // Prefer a paragraph break, then a line break, then a space.
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

export const MESSENGER_SCOPES = [
  "pages_messaging",
  "pages_show_list",
  "pages_manage_metadata",
].join(",");

// ── Env validation ──

export function validateMessengerEnv(): {
  appId: string;
  appSecret: string;
} {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    throw new Error("MESSENGER_NOT_CONFIGURED");
  }

  return { appId, appSecret };
}

// ── OAuth URLs ──

export function buildMessengerOAuthUrl(state: string, redirectUri: string): string {
  const { appId } = validateMessengerEnv();
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: MESSENGER_SCOPES,
    response_type: "code",
  });
  return `${META_DIALOG_BASE}?${params.toString()}`;
}

// ── Token exchange ──

/**
 * Meta's `/oauth/access_token` takes `client_secret` as a query param — that is
 * the documented flow, so the transport stays as-is; this only adds the timeout
 * and JSON guards the Graph helper has.
 */
async function oauthFetch(url: URL): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Meta token exchange timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = errJson.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof err?.message === "string"
        ? err.message
        : `Meta token exchange failed (${res.status})`,
    );
  }
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
): Promise<string> {
  const { appId, appSecret } = validateMessengerEnv();

  const url = new URL(`${META_OAUTH_BASE}/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const json = await oauthFetch(url);
  if (typeof json.access_token !== "string") {
    throw new Error("Token exchange failed");
  }
  return json.access_token;
}

export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
): Promise<string> {
  const { appId, appSecret } = validateMessengerEnv();

  const url = new URL(`${META_OAUTH_BASE}/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("fb_exchange_token", shortLivedToken);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);

  const json = await oauthFetch(url);
  if (typeof json.access_token !== "string") {
    throw new Error("Long-lived token exchange failed");
  }
  return json.access_token;
}

// ── Page access ──

export type MessengerPageInfo = {
  id: string;
  name: string;
  accessToken: string;
};

export async function getPagesForUser(
  userToken: string,
): Promise<MessengerPageInfo[]> {
  const json = await graphFetch(
    new URL(`${META_GRAPH_API_BASE}/me/accounts`),
    userToken,
  );

  const data = json.data as Array<Record<string, unknown>> | undefined;
  if (!data?.length) return [];

  return data.flatMap((p) =>
    typeof p.id === "string" && typeof p.access_token === "string"
      ? [
          {
            id: p.id,
            name: (p.name as string) ?? "Unnamed Page",
            accessToken: p.access_token,
          },
        ]
      : [],
  );
}

/**
 * Subscribe a page to the app's webhook fields. Best-effort: the owner can do
 * it by hand in the Meta dashboard, so a failure is reported, not thrown.
 */
export async function subscribePageToApp(
  pageId: string,
  pageAccessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await graphFetch(
      new URL(`${META_GRAPH_API_BASE}/${pageId}/subscribed_apps`),
      pageAccessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscribed_fields: ["messages", "messaging_postbacks"],
        }),
      },
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "subscribe_failed",
    };
  }
}

// ── Send API ──

type MessengerSendResult = {
  messageId: string;
};

async function sendOneMessengerText(
  pageAccessToken: string,
  psid: string,
  text: string,
): Promise<MessengerSendResult> {
  const json = await graphFetch(
    new URL(`${META_GRAPH_API_BASE}/me/messages`),
    pageAccessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    },
  );

  return { messageId: String(json.message_id ?? "") };
}

/**
 * Send text to a PSID, splitting anything over Messenger's 2000-character
 * limit. An agent reply longer than that would otherwise be rejected whole and
 * the guest would see nothing. Returns the last message id.
 */
export async function sendMessengerText(
  pageAccessToken: string,
  psid: string,
  text: string,
): Promise<MessengerSendResult> {
  const chunks = chunkMessengerText(text);
  if (chunks.length === 0) return { messageId: "" };

  let last: MessengerSendResult = { messageId: "" };
  // Sequential on purpose — Messenger preserves send order per recipient.
  for (const chunk of chunks) {
    last = await sendOneMessengerText(pageAccessToken, psid, chunk);
  }
  return last;
}
