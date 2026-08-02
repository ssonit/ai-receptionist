/**
 * Zalo OA OAuth — PKCE generation, redirect resolution, and connect/disconnect
 * persistence. Token refresh lives in the same module (added alongside) and
 * goes through lib/channel-connections.ts for storage.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  CHANNEL_EXTERNAL_ID_TAKEN,
  deleteChannelConnection,
  upsertChannelConnection,
} from "@/lib/channel-connections";
import { exchangeZaloCode, getZaloOaProfile } from "@/lib/zalo";

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

