/**
 * Messenger OAuth — clone of Cal.com OAuth pattern.
 * Signed state cookie, authorize URL build, token persistence.
 */
import {
  deleteChannelConnection,
  upsertChannelConnection,
} from "@/lib/channel-connections";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/workspace-secrets";

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

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      messenger_page_id: input.pageId,
      messenger_page_name: input.pageName,
      messenger_page_access_token_encrypted: encryptSecret(input.pageAccessToken),
    })
    .eq("id", input.workspaceId);

  if (error) {
    // Keep dual-write consistent: if the legacy update fails, roll back the new row.
    await deleteChannelConnection(input.workspaceId, "messenger");
    throw new Error(error.message);
  }
}

export async function clearMessengerTokens(workspaceId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("workspaces")
    .update({
      messenger_page_id: null,
      messenger_page_name: null,
      messenger_page_access_token_encrypted: null,
    })
    .eq("id", workspaceId);

  if (error) throw new Error(error.message);

  // Delete rather than null the fields: a row that reports "disconnected"
  // while still holding a usable token keeps the bot answering.
  await deleteChannelConnection(workspaceId, "messenger");
}
