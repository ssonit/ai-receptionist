/**
 * Zalo OA OAuth — PKCE generation, redirect resolution, and connect/disconnect
 * persistence. Token refresh lives in the same module (added alongside) and
 * goes through lib/channel-connections.ts for storage.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  claimRefreshLock,
  deleteChannelConnection,
  getChannelConnection,
  releaseRefreshLock,
  upsertChannelConnection,
} from "@/lib/channel-connections";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createNotification } from "@/lib/notifications-write";
import { exchangeZaloCode, getZaloOaProfile, refreshZaloToken } from "@/lib/zalo";

export { CHANNEL_EXTERNAL_ID_TAKEN };

/** RFC 7636 PKCE pair. 32 random bytes base64url-encode to 43 characters. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function resolveZaloRedirectUri(requestUrl: string): string {
  const envUri = process.env.ZALO_REDIRECT_URI?.trim();
  if (envUri) return envUri;

  try {
    return `${new URL(requestUrl).origin}/api/zalo/oauth/callback`;
  } catch {
    return "";
  }
}

/**
 * Exchange the authorization code and store the connection.
 *
 * The OA profile is read before persisting: `oa_id` is the key the webhook
 * resolves a workspace by, so a connection stored without it would accept
 * tokens but never route an inbound message.
 *
 * @throws CHANNEL_EXTERNAL_ID_TAKEN when the OA already belongs to another workspace
 */
export async function connectZaloWorkspace(input: {
  workspaceId: string;
  code: string;
  codeVerifier: string;
}): Promise<{ oaId: string; oaName: string }> {
  const tokens = await exchangeZaloCode(input.code, input.codeVerifier);
  const profile = await getZaloOaProfile(tokens.accessToken);

  await upsertChannelConnection({
    workspaceId: input.workspaceId,
    provider: "zalo",
    externalId: profile.oaId,
    displayName: profile.name,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });

  return { oaId: profile.oaId, oaName: profile.name };
}

export async function disconnectZalo(workspaceId: string): Promise<void> {
  // Delete rather than null the fields — a row reporting "disconnected" while
  // holding a usable token keeps the agent answering.
  await deleteChannelConnection(workspaceId, "zalo");
}

/** Refresh this far ahead of expiry so a request never races its own token. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/** How long to wait for the caller holding the lock, and how often to look. */
const LOCK_WAIT_TOTAL_MS = 3_000;
const LOCK_WAIT_STEP_MS = 200;

/**
 * A refresh token Zalo has rejected outright is unrecoverable — the workspace
 * must reconnect. Distinguish that from a transient network failure so a blip
 * does not disconnect a working channel.
 */
function isUnrecoverable(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("refresh token") &&
    (message.includes("invalid") || message.includes("expired"))
  );
}

async function onCredentialsDead(workspaceId: string): Promise<void> {
  await disconnectZalo(workspaceId);
  // Without this the channel dies silently: the owner sees no error, only an
  // absence of messages.
  await createNotification({
    workspaceId,
    type: "ai_config",
    severity: "high",
    title: "Zalo OA disconnected",
    body: "Zalo rejected the saved credentials. Reconnect the Official Account in Settings to resume answering messages.",
    href: DASHBOARD_PATH.settings,
  });
}

/**
 * A valid Zalo access token for this workspace, refreshing if needed.
 *
 * Zalo access tokens live one hour and their refresh tokens are single-use, so
 * two concurrent refreshes would leave the workspace with no valid credential
 * at all. `claimRefreshLock` makes exactly one caller refresh; the others wait
 * and read the token it stored.
 *
 * @throws Error ZALO_NOT_CONFIGURED when no connection exists
 */
export async function getZaloAccessToken(workspaceId: string): Promise<string> {
  const conn = await getChannelConnection(workspaceId, "zalo");
  if (!conn?.accessToken) throw new Error("ZALO_NOT_CONFIGURED");

  const expiresAt = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  if (expiresAt - Date.now() > REFRESH_SKEW_MS) return conn.accessToken;

  const claim = await claimRefreshLock(workspaceId, "zalo");

  if (!claim.claimed) {
    // Another caller is refreshing. Poll for the token it writes.
    const deadline = Date.now() + LOCK_WAIT_TOTAL_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOCK_WAIT_STEP_MS));
      const latest = await getChannelConnection(workspaceId, "zalo");
      if (!latest?.accessToken) throw new Error("ZALO_NOT_CONFIGURED");
      const latestExpiry = latest.expiresAt ? new Date(latest.expiresAt).getTime() : 0;
      if (latestExpiry - Date.now() > REFRESH_SKEW_MS) return latest.accessToken;
    }
    throw new Error("ZALO_REFRESH_TIMEOUT");
  }

  if (!claim.refreshToken) {
    await releaseRefreshLock(workspaceId, "zalo");
    await onCredentialsDead(workspaceId);
    throw new Error("ZALO_NOT_CONFIGURED");
  }

  try {
    const tokens = await refreshZaloToken(claim.refreshToken);
    // upsertChannelConnection clears refresh_lock_at as part of the write.
    await upsertChannelConnection({
      workspaceId,
      provider: "zalo",
      externalId: conn.externalId,
      displayName: conn.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      metadata: conn.metadata,
    });
    return tokens.accessToken;
  } catch (error) {
    await releaseRefreshLock(workspaceId, "zalo");
    if (isUnrecoverable(error)) await onCredentialsDead(workspaceId);
    throw error;
  }
}

