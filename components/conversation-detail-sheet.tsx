"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  formatConversationWhen,
  outcomeBadgeClass,
  outcomeLabel,
} from "@/components/conversation-display";
import type { ConversationOutcome } from "@/lib/conversations-dashboard";
import {
  compareChatMessagesChronological,
  type ChatMessageRow,
} from "@/lib/chat-sessions";
import { cn } from "@/lib/utils";
import {
  handBackAction,
  sendStaffMessageAction,
  takeOverAction,
} from "@/app/dashboard/(main)/conversations/actions";

/** Matches the guest widget's poll in app/_components/agent-chat.tsx. */
const REFRESH_INTERVAL_MS = 10_000;

type ToolErrorRow = {
  id: string;
  tool_name: string;
  error: string | null;
  created_at: string;
};

type DetailPayload = {
  session?: {
    title?: string;
    eve_session_id?: string | null;
    reply_mode?: string;
    claimedByName?: string | null;
  };
  outcome?: ConversationOutcome;
  messages?: ChatMessageRow[];
  nextCursor?: string | null;
  hasMore?: boolean;
  leadId?: string | null;
  bookingId?: string | null;
  toolErrors?: ToolErrorRow[];
};

type HeaderState = {
  title: string;
  outcome: ConversationOutcome;
  leadId: string | null;
  bookingId: string | null;
  toolErrors: ToolErrorRow[];
  eveSessionId: string | null;
  replyMode: "ai" | "human";
  claimedByName: string | null;
};

type HeaderAction = { type: "applyHeader"; payload: DetailPayload };

function headerReducer(
  state: HeaderState,
  action: HeaderAction,
): HeaderState {
  switch (action.type) {
    case "applyHeader": {
      const data = action.payload;
      return {
        title: data.session?.title ?? "Conversation",
        outcome: data.outcome ?? "empty",
        leadId: data.leadId ?? null,
        bookingId: data.bookingId ?? null,
        toolErrors: data.toolErrors ?? [],
        eveSessionId: data.session?.eve_session_id ?? null,
        replyMode: data.session?.reply_mode === "human" ? "human" : "ai",
        claimedByName: data.session?.claimedByName ?? null,
      };
    }
    default:
      return state;
  }
}

