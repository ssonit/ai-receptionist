/**
 * Messenger OAuth — clone of Cal.com OAuth pattern.
 * Signed state cookie, authorize URL build, token persistence.
 */
import {
  deleteChannelConnection,
  upsertChannelConnection,
} from "@/lib/channel-connections";

export function resolveMessengerRedirectUri(requestUrl: string): string {
  const envUri = process.env.META_REDIRECT_URI?.trim();
  if (envUri) return envUri;

  try {
    const url = new URL(requestUrl);
    return `${url.origin}/api/messenger/oauth/callback`;
  } catch {
    return "";
  }
}

export async function persistMessengerTokens(input: {
  workspaceId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
}): Promise<void> {
  await upsertChannelConnection({
    workspaceId: input.workspaceId,
    provider: "messenger",
    externalId: input.pageId,
    displayName: input.pageName,
    accessToken: input.pageAccessToken,
  });
}

export async function clearMessengerTokens(workspaceId: string): Promise<void> {
  // Delete rather than null the fields: a row that reports "disconnected"
  // while still holding a usable token keeps the bot answering.
  await deleteChannelConnection(workspaceId, "messenger");
}
