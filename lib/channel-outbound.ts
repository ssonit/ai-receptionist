/**
 * The single place that maps a chat session to an outbound platform send.
 *
 * Takes the session row rather than ids on purpose: the workspace is read
 * from `session.workspace_id` here, so no caller can pass a different one and
 * push a tenant's reply through another tenant's page token (spec T4).
 */
import type { ChatSessionRow } from "@/lib/chat-sessions";
import { sendMessengerText } from "@/lib/messenger";
import {
  getMessengerCredentialsForWorkspace,
  getZaloCredentialsForWorkspace,
} from "@/lib/workspace";
import { sendZaloText } from "@/lib/zalo";

export async function sendTextToSession(
  session: ChatSessionRow,
  text: string,
): Promise<void> {
  // Web sessions have no channel: the row in chat_messages is the delivery,
  // and the guest widget's poll picks it up.
  if (!session.channel) return;

  const workspaceId = session.workspace_id;
  if (!workspaceId) throw new Error("SESSION_NO_WORKSPACE");

  const externalUserId = session.external_user_id;
  if (!externalUserId) throw new Error("SESSION_NO_EXTERNAL_ID");

  switch (session.channel) {
    case "messenger": {
      const creds = await getMessengerCredentialsForWorkspace(workspaceId);
      await sendMessengerText(creds.pageAccessToken, externalUserId, text);
      return;
    }
    case "zalo": {
      // Goes through getZaloAccessToken() inside the helper, which refreshes an
      // expired token — reading the connection row directly would not.
      const creds = await getZaloCredentialsForWorkspace(workspaceId);
      await sendZaloText(creds.accessToken, externalUserId, text);
      return;
    }
    default:
      // A non-null channel we do not know is a bug, not a web session. Failing
      // loudly beats silently reporting a delivered message.
      throw new Error("UNKNOWN_CHANNEL");
  }
}
