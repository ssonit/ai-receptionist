import {
  getChatMessagesAfter,
  getChatMessagesPage,
  getChatSessionForActor,
  messageCursorFromRow,
  titleFromFirstUserMessage,
  updateChatSessionState,
  upsertChatMessages,
  CHAT_MESSAGE_PAGE_LIMIT,
  type ProjectedChatMessage,
} from "@/lib/chat-sessions";
import {
  chatErrorResponse,
  getChatActor,
  getChatWorkspaceId,
  jsonError,
} from "@/lib/chat-api";
import {
  checkAgentRateLimit,
  clientIpFromRequest,
} from "@/lib/agent-rate-limit";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createNotificationDebounced } from "@/lib/notifications-write";

type Params = { params: Promise<{ id: string }> };

/** Cursor page of messages (load earlier). */
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor(request);
    const workspaceId = await getChatWorkspaceId(request);
    const session = await getChatSessionForActor({
      id,
      visitorId,
      userId,
      workspaceId,
    });
    if (!session) return jsonError("Session not found", 404);

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : CHAT_MESSAGE_PAGE_LIMIT;
    const messageLimit =
      Number.isFinite(limit) && limit > 0 ? limit : CHAT_MESSAGE_PAGE_LIMIT;

    if (after !== null) {
      const messages = await getChatMessagesAfter(id, after, messageLimit);
      const lastMessage = messages.at(-1);
      return Response.json({
        messages,
        replyMode: session.reply_mode,
        cursor: lastMessage ? messageCursorFromRow(lastMessage) : after,
      });
    }

    const page = await getChatMessagesPage(id, {
      before,
      limit: messageLimit,
    });

    return Response.json({ ...page, replyMode: session.reply_mode });
  } catch (error) {
    return chatErrorResponse(error, "Failed to load messages");
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor(request);
    const workspaceId = await getChatWorkspaceId(request);
    const session = await getChatSessionForActor({
      id,
      visitorId,
      userId,
      workspaceId,
      includeEvents: false,
    });
    if (!session) {
      console.warn("[chat] persist session not found", {
        id,
        workspaceId,
        visitor: visitorId.slice(0, 8),
        user: userId ? "yes" : "no",
      });
      return jsonError("Session not found", 404);
    }

    const body = (await request.json()) as {
      messages?: ProjectedChatMessage[];
      eveSessionId?: string | null;
      continuationToken?: string | null;
      streamIndex?: number;
      events?: unknown;
      title?: string;
      /** "staff" = a guest message the widget posted instead of running a turn. */
      mode?: string;
    };

    // A staff-mode post is the guest talking with the agent switched off, so
    // this route is the only gate on it — everything else here persists a turn
    // that agent/channels/eve.ts already metered. Same limiter, same buckets.
    const staffMode = body.mode === "staff";
    if (staffMode) {
      const limited = await checkAgentRateLimit({
        visitorId,
        ip: clientIpFromRequest(request),
        workspaceSlug: new URL(request.url).searchParams.get("w"),
      });
      if (!limited.ok) return jsonError("Too many messages", 429);
    }

    // Staff handed the conversation back between the widget's last poll and
    // this post. Storing it would strand the message: no agent turn ran, and
    // the human-mode notification below will not fire either. Store nothing
    // and say so, so the client can re-send through the agent without the
    // guest's message landing twice.
    if (staffMode && session.reply_mode !== "human") {
      return Response.json({
        ok: true,
        stored: false,
        replyMode: session.reply_mode,
      });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    await upsertChatMessages({ sessionId: id, messages });

    const firstUser = messages.find((m) => m.role === "user" && m.content.trim());

    // Staff hold this conversation, so the agent never ran for this message and
    // nothing else would tell them a guest replied. Same notice the messenger
    // and zalo handlers post (agent/channels/messenger.ts), debounced the same
    // way; it swallows its own errors, so a failure here cannot lose the
    // message the guest just sent.
    if (session.reply_mode === "human" && session.workspace_id && firstUser) {
      await createNotificationDebounced({
        type: "conversation_needs_reply",
        title: "New message in a conversation you took over",
        body: firstUser.content.slice(0, 140),
        severity: "high",
        workspaceId: session.workspace_id,
        entityType: "chat_session",
        entityId: session.id,
        href: `${DASHBOARD_PATH.conversations}?session=${session.id}`,
        windowMinutes: 5,
      });
    }

    const nextTitle =
      body.title ??
      ((session.title === "New chat" || session.title === "Chat mới") &&
      firstUser
        ? titleFromFirstUserMessage(firstUser.content)
        : undefined);

    const updated = await updateChatSessionState({
      id,
      visitorId,
      userId,
      workspaceId,
      eveSessionId: body.eveSessionId,
      continuationToken: body.continuationToken,
      streamIndex: body.streamIndex,
      events: body.events,
      title: nextTitle,
    });

    return Response.json({
      ok: true,
      session: updated
        ? {
            id: updated.id,
            title: updated.title,
            status: updated.status,
            eve_session_id: updated.eve_session_id,
            continuation_token: updated.continuation_token,
            stream_index: updated.stream_index,
            last_message_at: updated.last_message_at,
          }
        : null,
    });
  } catch (error) {
    return chatErrorResponse(error, "Failed to save messages");
  }
}
