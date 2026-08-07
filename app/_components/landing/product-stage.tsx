"use client";

import { ClockIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EveLogoMark } from "@/components/eve-logo";
import { cn } from "@/lib/utils";
import { ProductFrame } from "./primitives";

const TABS = ["chat", "slots", "ops"] as const;
type Tab = (typeof TABS)[number];

const SLOT_TIMES = [
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
] as const;

function ChatPanel() {
  const t = useTranslations("landing.stage");
  const chat = useTranslations("chat");

  const sessions = [
    { title: t("sessionActive"), time: t("sessionActiveTime"), active: true },
    { title: t("sessionHours"), time: t("sessionHoursTime"), active: false },
    { title: t("sessionHours"), time: t("sessionEarlierTime"), active: false },
  ];

  return (
    <div className="flex min-h-[280px] bg-[#0a0a0a] sm:min-h-[360px]">
      <aside className="hidden w-[38%] shrink-0 flex-col border-r border-white/8 bg-[#080808] sm:flex">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[10px] font-medium tracking-[0.16em] text-zinc-500 uppercase">
            {t("sessions")}
          </p>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-400">
            + {t("newChat")}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 px-2 pb-3">
          {sessions.map((session) => (
            <div
              className={cn(
                "rounded-lg px-3 py-2.5",
                session.active
                  ? "bg-white/10 ring-1 ring-white/10"
                  : "hover:bg-white/[0.04]",
              )}
              key={`${session.title}-${session.time}`}
            >
              <p
                className={cn(
                  "truncate text-[12px] leading-snug",
                  session.active ? "text-white" : "text-zinc-400",
                )}
              >
                {session.title}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">{session.time}</p>
            </div>
          ))}
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[28px_28px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
        />
        <div className="relative flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <EveLogoMark size="xs" />
            <span className="text-sm font-medium text-white">Eve</span>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300">
            Eve Pilot
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
            <span className="font-medium tracking-wide text-emerald-400 uppercase">
              {chat("statusOnline")}
            </span>
          </span>
        </div>

        <div className="relative flex flex-1 flex-col gap-3 overflow-hidden px-4 py-4 sm:px-5">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-[13px] leading-snug text-zinc-900 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.35)]">
            {t("userPrompt")}
          </div>

          <div className="max-w-[92%] space-y-3">
            <div className="rounded-2xl rounded-bl-md border border-white/10 bg-zinc-950/90 px-3.5 py-3 text-[13px] leading-relaxed text-zinc-200 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.8)] backdrop-blur-sm">
              <p>{t("assistantReply")}</p>
              <p className="mt-3 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
                {t("afternoonLabel")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SLOT_TIMES.map((slot, index) => (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition",
                      index === 2
                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-white/[0.03] text-zinc-300",
                    )}
                    key={slot}
                  >
                    <ClockIcon className="size-3 shrink-0 opacity-70" />
                    {slot}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-zinc-400">{t("assistantFollowUp")}</p>
            </div>
          </div>
        </div>

        <div className="relative border-t border-white/8 px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <span className="flex-1 truncate text-[12px] text-zinc-600">
              {chat("placeholder")}
            </span>
            <span className="rounded-lg bg-white px-2.5 py-1 text-[10px] font-semibold text-black">
              {t("send")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingPanel() {
  const t = useTranslations("landing.stage");

  return (
    <div className="flex min-h-[280px] items-center justify-center bg-[#0a0a0a] p-6 sm:min-h-[360px] sm:p-10">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6">
        <div className="mb-5 flex items-center justify-between">
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
            {t("booked")}
          </span>
          <span className="text-[11px] text-zinc-500">{t("calSynced")}</span>
        </div>
        <h3 className="text-xl font-semibold tracking-tight text-white">
          {t("cleaning")}
        </h3>
        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
            <dt className="text-zinc-500">Guest</dt>
            <dd className="font-medium text-zinc-200">{t("guest")}</dd>
          </div>
          <div className="flex justify-between gap-4 border-b border-white/5 pb-3">
            <dt className="text-zinc-500">When</dt>
            <dd className="font-medium text-zinc-200">{t("when")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">TZ</dt>
            <dd className="font-medium text-zinc-200">{t("tz")}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function OpsPanel() {
  const t = useTranslations("landing.stage");

  const stats = [
    { label: t("leadsToday"), value: "18" },
    { label: t("bookingsWeek"), value: "47" },
    { label: t("response"), value: t("responseValue") },
  ];

  return (
    <div className="min-h-[280px] bg-[#0a0a0a] p-5 sm:min-h-[360px] sm:p-8">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-medium text-white">Workspace</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          {t("online")}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            className="rounded-2xl border border-white/10 bg-zinc-950 px-4 py-5"
            key={stat.label}
          >
            <p className="text-2xl font-semibold tracking-tight text-white">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        {["Alex · cleaning Fri 2:00", "Mai · consult Sat 10:30", "Jordan · follow-up Mon"].map(
          (row) => (
            <div
              className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300"
              key={row}
            >
              {row}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function ProductStage({ className }: { className?: string }) {
  const t = useTranslations("landing.hero");
  const stage = useTranslations("landing.stage");
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className={cn("w-full", className)}>
      <div
        className="mb-5 flex flex-wrap justify-center gap-2"
        role="tablist"
        aria-label="Product preview"
      >
        {TABS.map((id) => (
          <button
            aria-selected={tab === id}
            className={cn(
              "rounded-full px-4 py-2 text-sm transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
              tab === id
                ? "bg-white text-black"
                : "border border-white/10 bg-white/5 text-zinc-400 hover:text-white",
            )}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <ProductFrame label={stage("chatUrl")}>
        <div role="tabpanel">
          {tab === "chat" ? <ChatPanel /> : null}
          {tab === "slots" ? <BookingPanel /> : null}
          {tab === "ops" ? <OpsPanel /> : null}
        </div>
      </ProductFrame>
    </div>
  );
}
