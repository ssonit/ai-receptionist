/**
 * Staff handoff: take a conversation from the agent, reply by hand, give it
 * back. Every function takes an explicit workspaceId and every query filters
 * on it — these tables grant writes to service_role only, so RLS will not
 * catch a mistake here (spec T1-T7).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getWorkspaceChatSession,
  upsertChatMessages,
  type ChatSessionRow,
  type ChatSessionReplyMode,
} from "@/lib/chat-sessions";
import { sendTextToSession } from "@/lib/channel-outbound";
import { APP_ERROR_CODE, type AppErrorCode } from "@/lib/errors";
import { createTranslator } from "@/lib/i18n";
import { getWorkspaceReplyLocale } from "@/lib/workspace";

export type HandoffResult = { ok: true } | { ok: false; code: AppErrorCode };

const SESSION_SELECT =
  "id, workspace_id, channel, external_user_id, reply_mode, claimed_by, claimed_at";

type HandoffSession = Pick<
  ChatSessionRow,
  "id" | "workspace_id" | "channel" | "external_user_id" | "reply_mode"
>;

/**
 * Flip reply_mode only if it currently holds `from`. Zero rows back means a
 * teammate got there first — that conditional update is the whole race guard,
 * so there is no read-then-write window to lose.
 */
async function switchReplyMode(input: {
  sessionId: string;
  workspaceId: string;
  from: ChatSessionReplyMode;
  patch: Record<string, unknown>;
}): Promise<HandoffSession | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("workspace_id", input.workspaceId)
    .eq("reply_mode", input.from)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as HandoffSession | null) ?? null;
}

/** Store the notice, then push it to the platform. Order matters. */
async function postHandoffNotice(
  session: HandoffSession,
  direction: "to_human" | "to_ai",
): Promise<void> {
  const workspaceId = session.workspace_id;
  if (!workspaceId) return;

  const locale = await getWorkspaceReplyLocale(workspaceId);
  const t = createTranslator(locale);
  const content = t(
    direction === "to_human" ? "chat.handoffToHuman" : "chat.handoffToAi",
  );

  await upsertChatMessages({
    sessionId: session.id,
    messages: [{ role: "system", content, raw: { kind: "handoff", direction } }],
  });

  if (!session.channel) return;
  try {
    await sendTextToSession(session as ChatSessionRow, content);
  } catch (error) {
    // The mode already changed and the notice is stored; a failed push must
    // not roll that back or throw into the staff member's button click.
    console.error("[handoff] notice push failed", session.id, error);
  }
}

export async function takeOverConversation(input: {
  sessionId: string;
  workspaceId: string;
  staffUserId: string;
}): Promise<HandoffResult> {
  const now = new Date().toISOString();
  const session = await switchReplyMode({
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    from: "ai",
    patch: {
      reply_mode: "human",
      claimed_by: input.staffUserId,
      claimed_at: now,
    },
  });

  if (!session) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_ALREADY_CLAIMED };
  }

  await postHandoffNotice(session, "to_human");
  return { ok: true };
}

export async function handBackConversation(input: {
  sessionId: string;
  workspaceId: string;
}): Promise<HandoffResult> {
  const session = await switchReplyMode({
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    from: "human",
    patch: { reply_mode: "ai", claimed_by: null, claimed_at: null },
  });

  if (!session) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE };
  }

  await postHandoffNotice(session, "to_ai");
  return { ok: true };
}

/** Map a platform send failure onto the channel's existing error code. */
function sendFailureCode(channel: string | null): AppErrorCode {
  if (channel === "messenger") return APP_ERROR_CODE.MESSENGER_SEND_FAILED;
  if (channel === "zalo") return APP_ERROR_CODE.ZALO_SEND_FAILED;
  return APP_ERROR_CODE.SAVE_FAILED;
}

export async function sendStaffMessage(input: {
  sessionId: string;
  workspaceId: string;
  staffUserId: string;
  staffName: string;
  text: string;
}): Promise<HandoffResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: APP_ERROR_CODE.INVALID_INPUT };

  // Scoped read: a session outside this workspace comes back null.
  const session = await getWorkspaceChatSession(input.sessionId, input.workspaceId);
  if (!session) return { ok: false, code: APP_ERROR_CODE.NOT_FOUND };
  if (!session.workspace_id) {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NO_WORKSPACE };
  }
  if (session.reply_mode !== "human") {
    return { ok: false, code: APP_ERROR_CODE.CONVERSATION_NOT_HUMAN_MODE };
  }

  // Store first. A failed platform send must leave the message visible to
  // staff with an error, not disappear.
  await upsertChatMessages({
    sessionId: session.id,
    messages: [
      {
        role: "assistant",
        content: text,
        eve_message_id: null,
        raw: {
          sentBy: "staff",
          staffUserId: input.staffUserId,
          staffName: input.staffName,
        },
      },
    ],
  });

  try {
    await sendTextToSession(session, text);
  } catch (error) {
    console.error("[handoff] staff send failed", session.id, error);
    return { ok: false, code: sendFailureCode(session.channel) };
  }

  return { ok: true };
}
