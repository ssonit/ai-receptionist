import {
  countChatMessages,
  getChatMessagesPage,
  listWorkspaceChatSessions,
  type ChatMessageRow,
  type ChatSessionListItem,
  type ChatSessionReplyMode,
} from "@/lib/chat-sessions";
import { CHAT_MESSAGE_INITIAL_LIMIT } from "@/lib/chat-limits";
import {
  redactBookingSecrets,
  redactBookingSecretsDeep,
} from "@/lib/chat-redact";
import { createClient } from "@/lib/supabase/server";
import { getSessionWorkspaceId } from "@/lib/workspace-session";

export type ConversationOutcome =
  | "booked"
  | "lead"
  | "errors"
  | "abandoned"
  | "empty";

export type ConversationListRow = ChatSessionListItem & {
  outcome: ConversationOutcome;
  has_booking: boolean;
  has_lead: boolean;
  has_tool_error: boolean;
  message_count: number;
};

export type ConversationDetail = {
  session: ChatSessionListItem & {
    eve_session_id: string | null;
    continuation_token?: string | null;
    reply_mode: ChatSessionReplyMode;
    claimed_by: string | null;
    claimedByName: string | null;
  };
  messages: ChatMessageRow[];
  nextCursor: string | null;
  hasMore: boolean;
  messageCount: number;
  leadId: string | null;
  bookingId: string | null;
  toolErrors: {
    id: string;
    tool_name: string;
    error: string | null;
    created_at: string;
  }[];
  outcome: ConversationOutcome;
};

function classifyOutcome(input: {
  messageCount: number;
  hasBooking: boolean;
  hasLead: boolean;
  hasToolError: boolean;
}): ConversationOutcome {
  if (input.hasToolError) return "errors";
  if (input.hasBooking) return "booked";
  if (input.hasLead) return "lead";
  if (input.messageCount > 0) return "abandoned";
  return "empty";
}

export async function loadConversationsDashboard(limit = 100): Promise<{
  rows: ConversationListRow[];
}> {
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return { rows: [] };
  const sessions = await listWorkspaceChatSessions(workspaceId, limit);
  const supabase = await createClient();

  const eveIds = sessions
    .map((s) => s.eve_session_id)
    .filter((id): id is string => Boolean(id));

  const sessionIds = sessions.map((s) => s.id);

  const [bookingsRes, leadsRes, toolsRes, countsRes] = await Promise.all([
    eveIds.length
      ? supabase
          .from("bookings")
          .select("id, session_id")
          .eq("workspace_id", workspaceId)
          .in("session_id", eveIds)
      : Promise.resolve({ data: [] as { id: string; session_id: string }[] }),
    eveIds.length
      ? supabase
          .from("leads")
          .select("id, session_id")
          .eq("workspace_id", workspaceId)
          .in("session_id", eveIds)
      : Promise.resolve({ data: [] as { id: string; session_id: string }[] }),
    eveIds.length
      ? supabase
          .from("agent_tool_events")
          .select("id, session_id")
          .eq("workspace_id", workspaceId)
          .eq("ok", false)
          .in("session_id", eveIds)
      : Promise.resolve({ data: [] as { id: string; session_id: string }[] }),
    sessionIds.length
      ? supabase.from("chat_messages").select("session_id").in("session_id", sessionIds)
      : Promise.resolve({ data: [] as { session_id: string }[] }),
  ]);

  const bookingSet = new Set(
    (bookingsRes.data ?? []).map((b) => b.session_id).filter(Boolean),
  );
  const leadSet = new Set(
    (leadsRes.data ?? []).map((l) => l.session_id).filter(Boolean),
  );
  const errorSet = new Set(
    (toolsRes.data ?? []).map((t) => t.session_id).filter(Boolean),
  );
  const messageCount = new Map<string, number>();
  for (const row of countsRes.data ?? []) {
    messageCount.set(row.session_id, (messageCount.get(row.session_id) ?? 0) + 1);
  }

  const rows: ConversationListRow[] = sessions.map((s) => {
    const eve = s.eve_session_id;
    const has_booking = Boolean(eve && bookingSet.has(eve));
    const has_lead = Boolean(eve && leadSet.has(eve));
    const has_tool_error = Boolean(eve && errorSet.has(eve));
    const message_count = messageCount.get(s.id) ?? 0;
    return {
      ...s,
      has_booking,
      has_lead,
      has_tool_error,
      message_count,
      outcome: classifyOutcome({
        messageCount: message_count,
        hasBooking: has_booking,
        hasLead: has_lead,
        hasToolError: has_tool_error,
      }),
    };
  });

  return { rows };
}

export async function loadConversationDetail(
  id: string,
  options?: { before?: string | null; limit?: number },
): Promise<ConversationDetail | null> {
  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) return null;

  const { data: session, error } = await supabase
    .from("chat_sessions")
    .select(
      "id, title, status, reply_mode, claimed_by, claimed_at, eve_session_id, visitor_id, user_id, channel, external_user_id, last_message_at, created_at, updated_at, continuation_token",
    )
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !session) return null;

  let claimedByName: string | null = null;
  if (session.claimed_by) {
    const { data: claimer } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", session.claimed_by)
      .maybeSingle();
    claimedByName = claimer?.full_name || claimer?.email || null;
  }

  const page = await getChatMessagesPage(id, {
    before: options?.before,
    limit: options?.limit ?? CHAT_MESSAGE_INITIAL_LIMIT,
  });
  const messageCount = await countChatMessages(id).catch(
    () => page.messages.length,
  );
  const eve = session.eve_session_id as string | null;

  const [leadRes, bookingRes, toolsRes] = await Promise.all([
    eve
      ? supabase
          .from("leads")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("session_id", eve)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    eve
      ? supabase
          .from("bookings")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("session_id", eve)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    eve
      ? supabase
          .from("agent_tool_events")
          .select("id, tool_name, error, created_at")
          .eq("workspace_id", workspaceId)
          .eq("session_id", eve)
          .eq("ok", false)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  const has_booking = Boolean(bookingRes.data?.id);
  const has_lead = Boolean(leadRes.data?.id);
  const has_tool_error = (toolsRes.data ?? []).length > 0;

  return {
    session: {
      ...session,
      claimedByName,
    },
    messages: page.messages.map((m) => ({
      ...m,
      content: redactBookingSecrets(m.content),
      raw: redactBookingSecretsDeep(m.raw) as ChatMessageRow["raw"],
    })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    messageCount,
    leadId: leadRes.data?.id ?? null,
    bookingId: bookingRes.data?.id ?? null,
    toolErrors: toolsRes.data ?? [],
    outcome: classifyOutcome({
      messageCount,
      hasBooking: has_booking,
      hasLead: has_lead,
      hasToolError: has_tool_error,
    }),
  };
}
