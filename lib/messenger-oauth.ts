/**
 * Messenger OAuth — clone of Cal.com OAuth pattern.
 * Signed state cookie, authorize URL build, token persistence.
 */
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
  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    messenger_page_id: input.pageId,
    messenger_page_name: input.pageName,
    messenger_page_access_token_encrypted: encryptSecret(input.pageAccessToken),
  };

  const { error } = await admin
    .from("workspaces")
    .update(update)
    .eq("id", input.workspaceId);

  if (error) throw new Error(error.message);
}

export async function clearMessengerTokens(workspaceId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("workspaces")
    .update({
      messenger_page_id: null,
      messenger_page_name: null,
      messenger_page_access_token_encrypted: null,
    })
    .eq("id", workspaceId);

  // Without this the settings action reports "disconnected" while the page
  // token is still stored and the bot keeps answering.
  if (error) throw new Error(error.message);
}
