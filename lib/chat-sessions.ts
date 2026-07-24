import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export type ChatSessionStatus = "active" | "closed";

export type ChatSessionRow = {
  id: string;
  workspace_id: string | null;
  eve_session_id: string | null;
  visitor_id: string | null;
  user_id: string | null;
  title: string;
  status: ChatSessionStatus;
  continuation_token: string | null;
  stream_index: number;
  events: unknown;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  eve_message_id: string | null;
  eve_event_index: number | null;
  raw: unknown;
  created_at: string;
};

export type ChatSessionListItem = Pick<
  ChatSessionRow,
  | "id"
  | "title"
  | "status"
  | "eve_session_id"
  | "visitor_id"
  | "user_id"
  | "last_message_at"
  | "created_at"
  | "updated_at"
>;

export type ProjectedChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  eve_message_id?: string | null;
  raw?: unknown;
};

const SESSION_LIST_SELECT =
  "id, title, status, eve_session_id, visitor_id, user_id, last_message_at, created_at, updated_at";

const SESSION_FULL_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, continuation_token, stream_index, events, last_message_at, created_at, updated_at";

export async function listChatSessionsForActor(input: {
  visitorId: string;
  userId?: string | null;
  workspaceId?: string;
  limit?: number;
}): Promise<ChatSessionListItem[]> {
  const supabase = createAdminClient();
  const workspaceId = input.workspaceId ?? getDefaultWorkspaceId();
  const limit = input.limit ?? 50;

  let query = supabase
    .from("chat_sessions")
    .select(SESSION_LIST_SELECT)
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (input.userId) {
    query = query.or(
      `user_id.eq.${input.userId},visitor_id.eq.${input.visitorId}`,
    );
  } else {
    query = query.eq("visitor_id", input.visitorId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ChatSessionListItem[];
}

export async function createChatSession(input: {
  visitorId: string;
  userId?: string | null;
  title?: string;
  workspaceId?: string;
}): Promise<ChatSessionRow> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const workspaceId = input.workspaceId ?? getDefaultWorkspaceId();

  if (input.userId) {
    await claimVisitorSessions({
      visitorId: input.visitorId,
      userId: input.userId,
      workspaceId,
    });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      workspace_id: workspaceId,
      visitor_id: input.visitorId,
      user_id: input.userId ?? null,
      title: input.title?.trim() || "New chat",
      status: "active",
      stream_index: 0,
      events: [],
      created_at: now,
      updated_at: now,
    })
    .select(SESSION_FULL_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as ChatSessionRow;
}

export async function claimVisitorSessions(input: {
  visitorId: string;
  userId: string;
  workspaceId?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("chat_sessions")
    .update({ user_id: input.userId, updated_at: new Date().toISOString() })
    .eq("workspace_id", input.workspaceId ?? getDefaultWorkspaceId())
    .eq("visitor_id", input.visitorId)
    .is("user_id", null);
}

export async function getChatSessionForActor(input: {
  id: string;
  visitorId: string;
  userId?: string | null;
  workspaceId?: string;
}): Promise<ChatSessionRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_FULL_SELECT)
    .eq("id", input.id)
    .eq("workspace_id", input.workspaceId ?? getDefaultWorkspaceId())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as ChatSessionRow;
  if (!actorOwnsSession(row, input.visitorId, input.userId)) return null;
  return row;
}

export function actorOwnsSession(
  row: Pick<ChatSessionRow, "visitor_id" | "user_id">,
  visitorId: string,
  userId?: string | null,
): boolean {
  if (row.visitor_id && row.visitor_id === visitorId) return true;
  if (userId && row.user_id && row.user_id === userId) return true;
  return false;
}

export async function getChatMessages(
  sessionId: string,
): Promise<ChatMessageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(
      "id, session_id, role, content, eve_message_id, eve_event_index, raw, created_at",
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ChatMessageRow[];
}

export async function updateChatSessionState(input: {
  id: string;
  visitorId: string;
  userId?: string | null;
  workspaceId?: string;
  eveSessionId?: string | null;
  continuationToken?: string | null;
  streamIndex?: number;
  events?: unknown;
  title?: string;
  status?: ChatSessionStatus;
}): Promise<ChatSessionRow | null> {
  const existing = await getChatSessionForActor({
    id: input.id,
    visitorId: input.visitorId,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
  if (!existing) return null;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.eveSessionId !== undefined) {
    patch.eve_session_id = input.eveSessionId;
  }
  if (input.continuationToken !== undefined) {
    patch.continuation_token = input.continuationToken;
  }
  if (input.streamIndex !== undefined) {
    patch.stream_index = input.streamIndex;
  }
  if (input.events !== undefined) {
    patch.events = input.events;
  }
  if (input.title !== undefined) {
    patch.title = input.title.trim() || existing.title;
  }
  if (input.status !== undefined) {
    patch.status = input.status;
  }
  if (input.userId && !existing.user_id) {
    patch.user_id = input.userId;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .update(patch)
    .eq("id", input.id)
    .select(SESSION_FULL_SELECT)
    .single();

  if (error) throw new Error(error.message);
  return data as ChatSessionRow;
}

export async function replaceChatMessages(input: {
  sessionId: string;
  messages: ProjectedChatMessage[];
}): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { error: delError } = await supabase
    .from("chat_messages")
    .delete()
    .eq("session_id", input.sessionId);
  if (delError) throw new Error(delError.message);

  if (input.messages.length === 0) {
    await supabase
      .from("chat_sessions")
      .update({ last_message_at: null, updated_at: now })
      .eq("id", input.sessionId);
    return;
  }

  const rows = input.messages.map((m, index) => ({
    session_id: input.sessionId,
    role: m.role,
    content: m.content,
    eve_message_id: m.eve_message_id ?? null,
    eve_event_index: index,
    raw: m.raw ?? null,
    created_at: now,
  }));

  const { error: insError } = await supabase.from("chat_messages").insert(rows);
  if (insError) throw new Error(insError.message);

  await supabase
    .from("chat_sessions")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", input.sessionId);
}

/** Staff dashboard: list recent sessions for workspace. */
export async function listWorkspaceChatSessions(
  workspaceId: string = getDefaultWorkspaceId(),
  limit = 100,
): Promise<ChatSessionListItem[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_LIST_SELECT)
    .eq("workspace_id", workspaceId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ChatSessionListItem[];
}

export async function getWorkspaceChatSession(
  id: string,
  workspaceId: string = getDefaultWorkspaceId(),
): Promise<ChatSessionRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_FULL_SELECT)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ChatSessionRow) ?? null;
}

export function titleFromFirstUserMessage(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New chat";
  return cleaned.length > 48 ? `${cleaned.slice(0, 48)}…` : cleaned;
}
