import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAT_EVENTS_TAIL_LIMIT,
  CHAT_MESSAGE_INITIAL_LIMIT,
  CHAT_MESSAGE_PAGE_LIMIT,
} from "@/lib/chat-limits";
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

/** Session payload safe for the browser (no full event log). */
export type ChatSessionClientRow = Omit<ChatSessionRow, "events"> & {
  events?: unknown;
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

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type ChatMessagesPage = {
  messages: ChatMessageRow[];
  /** Cursor for loading older messages (points at oldest in this page). */
  nextCursor: string | null;
  hasMore: boolean;
};

const SESSION_LIST_SELECT =
  "id, title, status, eve_session_id, visitor_id, user_id, last_message_at, created_at, updated_at";

const SESSION_FULL_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, continuation_token, stream_index, events, last_message_at, created_at, updated_at";

const MESSAGE_SELECT =
  "id, session_id, role, content, eve_message_id, eve_event_index, raw, created_at";

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    `${cursor.createdAt}\n${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeMessageCursor(raw: string): MessageCursor | null {
  try {
    const text = Buffer.from(raw, "base64url").toString("utf8");
    const [createdAt, id] = text.split("\n");
    if (!createdAt?.trim() || !id?.trim()) return null;
    return { createdAt: createdAt.trim(), id: id.trim() };
  } catch {
    return null;
  }
}

export function messageCursorFromRow(row: ChatMessageRow): string {
  return encodeMessageCursor({ createdAt: row.created_at, id: row.id });
}

/** Keep only the last N Eve stream events for optional client resume. */
export function tailChatEvents(
  events: unknown,
  limit: number = CHAT_EVENTS_TAIL_LIMIT,
): unknown[] {
  if (!Array.isArray(events)) return [];
  if (events.length <= limit) return events;
  return events.slice(-limit);
}

/** Strip heavy events for browser payloads. */
export function toClientSession(
  session: ChatSessionRow,
  options?: { includeEventTail?: boolean },
): ChatSessionClientRow {
  const { events, ...rest } = session;
  if (options?.includeEventTail) {
    return { ...rest, events: tailChatEvents(events) };
  }
  return { ...rest, events: [] };
}

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

/**
 * Keyset-paginated messages. Default: latest `limit` messages (ascending).
 * Pass `before` cursor to load older batches.
 */
export async function getChatMessagesPage(
  sessionId: string,
  options?: {
    limit?: number;
    before?: string | null;
  },
): Promise<ChatMessagesPage> {
  const supabase = createAdminClient();
  const limit = Math.min(
    Math.max(options?.limit ?? CHAT_MESSAGE_INITIAL_LIMIT, 1),
    100,
  );
  const before = options?.before
    ? decodeMessageCursor(options.before)
    : null;

  let query = supabase
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (before) {
    // (created_at, id) < (before.createdAt, before.id)
    query = query.or(
      `created_at.lt.${before.createdAt},and(created_at.eq.${before.createdAt},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ChatMessageRow[];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  // Return chronological ascending for UI
  const messages = slice.slice().reverse();
  const oldest = messages[0];
  return {
    messages,
    nextCursor: hasMore && oldest ? messageCursorFromRow(oldest) : null,
    hasMore,
  };
}

/** @deprecated Prefer getChatMessagesPage — kept for callers that need a full dump. */
export async function getChatMessages(
  sessionId: string,
): Promise<ChatMessageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ChatMessageRow[];
}

export async function countChatMessages(sessionId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return count ?? 0;
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

/**
 * Append / upsert projected messages without wiping history.
 * Conflict on (session_id, eve_message_id) → keep existing row (created_at preserved).
 */
export async function upsertChatMessages(input: {
  sessionId: string;
  messages: ProjectedChatMessage[];
}): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (input.messages.length === 0) {
    return;
  }

  const withEveId = input.messages.filter((m) => m.eve_message_id?.trim());
  const withoutEveId = input.messages.filter((m) => !m.eve_message_id?.trim());

  if (withEveId.length > 0) {
    const rows = withEveId.map((m, index) => ({
      session_id: input.sessionId,
      role: m.role,
      content: m.content,
      eve_message_id: m.eve_message_id!.trim(),
      eve_event_index: index,
      raw: m.raw ?? null,
      created_at: now,
    }));

    const { error } = await supabase.from("chat_messages").upsert(rows, {
      onConflict: "session_id,eve_message_id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
  }

  if (withoutEveId.length > 0) {
    const rows = withoutEveId.map((m, index) => ({
      session_id: input.sessionId,
      role: m.role,
      content: m.content,
      eve_message_id: null,
      eve_event_index: index,
      raw: m.raw ?? null,
      created_at: now,
    }));
    const { error } = await supabase.from("chat_messages").insert(rows);
    if (error) throw new Error(error.message);
  }

  await supabase
    .from("chat_sessions")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", input.sessionId);
}

/** @deprecated Use upsertChatMessages — wipe+insert loses history & timestamps. */
export async function replaceChatMessages(input: {
  sessionId: string;
  messages: ProjectedChatMessage[];
}): Promise<void> {
  await upsertChatMessages(input);
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

export { CHAT_MESSAGE_INITIAL_LIMIT, CHAT_MESSAGE_PAGE_LIMIT };
