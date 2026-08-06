import {
  getChatMessagesPage,
  restartGuestChatSession,
  toClientSession,
} from "@/lib/chat-sessions";
import {
  chatErrorResponse,
  getChatActor,
  getChatWorkspaceId,
  jsonError,
} from "@/lib/chat-api";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor(request);
    const workspaceId = await getChatWorkspaceId(request);
    const session = await restartGuestChatSession({
      id,
      visitorId,
      userId,
      workspaceId,
    });
    if (!session) return jsonError("Session not found", 404);

    const page = await getChatMessagesPage(id, {
      limit: 20,
      visibleAfter: session.guest_visible_after,
    });

    return Response.json({
      session: toClientSession(session, { includeEventTail: false }),
      messages: page.messages,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      messageCount: page.messages.length,
    });
  } catch (error) {
    return chatErrorResponse(error, "Failed to restart session");
  }
}
