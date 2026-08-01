import {
  getChatMessagesPage,
  getChatSessionForActor,
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
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : CHAT_MESSAGE_PAGE_LIMIT;

    const page = await getChatMessagesPage(id, {
      before,
      limit: Number.isFinite(limit) && limit > 0 ? limit : CHAT_MESSAGE_PAGE_LIMIT,
    });

    return Response.json(page);
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
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    await upsertChatMessages({ sessionId: id, messages });

    const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
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
