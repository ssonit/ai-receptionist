"use client";

import type { UserContent } from "ai";
import { useEveAgent } from "eve/react";
import { AlertCircleIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { BorderBeam } from "@/components/magicui/border-beam";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { Particles } from "@/components/ui/particles";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./agent-message";
import { ChatUserMenu, type ChatUser } from "./chat-user-menu";

const AGENT_NAME = "Eve";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

const suggestions = [
  { label: "Slot chiều mai", prompt: "Còn trống chiều mai không?" },
  { label: "Giờ mở cửa", prompt: "Giờ mở cửa hôm nay?" },
  { label: "Lấy cao răng", prompt: "Muốn đặt lịch lấy cao răng" },
  { label: "Giá khám", prompt: "Khám tổng quát khoảng bao nhiêu?" },
];

export function AgentChat({ user }: { user?: ChatUser | null }) {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isEmpty = agent.data.messages.length === 0;

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
          placeholder="Hỏi lịch trống, FAQ, hoặc đặt hẹn…"
        />
        <PromptInputSubmit onStop={agent.stop} status={agent.status} />
      </PromptInput>
    </div>
  );

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-black text-zinc-100">
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

      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/55 px-4 backdrop-blur-xl sm:px-6">
        <Link className="text-sm font-semibold tracking-tight text-white" href="/">
          Eve
        </Link>

        <div className="flex min-w-0 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-teal-300/30 to-white/10">
            <SparklesIcon className="size-3 text-teal-200" />
          </span>
          <span className="truncate text-sm text-zinc-200">{AGENT_NAME}</span>
          <StatusDot status={agent.status} />
        </div>

        <div className="flex items-center gap-2">
          <Link
            className="hidden text-sm text-zinc-400 transition hover:text-white sm:inline"
            href="/dashboard"
          >
            Dashboard
          </Link>
          {user ? (
            <ChatUserMenu user={user} />
          ) : (
            <RainbowButton asChild className="h-8 rounded-full px-3 text-xs" size="sm">
              <Link href="/login">Sign in</Link>
            </RainbowButton>
          )}
        </div>
      </header>

      {agent.error ? (
        <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 px-4 pt-3 sm:px-6">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <div>
              <p className="font-medium text-zinc-100">Chat tạm thời không phản hồi</p>
              <p className="mt-0.5 text-zinc-400">
                Thử gửi lại sau vài giây. Nếu vẫn lỗi, kiểm tra API key model trong{" "}
                <code className="text-zinc-300">.env.local</code>
                {" "}(DEEPSEEK / GOOGLE / ANTHROPIC).
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {isEmpty ? null : (
        <Conversation className="relative z-10 min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
            {agent.data.messages.map((message, index) => (
              <AgentMessage
                canRespond={!isBusy}
                isStreaming={
                  agent.status === "streaming" && index === agent.data.messages.length - 1
                }
                key={message.id}
                message={message}
                onInputResponses={(inputResponses) => agent.send({ inputResponses })}
              />
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div
        className={cn(
          "relative z-10 mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-2xl flex-1 flex-col items-center justify-center gap-8 pb-[6vh]"
            : "max-w-3xl shrink-0 pb-5 pt-2",
        )}
      >
        {isEmpty ? (
          <BlurFade className="flex w-full flex-col items-center gap-5 text-center" delay={0.05}>
            <AnimatedShinyText className="text-xs tracking-[0.18em] text-zinc-400 uppercase dark:text-zinc-400">
              AI booking assistant
            </AnimatedShinyText>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              {AGENT_NAME}
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-zinc-400">
              Hỏi FAQ, kiểm tra slot trống, hoặc đặt lịch. Không thay thế bác sĩ — chỉ hỗ trợ đặt
              hẹn.
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {suggestions.map((item, i) => (
                <BlurFade delay={0.12 + i * 0.05} key={item.prompt}>
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
            Eve có thể nhầm — luôn xác nhận lại khi cần.
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const label =
    status === "error"
      ? "Error"
      : isLive
        ? "Typing"
        : status === "ready"
          ? "Online"
          : "Idle";
  const tone =
    status === "error"
      ? "bg-red-400"
      : isLive
        ? "bg-emerald-400"
        : status === "ready"
          ? "bg-teal-300"
          : "bg-zinc-600";

  return (
    <span className="inline-flex items-center gap-1.5 pl-0.5">
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
      <span className="hidden text-[10px] tracking-wide text-zinc-500 uppercase sm:inline">
        {label}
      </span>
    </span>
  );
}
