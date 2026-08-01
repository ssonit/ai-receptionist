import {
  createChatSession,
  listChatSessionsForActor,
} from "@/lib/chat-sessions";
import {
  chatErrorResponse,
  getChatActor,
  getChatWorkspaceId,
} from "@/lib/chat-api";

export async function GET(request: Request) {
  try {
    const { visitorId, userId } = await getChatActor(request);
    const workspaceId = await getChatWorkspaceId(request);
    const sessions = await listChatSessionsForActor({
      visitorId,
      userId,
      workspaceId,
    });
    return Response.json({ sessions, workspaceId });
  } catch (error) {
    return chatErrorResponse(error, "Failed to list sessions");
  }
}

export async function POST(request: Request) {
  try {
    const { visitorId, userId } = await getChatActor(request);
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
    return chatErrorResponse(error, "Failed to create session");
  }
}
