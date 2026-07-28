"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ProductFrame } from "./primitives";

const TABS = ["chat", "slots", "ops"] as const;
type Tab = (typeof TABS)[number];

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
          {tab === "chat" ? (
            <div className="relative aspect-[1200/700] bg-black">
              <Image
                alt="Eve booking chat"
                className="object-cover object-top"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 1024px"
                src="/landing-hero-chat.png"
              />
            </div>
          ) : null}
          {tab === "slots" ? <BookingPanel /> : null}
          {tab === "ops" ? <OpsPanel /> : null}
        </div>
      </ProductFrame>
    </div>
  );
}
