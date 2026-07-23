import {
  createChatSession,
  listChatSessionsForActor,
} from "@/lib/chat-sessions";
import { getChatActor, getChatWorkspaceId, jsonError } from "@/lib/chat-api";

export async function GET(request: Request) {
  try {
    const { visitorId, userId } = await getChatActor();
    const workspaceId = await getChatWorkspaceId(request);
    const sessions = await listChatSessionsForActor({
      visitorId,
      userId,
      workspaceId,
    });
    return Response.json({ sessions, workspaceId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list sessions";
    return jsonError(message, 500);
  }
}

export async function POST(request: Request) {
  try {
    const { visitorId, userId } = await getChatActor();
    const workspaceId = await getChatWorkspaceId(request);
    let title: string | undefined;
    try {
      const body = (await request.json()) as { title?: string };
      title = body.title;
    } catch {
      // empty body ok
    }
    const session = await createChatSession({
      visitorId,
      userId,
      title,
      workspaceId,
    });
    return Response.json({ session });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    return jsonError(message, 500);
  }
}
