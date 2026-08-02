import { createAdminClient } from "@/lib/supabase/admin";
import {
  CHAT_EVENTS_TAIL_LIMIT,
  CHAT_MESSAGE_INITIAL_LIMIT,
  CHAT_MESSAGE_PAGE_LIMIT,
} from "@/lib/chat-limits";
import {
  redactBookingSecrets,
  redactBookingSecretsDeep,
} from "@/lib/chat-redact";
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
  channel: string | null;
  external_user_id: string | null;
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
  | "channel"
  | "external_user_id"
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

/** Stable chronological order when created_at ties (same-batch inserts). */
export function compareChatMessagesChronological(
  a: Pick<ChatMessageRow, "created_at" | "eve_event_index" | "role" | "id">,
  b: Pick<ChatMessageRow, "created_at" | "eve_event_index" | "role" | "id">,
): number {
  const ta = a.created_at;
  const tb = b.created_at;
  if (ta !== tb) return ta < tb ? -1 : 1;

  const ea = a.eve_event_index ?? 0;
  const eb = b.eve_event_index ?? 0;
  if (ea !== eb) return ea - eb;

  const roleRank = (role: ChatMessageRow["role"]) => {
    if (role === "user") return 0;
    if (role === "assistant") return 1;
    if (role === "tool") return 2;
    return 3;
  };
  const ra = roleRank(a.role);
  const rb = roleRank(b.role);
  if (ra !== rb) return ra - rb;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const SESSION_LIST_SELECT =
  "id, title, status, eve_session_id, visitor_id, user_id, channel, external_user_id, last_message_at, created_at, updated_at";

/** Ownership / mutate paths — skip heavy `events` blob. */
const SESSION_AUTH_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, continuation_token, stream_index, channel, external_user_id, last_message_at, created_at, updated_at";

const SESSION_FULL_SELECT =
  "id, workspace_id, eve_session_id, visitor_id, user_id, title, status, continuation_token, stream_index, events, channel, external_user_id, last_message_at, created_at, updated_at";

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
  /** When false, skip the `events` column (mutate / persist auth checks). */
  includeEvents?: boolean;
}): Promise<ChatSessionRow | null> {
  const supabase = createAdminClient();
  const includeEvents = input.includeEvents !== false;
  const workspaceId = input.workspaceId ?? getDefaultWorkspaceId();

  const result = includeEvents
    ? await supabase
        .from("chat_sessions")
        .select(SESSION_FULL_SELECT)
        .eq("id", input.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle()
    : await supabase
        .from("chat_sessions")
        .select(SESSION_AUTH_SELECT)
        .eq("id", input.id)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

  const { data, error } = result;
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as ChatSessionRow;
  if (!includeEvents && row.events === undefined) {
    row.events = [];
  }
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
    .order("eve_event_index", { ascending: false, nullsFirst: false })
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
  // Chronological ascending for UI (stable when created_at ties)
  const messages = slice.slice().sort(compareChatMessagesChronological);
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
  return ((data ?? []) as ChatMessageRow[]).slice().sort(
    compareChatMessagesChronological,
  );
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
    includeEvents: false,
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
    // Persist a bounded tail only — full Eve event logs can be huge / non-JSON-safe.
    patch.events = redactBookingSecretsDeep(tailChatEvents(input.events));
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
 * Conflict on (session_id, eve_message_id) → skip (created_at preserved).
 *
 * Uses select+insert instead of PostgREST `onConflict` because the unique
 * guard is a partial index (`WHERE eve_message_id IS NOT NULL`), which
 * PostgREST cannot target for ON CONFLICT — that path returned 500s.
 */
export async function upsertChatMessages(input: {
  sessionId: string;
  messages: ProjectedChatMessage[];
}): Promise<void> {
  const supabase = createAdminClient();
  const baseMs = Date.now();

  if (input.messages.length === 0) {
    return;
  }

  const stamped = input.messages.map((m, index) => ({
    m,
    index,
    // Stagger timestamps so same-batch user→assistant keep chronological order
    // (UUID id alone is not insertion-ordered).
    created_at: new Date(baseMs + index).toISOString(),
  }));

  const withEveId = stamped.filter((row) => row.m.eve_message_id?.trim());
  const withoutEveId = stamped.filter((row) => !row.m.eve_message_id?.trim());

  if (withEveId.length > 0) {
    const eveIds = [
      ...new Set(withEveId.map((row) => row.m.eve_message_id!.trim())),
    ];
    const { data: existing, error: existingError } = await supabase
      .from("chat_messages")
      .select("eve_message_id")
      .eq("session_id", input.sessionId)
      .in("eve_message_id", eveIds);

    if (existingError) throw new Error(existingError.message);

    const seen = new Set(
      (existing ?? [])
        .map((row) => row.eve_message_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );

    const rows = withEveId
      .filter((row) => {
        const id = row.m.eve_message_id!.trim();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((row) => ({
        session_id: input.sessionId,
        role: row.m.role,
        content: redactBookingSecrets(row.m.content),
        eve_message_id: row.m.eve_message_id!.trim(),
        eve_event_index: row.index,
        raw:
          (redactBookingSecretsDeep(row.m.raw ?? null) as object | null) ??
          null,
        created_at: row.created_at,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("chat_messages").insert(rows);
      if (error) throw new Error(error.message);
    }
  }

  if (withoutEveId.length > 0) {
    const rows = withoutEveId.map((row) => ({
      session_id: input.sessionId,
      role: row.m.role,
      content: redactBookingSecrets(row.m.content),
      eve_message_id: null,
      eve_event_index: row.index,
      raw:
        (redactBookingSecretsDeep(row.m.raw ?? null) as object | null) ?? null,
      created_at: row.created_at,
    }));
    const { error } = await supabase.from("chat_messages").insert(rows);
    if (error) throw new Error(error.message);
  }

  const now = new Date(baseMs + Math.max(0, input.messages.length - 1)).toISOString();
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

// ── Channel-keyed sessions (Messenger, Zalo, etc.) ──

/** Synthetic visitorId for channel sessions so booking ownership (S1) works unchanged. */
export function channelVisitorId(channel: string, externalUserId: string): string {
  return `${channel}:${externalUserId}`;
}

export async function getChannelSession(input: {
  workspaceId: string;
  channel: string;
  externalUserId: string;
}): Promise<ChatSessionRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_FULL_SELECT)
    .eq("workspace_id", input.workspaceId)
    .eq("channel", input.channel)
    .eq("external_user_id", input.externalUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ChatSessionRow) ?? null;
}

export async function getOrCreateChannelSession(input: {
  workspaceId: string;
  channel: string;
  externalUserId: string;
  visitorId: string;
  title?: string;
}): Promise<ChatSessionRow> {
  const existing = await getChannelSession(input);
  if (existing) return existing;

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("chat_sessions")
    .insert({
      workspace_id: input.workspaceId,
      channel: input.channel,
      external_user_id: input.externalUserId,
      visitor_id: input.visitorId,
      title: input.title?.trim() || "New chat",
      status: "active",
      stream_index: 0,
      events: [],
      created_at: now,
      updated_at: now,
    })
    .select(SESSION_FULL_SELECT)
    .single();

  if (error) {
    // Race: another request created the session between our read and insert.
    if (error.code === "23505") {
      const retry = await getChannelSession(input);
      if (retry) return retry;
    }
    throw new Error(error.message);
  }
  return data as ChatSessionRow;
}

/** Resolve a chat_session row by the eve runtime session id. */
export async function findChatSessionByEveSessionId(
  eveSessionId: string,
): Promise<ChatSessionRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select(SESSION_FULL_SELECT)
    .eq("eve_session_id", eveSessionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as ChatSessionRow) ?? null;
}

/**
 * Has this provider message id already been stored for the session?
 *
 * Channels retry a webhook when they do not get a timely 200. Without this
 * check a retry is answered a second time and billed a second LLM turn.
 */
export async function chatMessageExists(
  sessionId: string,
  eveMessageId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("session_id", sessionId)
    .eq("eve_message_id", eveMessageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Bump session metadata from a trusted (server-side) channel handler.
 * Does NOT run the visitor-ownership gate — channels are server-trusted.
 */
export async function touchChannelSession(input: {
  id: string;
  title?: string;
  eveSessionId?: string;
  continuationToken?: string;
}): Promise<void> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) patch.title = input.title;
  if (input.eveSessionId !== undefined) patch.eve_session_id = input.eveSessionId;
  if (input.continuationToken !== undefined) patch.continuation_token = input.continuationToken;

  const { error } = await supabase
    .from("chat_sessions")
    .update(patch)
    .eq("id", input.id);

  // A lost eve_session_id makes findChatSessionByEveSessionId() return null,
  // so the agent's reply is never delivered back to the channel.
  if (error) {
    console.error(`[chat] touchChannelSession failed for ${input.id}`, error);
  }
}