function ConversationTranscript({
  messages,
  hasMore,
  loadingOlder,
  loadOlder,
}: {
  messages: ChatMessageRow[];
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
}) {
  return (
    <div className="mt-8 space-y-3">
      <h3 className="text-sm font-medium">Transcript</h3>
      {hasMore ? (
        <Button
          disabled={loadingOlder}
          onClick={() => void loadOlder()}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingOlder ? "Loading…" : "Load earlier messages"}
        </Button>
      ) : null}
      {messages.length === 0 ? (
        <p className="text-muted-foreground text-sm">No messages yet.</p>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => {
            const raw = m.raw as {
              kind?: string;
              sentBy?: string;
              staffName?: string;
            } | null;
            if (raw?.kind === "handoff") {
              return (
                <li key={m.id}>
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    {m.content}
                  </p>
                </li>
              );
            }
            const senderLabel =
              m.role === "assistant" && raw?.sentBy === "staff"
                ? `Staff · ${raw.staffName ?? "Team"}`
                : m.role === "assistant"
                  ? "Assistant"
                  : m.role === "user"
                    ? "Guest"
                    : m.role;
            return (
              <li
                key={m.id}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm [content-visibility:auto] [contain-intrinsic-size:auto_80px]",
                  m.role === "user"
                    ? "border-border bg-muted/40"
                    : "border-border/60 bg-background",
                )}
              >
                <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">
                  {senderLabel}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ConversationToolErrors({
  toolErrors,
}: {
  toolErrors: ToolErrorRow[];
}) {
  if (toolErrors.length === 0) return null;
  return (
    <div className="mt-8 space-y-2">
      <h3 className="text-sm font-medium">Tool errors</h3>
      <ul className="divide-y rounded-lg border">
        {toolErrors.map((row) => (
          <li key={row.id} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                {row.tool_name}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatConversationWhen(row.created_at)}
              </span>
            </div>
            <p className="text-destructive mt-1 break-words">
              {row.error || "Unknown error"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConversationDetailSheet({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [header, dispatch] = React.useReducer(headerReducer, {
    title: "Conversation",
    outcome: "empty" as ConversationOutcome,
    leadId: null,
    bookingId: null,
    toolErrors: [] as ToolErrorRow[],
    eveSessionId: null,
    replyMode: "ai" as "ai" | "human",
    claimedByName: null,
  });
  const {
    title,
    outcome,
    leadId,
    bookingId,
    toolErrors,
    eveSessionId,
    replyMode,
    claimedByName,
  } = header;
  const [messages, setMessages] = React.useState<ChatMessageRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const fetchDetail = React.useCallback(async (): Promise<DetailPayload> => {
    const res = await fetch(`/api/dashboard/conversations/${sessionId}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to load conversation");
    return (await res.json()) as DetailPayload;
  }, [sessionId]);

  /** Shared by the first load and every refresh — everything but the transcript. */
  const applyHeader = React.useCallback((data: DetailPayload) => {
    dispatch({ type: "applyHeader", payload: data });
  }, []);

  const applyDetail = React.useCallback(
    (data: DetailPayload) => {
      applyHeader(data);
      setMessages(
        (data.messages ?? []).slice().sort(compareChatMessagesChronological),
      );
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    },
    [applyHeader],
  );

  /**
   * Refresh folds new messages in instead of replacing the list: the endpoint
   * returns only the newest page, so replacing would throw away pages staff
   * pulled in with "Load earlier messages" and reset that cursor under them.
   */
  const mergeDetail = React.useCallback(
    (data: DetailPayload) => {
      applyHeader(data);
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const incoming = (data.messages ?? []).filter((m) => !ids.has(m.id));
        if (incoming.length === 0) return prev;
        return [...prev, ...incoming].sort(compareChatMessagesChronological);
      });
    },
    [applyHeader],
  );

  const reload = React.useCallback(async () => {
    applyDetail(await fetchDetail());
  }, [applyDetail, fetchDetail]);

  /**
   * `action` rather than onSubmit + preventDefault: the server action is the
   * submit handler, so the form still posts before hydration. The textarea
   * stays controlled on purpose — React resets uncontrolled fields once the
   * action settles, which would throw away the draft on a failed send.
   */
  const [replyState, replyAction, replyPending] = React.useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      const text = String(formData.get("text") ?? "").trim();
      if (!text) return null;
      const res = await sendStaffMessageAction(sessionId, text);
      if (res.error) return res;
      setDraft("");
      await reload();
      return null;
    },
    null,
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActionError(null);
    (async () => {
      try {
        await reload();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Read inside the poll rather than as an effect dep, so a take-over or a send
  // does not tear down and restart the interval.
  const busyRef = React.useRef(false);
  React.useEffect(() => {
    busyRef.current = sending || replyPending;
  }, [sending, replyPending]);

  /**
   * Without this the sheet is a snapshot: staff reply, the guest answers, and
   * nothing appears until they close and reopen it. Also picks up a teammate
   * taking the conversation over in another tab.
   */
  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || busyRef.current) return;
      if (document.visibilityState !== "visible") return;
      try {
        const data = await fetchDetail();
        if (!cancelled) mergeDetail(data);
      } catch (e) {
        console.warn("[conversations] refresh failed", e);
      }
    };

    const interval = setInterval(() => void poll(), REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchDetail, mergeDetail]);

  const loadOlder = React.useCallback(async () => {
    if (!nextCursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/dashboard/conversations/${sessionId}?before=${encodeURIComponent(nextCursor)}`,
      );
      if (!res.ok) throw new Error("Failed to load older messages");
      const data = await res.json();
      const older = (data.messages ?? []) as ChatMessageRow[];
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !ids.has(m.id)), ...prev].sort(
          compareChatMessagesChronological,
        );
      });
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOlder(false);
    }
  }, [hasMore, loadingOlder, nextCursor, sessionId]);

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">{title}</SheetTitle>
      <SheetDescription className="sr-only">
        Conversation transcript {sessionId}
      </SheetDescription>

      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <p className="text-sm text-muted-foreground">
          {replyMode === "human"
            ? claimedByName
              ? `Handled by ${claimedByName}`
              : "Handled by a team member"
            : "The assistant is replying"}
        </p>
        <Button
          size="sm"
          variant={replyMode === "human" ? "outline" : "default"}
          disabled={sending || loading}
          onClick={async () => {
            setSending(true);
            setActionError(null);
            try {
              const run = replyMode === "human" ? handBackAction : takeOverAction;
              const res = await run(sessionId);
              if (res.error) setActionError(res.error);
              else await reload();
            } finally {
              setSending(false);
            }
          }}
        >
          {replyMode === "human" ? "Hand back to AI" : "Take over"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-8 pr-14">
        <Badge
          variant="outline"
          className={cn(
            "mb-4 w-fit rounded-md px-2 py-0.5 text-xs font-medium",
            outcomeBadgeClass(outcome),
          )}
        >
          {outcomeLabel(outcome)}
        </Badge>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 font-mono text-xs">
          {eveSessionId || sessionId}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {leadId ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/leads">Open Leads</Link>
            </Button>
          ) : null}
          {bookingId ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/bookings">Open Bookings</Link>
            </Button>
          ) : null}
        </div>

        {loading ? (
          <p className="text-muted-foreground mt-8 text-sm">Loading…</p>
        ) : error ? (
          <p className="text-destructive mt-8 text-sm">{error}</p>
        ) : (
          <>
            <ConversationTranscript
              messages={messages}
              hasMore={hasMore}
              loadingOlder={loadingOlder}
              loadOlder={loadOlder}
            />

            <ConversationToolErrors toolErrors={toolErrors} />
          </>
        )}
      </div>

      {replyMode === "human" && (
        <form className="flex items-end gap-2 border-t px-4 py-3" action={replyAction}>
          <label className="sr-only" htmlFor="staff-reply-draft">
            Reply to the guest
          </label>
          <textarea
            id="staff-reply-draft"
            name="text"
            className="min-h-16 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
            placeholder="Reply to the guest…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={replyPending}
            required
          />
          <Button type="submit" size="sm" disabled={replyPending || !draft.trim()}>
            {replyPending ? "Sending…" : "Send"}
          </Button>
        </form>
      )}
      {(actionError || replyState?.error) && (
        <p className="px-4 pb-3 text-sm text-destructive">
          {actionError || replyState?.error}
        </p>
      )}
    </div>
  );
}
