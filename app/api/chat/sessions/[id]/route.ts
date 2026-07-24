import {
  countChatMessages,
  getChatMessagesPage,
  getChatSessionForActor,
  toClientSession,
  updateChatSessionState,
  CHAT_MESSAGE_INITIAL_LIMIT,
} from "@/lib/chat-sessions";
import { getChatActor, getChatWorkspaceId, jsonError } from "@/lib/chat-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor();
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
    });

    const messageCount = before
      ? undefined
      : await countChatMessages(id).catch(() => page.messages.length);

    return Response.json({
      session: toClientSession(session, { includeEventTail: true }),
      messages: page.messages,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      messageCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load session";
    return jsonError(message, 500);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor();
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
    const message =
      error instanceof Error ? error.message : "Failed to update session";
    return jsonError(message, 500);
  }
}
