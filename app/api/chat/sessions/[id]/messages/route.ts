import {
  getChatSessionForActor,
  replaceChatMessages,
  titleFromFirstUserMessage,
  updateChatSessionState,
  type ProjectedChatMessage,
} from "@/lib/chat-sessions";
import { getChatActor, jsonError } from "@/lib/chat-api";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { visitorId, userId } = await getChatActor();
    const session = await getChatSessionForActor({ id, visitorId, userId });
    if (!session) return jsonError("Session not found", 404);

    const body = (await request.json()) as {
      messages?: ProjectedChatMessage[];
      eveSessionId?: string | null;
      continuationToken?: string | null;
      streamIndex?: number;
      events?: unknown;
      title?: string;
    };

    const messages = Array.isArray(body.messages) ? body.messages : [];
    await replaceChatMessages({ sessionId: id, messages });

    const firstUser = messages.find((m) => m.role === "user" && m.content.trim());
    const nextTitle =
      body.title ??
      (session.title === "Chat mới" && firstUser
        ? titleFromFirstUserMessage(firstUser.content)
        : undefined);

    const updated = await updateChatSessionState({
      id,
      visitorId,
      userId,
      eveSessionId: body.eveSessionId,
      continuationToken: body.continuationToken,
      streamIndex: body.streamIndex,
      events: body.events,
      title: nextTitle,
    });

    return Response.json({ ok: true, session: updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save messages";
    return jsonError(message, 500);
  }
}
