/**
 * Facebook Messenger Platform — Send API + token management.
 * All functions throw on failure; callers wrap in try/catch.
 */
import { decryptSecret } from "@/lib/workspace-secrets";

const META_GRAPH_API_BASE = "https://graph.facebook.com/v22.0";
const META_OAUTH_BASE = "https://graph.facebook.com/v22.0/oauth";
const META_DIALOG_BASE = "https://www.facebook.com/v22.0/dialog/oauth";

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

type MessengerTokenResponse = {
  access_token: string;
  expires_in?: number;
};

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    const msg = typeof json.error === "object" && json.error
      ? (json.error as Record<string, unknown>).message ?? "Token exchange failed"
      : "Token exchange failed";
    throw new Error(String(msg));
  }
  return json.access_token as string;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof json.access_token !== "string") {
    throw new Error("Long-lived token exchange failed");
  }
  return json.access_token as string;
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
  const url = new URL(`${META_GRAPH_API_BASE}/me/accounts`);
  url.searchParams.set("access_token", userToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error("Failed to fetch pages");

  const data = json.data as Array<Record<string, unknown>> | undefined;
  if (!data?.length) return [];

  return data
    .filter((p) => typeof p.id === "string" && typeof p.access_token === "string")
    .map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "Unnamed Page",
      accessToken: p.access_token as string,
    }));
}

// ── Send API ──

type MessengerSendResult = {
  messageId: string;
};

export async function sendMessengerText(
  pageAccessToken: string,
  psid: string,
  text: string,
): Promise<MessengerSendResult> {
  const url = new URL(`${META_GRAPH_API_BASE}/me/messages`);
  url.searchParams.set("access_token", pageAccessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as Record<string, unknown> | undefined;
    throw new Error(
      typeof err?.message === "string" ? err.message : `Send failed (${res.status})`,
    );
  }

  return { messageId: String(json.message_id ?? "") };
}

// ── User profile (best-effort) ──

export async function getMessengerUserProfile(
  pageAccessToken: string,
  psid: string,
): Promise<{ firstName: string; lastName: string } | null> {
  const url = new URL(`${META_GRAPH_API_BASE}/${psid}`);
  url.searchParams.set("fields", "first_name,last_name");
  url.searchParams.set("access_token", pageAccessToken);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof json.first_name !== "string") return null;

  return {
    firstName: json.first_name as string,
    lastName: (json.last_name as string) ?? "",
  };
}

// ── Workspace credential access ──

/**
 * Decrypt the stored page access token for a workspace.
 * Throws MESSENGER_NOT_CONFIGURED if not set up.
 */
export function getPageAccessTokenForWorkspace(row: {
  messenger_page_access_token_encrypted?: string | null;
}): string {
  if (!row.messenger_page_access_token_encrypted?.trim()) {
    throw new Error("MESSENGER_NOT_CONFIGURED");
  }
  return decryptSecret(row.messenger_page_access_token_encrypted);
}
