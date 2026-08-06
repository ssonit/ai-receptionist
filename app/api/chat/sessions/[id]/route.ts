import {
  countChatMessages,
  getChatMessagesPage,
  getChatSessionForActor,
  toClientSession,
  updateChatSessionState,
  CHAT_MESSAGE_INITIAL_LIMIT,
} from "@/lib/chat-sessions";
import {
  chatErrorResponse,
  getChatActor,
  getChatWorkspaceId,
  jsonError,
} from "@/lib/chat-api";

type Params = { params: Promise<{ id: string }> };

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
    const limit = limitRaw
      ? Number(limitRaw)
      : before
        ? undefined
        : CHAT_MESSAGE_INITIAL_LIMIT;

    const page = await getChatMessagesPage(id, {
      before,
      limit:
        Number.isFinite(limit) && limit && limit > 0
          ? limit
          : before
            ? undefined
            : CHAT_MESSAGE_INITIAL_LIMIT,
      visibleAfter: session.guest_visible_after,
    });

    const messageCount = before
      ? undefined
      : await countChatMessages(id, {
          visibleAfter: session.guest_visible_after,
        }).catch(() => page.messages.length);

    return Response.json({
      session: toClientSession(session, { includeEventTail: true }),
      messages: page.messages,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      messageCount,
    });
  } catch (error) {
    return chatErrorResponse(error, "Failed to load session");
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor(request);
    const workspaceId = await getChatWorkspaceId(request);
    const body = (await request.json()) as {
      eveSessionId?: string | null;
      continuationToken?: string | null;
      streamIndex?: number;
      events?: unknown;
      title?: string;
      status?: "active" | "closed";
    };

    const session = await updateChatSessionState({
      id,
      visitorId,
      userId,
      workspaceId,
      eveSessionId: body.eveSessionId,
      continuationToken: body.continuationToken,
      streamIndex: body.streamIndex,
      events: body.events,
      title: body.title,
      status: body.status,
    });

    if (!session) return jsonError("Session not found", 404);
    return Response.json({
      session: toClientSession(session, { includeEventTail: false }),
    });
  } catch (error) {
    return chatErrorResponse(error, "Failed to update session");
  }
}
