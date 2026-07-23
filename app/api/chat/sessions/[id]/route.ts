import {
  getChatMessages,
  getChatSessionForActor,
  updateChatSessionState,
} from "@/lib/chat-sessions";
import { getChatActor, jsonError } from "@/lib/chat-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor();
    const session = await getChatSessionForActor({ id, visitorId, userId });
    if (!session) return jsonError("Session not found", 404);
    const messages = await getChatMessages(id);
    return Response.json({ session, messages });
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
      eveSessionId: body.eveSessionId,
      continuationToken: body.continuationToken,
      streamIndex: body.streamIndex,
      events: body.events,
      title: body.title,
      status: body.status,
    });

    if (!session) return jsonError("Session not found", 404);
    return Response.json({ session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update session";
    return jsonError(message, 500);
  }
}
