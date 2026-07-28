"use client";

import type { UserContent } from "ai";
import type { SessionState } from "eve/client";
import { useEveAgent, type EveMessage } from "eve/react";
import { useTranslations } from "next-intl";
import { AlertCircleIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { LocaleProvider, useAppLocale } from "@/components/locale-provider";
import { BorderBeam } from "@/components/magicui/border-beam";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { Particles } from "@/components/ui/particles";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { Button } from "@/components/ui/button";
import { VirtualConversation } from "@/components/ai-elements/virtual-conversation";
import type {
  ChatMessageRow,
  ChatSessionListItem,
  ChatSessionClientRow,
} from "@/lib/chat-sessions";
import {
  CHAT_LONG_THREAD_MESSAGES,
  CHAT_LONG_THREAD_USER_TURNS,
  CHAT_MESSAGE_PAGE_LIMIT,
} from "@/lib/chat-limits";
import { chatMessageRowsToEveMessages } from "@/lib/chat-message-display";
import {
  parseChatSuggestions,
  type ChatBranding,
} from "@/lib/chat-branding";
import { EVE_LOCALE_HEADER, EVE_TZ_HEADER } from "@/lib/locale";
import { projectEveMessages } from "@/lib/project-chat-messages";
import {
  EVE_CHAT_SESSION_HEADER,
  EVE_WORKSPACE_HEADER,
} from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";
import { ChatUserMenu, type ChatUser } from "./chat-user-menu";
import {
  ChatSessionDrawer,
  ChatSessionSidebar,
  ChatSessionsToggle,
} from "./chat-session-sidebar";

const AGENT_NAME = "Eve";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

type ThreadBootstrap = {
  chatSessionId: string;
  initialSession?: SessionState;
  initialEvents?: readonly unknown[];
  historyMessages: EveMessage[];
  nextCursor: string | null;
  hasMore: boolean;
  messageCount: number;
};

export function AgentChat(props: {
  user?: ChatUser | null;
  workspaceSlug?: string;
  workspaceName?: string;
  workspaceTagline?: string | null;
  /** Empty-state label, intro, and suggestion chips (falls back to shared defaults). */
  chatBranding?: Partial<ChatBranding> | null;
  /** Extra controls in the chat header (e.g. workspace info). */
  headerEnd?: React.ReactNode;
  /** Marketing sandbox at `/chat` — Eve Pilot only. */
  demoMode?: boolean;
  initialLocale?: "en" | "vi";
  /** Open this chat session first (e.g. after consuming a manage link). */
  preferChatSessionId?: string | null;
  /** Banner after magic-link claim. */
  manageLinkNotice?: string | null;
}) {
  return (
    <LocaleProvider initialLocale={props.initialLocale} kind="guest">
      <AgentChatInner {...props} />
    </LocaleProvider>
  );
}

function AgentChatInner({
  user,
  workspaceSlug,
  workspaceName,
  workspaceTagline,
  chatBranding,
  headerEnd,
  demoMode = false,
  preferChatSessionId = null,
  manageLinkNotice = null,
}: {
  user?: ChatUser | null;
  workspaceSlug?: string;
  workspaceName?: string;
  workspaceTagline?: string | null;
  chatBranding?: Partial<ChatBranding> | null;
  headerEnd?: React.ReactNode;
  demoMode?: boolean;
  preferChatSessionId?: string | null;
  manageLinkNotice?: string | null;
}) {
  const t = useTranslations();

  const branding = React.useMemo((): ChatBranding => {
    const customSuggestions = parseChatSuggestions(chatBranding?.suggestions);
    const customLabel = chatBranding?.assistantLabel?.trim();
    const customIntro = (chatBranding?.intro ?? workspaceTagline)?.trim();
    const customPlaceholder = chatBranding?.placeholder?.trim();
    return {
      assistantLabel: customLabel || t("chat.assistantDefault"),
      intro: customIntro || t("chat.introDefault"),
      placeholder: customPlaceholder || t("chat.placeholder"),
      suggestions:
        customSuggestions.length > 0
          ? customSuggestions
          : [
              {
                label: t("chat.suggestions.afternoon.label"),
                prompt: t("chat.suggestions.afternoon.prompt"),
              },
              {
                label: t("chat.suggestions.hours.label"),
                prompt: t("chat.suggestions.hours.prompt"),
              },
              {
                label: t("chat.suggestions.book.label"),
                prompt: t("chat.suggestions.book.prompt"),
              },
              {
                label: t("chat.suggestions.services.label"),
                prompt: t("chat.suggestions.services.prompt"),
              },
            ],
    };
  }, [chatBranding, t, workspaceTagline]);

  const [sessions, setSessions] = React.useState<ChatSessionListItem[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [bootstrap, setBootstrap] = React.useState<ThreadBootstrap | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [bootError, setBootError] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState(false);
  const [agentStatus, setAgentStatus] = React.useState<AgentStatus>("ready");

  const tenantQs = workspaceSlug
    ? `?w=${encodeURIComponent(workspaceSlug)}`
    : "";

  const refreshSessions = React.useCallback(async () => {
    const res = await fetch(`/api/chat/sessions${tenantQs}`);
    if (!res.ok) throw new Error("Failed to list sessions");
    const data = (await res.json()) as { sessions: ChatSessionListItem[] };
    setSessions(data.sessions);
    return data.sessions;
  }, [tenantQs]);

  const loadThread = React.useCallback(
    async (id: string) => {
      const res = await fetch(`/api/chat/sessions/${id}${tenantQs}`);
      if (!res.ok) throw new Error("Failed to load session");
      const data = (await res.json()) as {
        session: ChatSessionClientRow;
        messages: ChatMessageRow[];
        nextCursor: string | null;
        hasMore: boolean;
        messageCount?: number;
      };
      const session = data.session;
      const initialSession: SessionState | undefined =
        session.continuation_token || session.eve_session_id
          ? {
              sessionId: session.eve_session_id ?? undefined,
              continuationToken: session.continuation_token ?? undefined,
              streamIndex: session.stream_index ?? 0,
            }
          : undefined;
      // Tail only — never hydrate the full event log into the browser.
      const events = Array.isArray(session.events) ? session.events : [];
      setActiveId(id);
      setBootstrap({
        chatSessionId: id,
        initialSession,
        initialEvents: events,
        historyMessages: chatMessageRowsToEveMessages(data.messages ?? []),
        nextCursor: data.nextCursor ?? null,
        hasMore: Boolean(data.hasMore),
        messageCount: data.messageCount ?? data.messages?.length ?? 0,
      });
    },
    [tenantQs],
  );

  const createAndOpen = React.useCallback(async () => {
    setBusyAction(true);
    try {
      const res = await fetch(`/api/chat/sessions${tenantQs}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to create session");
      const data = (await res.json()) as { session: ChatSessionClientRow };
      await refreshSessions();
      setActiveId(data.session.id);
      setBootstrap({
        chatSessionId: data.session.id,
        historyMessages: [],
        nextCursor: null,
        hasMore: false,
        messageCount: 0,
      });
      setDrawerOpen(false);
    } finally {
      setBusyAction(false);
    }
  }, [refreshSessions, tenantQs]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setBootError(null);
        const list = await refreshSessions();
        if (cancelled) return;

        if (
          preferChatSessionId &&
          list.some((s) => s.id === preferChatSessionId)
        ) {
          await loadThread(preferChatSessionId);
          return;
        }

        if (list.length === 0) {
          const res = await fetch(`/api/chat/sessions${tenantQs}`, {
            method: "POST",
          });
          if (!res.ok) throw new Error("Failed to create session");
          const data = (await res.json()) as { session: ChatSessionClientRow };
          if (cancelled) return;
          await refreshSessions();
          setActiveId(data.session.id);
          setBootstrap({
            chatSessionId: data.session.id,
            historyMessages: [],
            nextCursor: null,
            hasMore: false,
            messageCount: 0,
          });
        } else {
          await loadThread(list[0]!.id);
        }
      } catch (error) {
        console.error("[eve chat] bootstrap failed", error);
        if (!cancelled) {
          setBootError(t("chat.bootError"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-bootstrap when tenant slug or preferred session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantQs, preferChatSessionId]);

  const onSelect = async (id: string) => {
    if (id === activeId) {
      setDrawerOpen(false);
      return;
    }
    setBusyAction(true);
    try {
      await loadThread(id);
      setDrawerOpen(false);
    } catch (error) {
      console.error("[eve chat] select failed", error);
    } finally {
      setBusyAction(false);
    }
  };

  const onPersisted = React.useCallback(() => {
    void refreshSessions().catch((error) => {
      console.error("[eve chat] refresh failed", error);
    });
  }, [refreshSessions]);

  const sidebar = (
    <ChatSessionSidebar
      activeId={activeId}
      busy={busyAction || loading}
      onNew={() => void createAndOpen()}
      onSelect={(id) => void onSelect(id)}
      sessions={sessions}
    />
  );

  return (
    <main className="relative flex h-dvh overflow-hidden bg-black text-zinc-100">
      <Particles
        className="pointer-events-none absolute inset-0 opacity-35"
        color="#ffffff"
        quantity={55}
      />
      <AnimatedGridPattern
        className={cn(
          "pointer-events-none absolute inset-0 fill-white/[0.02] stroke-white/[0.04]",
          "[mask-image:radial-gradient(520px_circle_at_center,white,transparent)]",
        )}
        numSquares={28}
      />
      <div className="pointer-events-none absolute left-1/2 top-24 size-[28rem] -translate-x-1/2 rounded-full bg-teal-500/8 blur-[110px]" />

      <div className="relative z-10 hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-white/10 md:flex">
        {sidebar}
      </div>
      <ChatSessionDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {sidebar}
      </ChatSessionDrawer>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2">
            <ChatSessionsToggle onClick={() => setDrawerOpen(true)} />
            <Link className="text-sm font-semibold tracking-tight text-white" href="/">
              Eve
            </Link>
          </div>

          <div className="flex min-w-0 max-w-[min(100%,16rem)] items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 sm:max-w-xs">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-300/30 to-white/10">
              <SparklesIcon className="size-3 text-teal-200" />
            </span>
            <span className="min-w-0 truncate text-sm text-zinc-200">
              {workspaceName || AGENT_NAME}
            </span>
            <span className="h-3 w-px shrink-0 bg-white/10" aria-hidden />
            <StatusDot status={agentStatus} />
          </div>

          <div className="flex items-center gap-2">
            {headerEnd}
            {user ? (
              <ChatUserMenu user={user} />
            ) : (
              <RainbowButton asChild className="h-8 rounded-full px-3 text-xs" size="sm">
                <Link href="/login">{t("common.signIn")}</Link>
              </RainbowButton>
            )}
          </div>
        </header>

        {demoMode ? (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-100/90 sm:text-[13px]">
            <span>
              <span className="font-medium text-amber-50">{t("chat.demoBanner")}</span>
              {" — "}
              {t("chat.demoBannerBody")}{" "}
              <code className="rounded bg-black/30 px-1 py-0.5 text-[11px] text-amber-50/90">
                /b/your-business
              </code>
            </span>
            <span className="text-amber-100/40">·</span>
            <Link
              className="font-medium text-teal-200 underline-offset-2 hover:underline"
              href="/signup"
            >
              {t("chat.createWorkspace")}
            </Link>
          </div>
        ) : null}

        {manageLinkNotice ? (
          <div className="flex shrink-0 items-center justify-center border-b border-teal-500/20 bg-teal-500/10 px-4 py-2 text-center text-xs text-teal-100/90 sm:text-[13px]">
            {manageLinkNotice}
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
            {t("chat.loading")}
          </div>
        ) : bootError || !bootstrap ? (
          <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-zinc-300">
              {bootError || t("chat.bootError")}
            </p>
            <button
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-zinc-200 hover:bg-white/[0.08]"
              onClick={() => window.location.reload()}
              type="button"
            >
              {t("chat.reload")}
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <AgentChatThread
              key={bootstrap.chatSessionId}
              branding={branding}
              chatSessionId={bootstrap.chatSessionId}
              historyMessages={bootstrap.historyMessages}
              initialHasMore={bootstrap.hasMore}
              initialMessageCount={bootstrap.messageCount}
              initialNextCursor={bootstrap.nextCursor}
              initialEvents={bootstrap.initialEvents}
              initialSession={bootstrap.initialSession}
              onNewChat={() => void createAndOpen()}
              onPersisted={onPersisted}
              onStatusChange={setAgentStatus}
              tenantQs={tenantQs}
              workspaceName={workspaceName}
              workspaceSlug={workspaceSlug}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function AgentChatThread({
  branding,
  chatSessionId,
  historyMessages: initialHistory,
  initialHasMore,
  initialMessageCount,
  initialNextCursor,
  initialSession,
  initialEvents,
  onNewChat,
  onPersisted,
  onStatusChange,
  tenantQs,
  workspaceName,
  workspaceSlug,
}: {
  branding: ChatBranding;
  chatSessionId: string;
  historyMessages: EveMessage[];
  initialHasMore: boolean;
  initialMessageCount: number;
  initialNextCursor: string | null;
  initialSession?: SessionState;
  initialEvents?: readonly unknown[];
  onNewChat: () => void;
  onPersisted: () => void;
  onStatusChange?: (status: AgentStatus) => void;
  tenantQs: string;
  workspaceName?: string;
  workspaceSlug?: string;
}) {
  const t = useTranslations();
  const { locale } = useAppLocale();
  const persistTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [history, setHistory] = React.useState(initialHistory);
  const [nextCursor, setNextCursor] = React.useState(initialNextCursor);
  const [hasMore, setHasMore] = React.useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [messageCount, setMessageCount] = React.useState(initialMessageCount);
  const [nudgeDismissed, setNudgeDismissed] = React.useState(false);

  const tenantHeaders = React.useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {
      [EVE_CHAT_SESSION_HEADER]: chatSessionId,
      [EVE_LOCALE_HEADER]: locale,
    };
    if (workspaceSlug?.trim()) {
      headers[EVE_WORKSPACE_HEADER] = workspaceSlug.trim().toLowerCase();
    }
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz) headers[EVE_TZ_HEADER] = browserTz;
    } catch {
      // ignore
    }
    return headers;
  }, [chatSessionId, locale, workspaceSlug]);

  const persistSnapshot = React.useCallback(
    async (input: {
      messages: readonly EveMessage[];
      session: SessionState;
      events: readonly unknown[];
    }) => {
      try {
        const res = await fetch(
          `/api/chat/sessions/${chatSessionId}/messages${tenantQs}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: projectEveMessages(input.messages),
              eveSessionId: input.session.sessionId ?? null,
              continuationToken: input.session.continuationToken ?? null,
              streamIndex: input.session.streamIndex ?? 0,
              events: input.events,
            }),
          },
        );
        if (!res.ok) {
          throw new Error(`persist failed (${res.status})`);
        }
        onPersisted();
      } catch (error) {
        console.error("[eve chat] persist failed", error);
      }
    },
    [chatSessionId, onPersisted, tenantQs],
  );

  const agent = useEveAgent({
    headers: tenantHeaders,
    initialSession,
    // Tail events only (or empty) — model resume uses continuationToken.
    initialEvents: initialEvents as never,
    onSessionChange: (session) => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
      void fetch(`/api/chat/sessions/${chatSessionId}${tenantQs}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eveSessionId: session.sessionId ?? null,
          continuationToken: session.continuationToken ?? null,
          streamIndex: session.streamIndex ?? 0,
        }),
      }).catch((error) => {
        console.error("[eve chat] session patch failed", error);
      });
    },
    onFinish: (snapshot) => {
      void persistSnapshot({
        messages: snapshot.data.messages,
        session: snapshot.session,
        events: snapshot.events,
      });
      setMessageCount((c) =>
        Math.max(c, history.length + snapshot.data.messages.length),
      );
    },
  });

  React.useEffect(() => {
    onStatusChange?.(agent.status);
  }, [agent.status, onStatusChange]);

  React.useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const historyIds = React.useMemo(
    () => new Set(history.map((m) => m.id)),
    [history],
  );
  const liveMessages = React.useMemo(
    () => agent.data.messages.filter((m) => !historyIds.has(m.id)),
    [agent.data.messages, historyIds],
  );
  const displayMessages = React.useMemo(
    () => [...history, ...liveMessages],
    [history, liveMessages],
  );

  const userTurnCount = React.useMemo(
    () => displayMessages.filter((m) => m.role === "user").length,
    [displayMessages],
  );
  const showLongThreadNudge =
    !nudgeDismissed &&
    (userTurnCount >= CHAT_LONG_THREAD_USER_TURNS ||
      messageCount >= CHAT_LONG_THREAD_MESSAGES ||
      displayMessages.length >= CHAT_LONG_THREAD_MESSAGES);

  const loadOlder = React.useCallback(async () => {
    if (!nextCursor || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const qs = new URLSearchParams();
      if (tenantQs.startsWith("?")) {
        const existing = new URLSearchParams(tenantQs.slice(1));
        existing.forEach((v, k) => qs.set(k, v));
      }
      qs.set("before", nextCursor);
      qs.set("limit", String(CHAT_MESSAGE_PAGE_LIMIT));
      const res = await fetch(
        `/api/chat/sessions/${chatSessionId}/messages?${qs.toString()}`,
      );
      if (!res.ok) throw new Error("Failed to load older messages");
      const data = (await res.json()) as {
        messages: ChatMessageRow[];
        nextCursor: string | null;
        hasMore: boolean;
      };
      const older = chatMessageRowsToEveMessages(data.messages ?? []);
      setHistory((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const unique = older.filter((m) => !ids.has(m.id));
        return [...unique, ...prev];
      });
      setNextCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.hasMore));
    } catch (error) {
      console.error("[eve chat] load older failed", error);
    } finally {
      setLoadingOlder(false);
    }
  }, [chatSessionId, hasMore, loadingOlder, nextCursor, tenantQs]);

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = displayMessages.length === 0 && !isBusy;

  if (agent.error) {
    console.error("[eve chat]", agent.error);
  }

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isBusy) return;

    try {
      if (message.files.length === 0) {
        await agent.send({ message: text });
        return;
      }

      const parts: UserContent = [];
      if (text.length > 0) {
        parts.push({ text, type: "text" });
      }
      for (const file of message.files) {
        parts.push({
          data: file.url,
          filename: file.filename,
          mediaType: file.mediaType,
          type: "file",
        });
      }

      await agent.send({ message: parts });
    } catch (error) {
      console.error("[eve chat] send failed", error);
    }
  };

  const sendSuggestion = async (text: string) => {
    if (isBusy) return;
    try {
      await agent.send({ message: text });
    } catch (error) {
      console.error("[eve chat] send failed", error);
    }
  };

  const composer = (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/85 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      <BorderBeam
        borderWidth={1}
        colorFrom="#5eead4"
        colorTo="#a5f3fc"
        duration={10}
        size={90}
      />
      <PromptInput className="border-0 bg-transparent shadow-none" onSubmit={handleSubmit}>
        <PromptInputTextarea
          className="min-h-[52px] text-zinc-100 placeholder:text-zinc-500"
          placeholder={branding.placeholder}
        />
        <PromptInputSubmit onStop={agent.stop} status={agent.status} />
      </PromptInput>
    </div>
  );

  const lastMessageId = displayMessages[displayMessages.length - 1]?.id ?? "";

  return (
    <>
      {agent.error ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 sm:px-6">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <div>
              <p className="font-medium text-zinc-100">{t("chat.unavailableTitle")}</p>
              <p className="mt-0.5 text-zinc-400">{t("chat.unavailableBody")}</p>
            </div>
          </div>
        </div>
      ) : null}

      {showLongThreadNudge ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-400/20 bg-teal-400/10 px-3 py-2.5 text-sm text-teal-50">
            <p className="min-w-0 flex-1 text-xs leading-relaxed sm:text-sm">
              {t("chat.longThreadNudge")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                className="h-8 rounded-full px-3 text-xs"
                onClick={onNewChat}
                size="sm"
                type="button"
                variant="secondary"
              >
                {t("chat.newChat")}
              </Button>
              <button
                className="text-xs text-teal-100/70 underline-offset-2 hover:underline"
                onClick={() => setNudgeDismissed(true)}
                type="button"
              >
                {t("chat.dismissNudge")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEmpty ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          {hasMore ? (
            <div className="mx-auto flex w-full max-w-3xl shrink-0 justify-center px-4 pt-3 sm:px-6">
              <Button
                className="h-8 rounded-full border-white/10 bg-white/[0.04] text-xs text-zinc-300 hover:bg-white/[0.08]"
                disabled={loadingOlder}
                onClick={() => void loadOlder()}
                size="sm"
                type="button"
                variant="outline"
              >
                {loadingOlder ? t("chat.loadingOlder") : t("chat.loadEarlier")}
              </Button>
            </div>
          ) : null}
          <VirtualConversation
            itemCount={displayMessages.length}
            scrollToBottomKey={`${lastMessageId}-${agent.status}`}
          >
            {(index) => {
              const message = displayMessages[index]!;
              return (
                <AgentMessage
                  canRespond={!isBusy}
                  isStreaming={
                    agent.status === "streaming" &&
                    index === displayMessages.length - 1
                  }
                  key={message.id}
                  message={message}
                  onInputResponses={(inputResponses) =>
                    agent.send({ inputResponses })
                  }
                />
              );
            }}
          </VirtualConversation>
        </div>
      )}

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-2xl flex-1 flex-col items-center justify-center gap-8 pb-[6vh]"
            : "max-w-3xl shrink-0 pb-5 pt-2",
        )}
      >
        {isEmpty ? (
          <BlurFade className="flex w-full flex-col items-center gap-5 text-center" delay={0.05}>
            <AnimatedShinyText className="text-xs tracking-[0.18em] text-zinc-400 uppercase dark:text-zinc-400">
              {branding.assistantLabel}
            </AnimatedShinyText>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {workspaceName?.trim() || AGENT_NAME}
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-zinc-400">
              {branding.intro}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {branding.suggestions.map((item, i) => (
                <BlurFade delay={0.12 + i * 0.05} key={`${item.label}-${item.prompt}`}>
                  <button
                    className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-teal-300/30 hover:bg-white/[0.08] hover:text-white"
                    onClick={() => void sendSuggestion(item.prompt)}
                    type="button"
                  >
                    {item.label}
                  </button>
                </BlurFade>
              ))}
            </div>
          </BlurFade>
        ) : null}

        <div className="w-full space-y-2">
          {composer}
          <p className="text-center text-[11px] text-zinc-600">
            {t("chat.disclaimer")}
          </p>
        </div>
      </div>
    </>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const t = useTranslations();
  const isLive = status === "submitted" || status === "streaming";
  const label =
    status === "error"
      ? t("chat.statusError")
      : isLive
        ? t("chat.statusTyping")
        : status === "ready"
          ? t("chat.statusOnline")
          : t("chat.statusIdle");
  const tone =
    status === "error"
      ? "bg-red-400"
      : isLive
        ? "bg-emerald-400"
        : status === "ready"
          ? "bg-teal-300"
          : "bg-zinc-600";

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className="relative flex size-1.5">
        {isLive ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-75",
              tone,
            )}
          />
        ) : null}
        <span className={cn("relative inline-flex size-1.5 rounded-full transition-colors", tone)} />
      </span>
      <span className="text-[10px] tracking-wide text-zinc-500 uppercase">{label}</span>
    </span>
  );
}
