"use client";

import {
  BellIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  ChatCircleIcon,
  CheckIcon,
  CodeIcon,
  DevicesIcon,
  GlobeIcon,
  MicrophoneIcon,
  UserFocusIcon,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BlurFade } from "@/components/ui/blur-fade";
import { Marquee } from "@/components/magicui/marquee";
import { cn } from "@/lib/utils";
import {
  Container,
  GhostButton,
  PrimaryButton,
  ProductFrame,
  SectionHeading,
} from "./primitives";

const LOGOS = [
  "Cal.com",
  "WhatsApp",
  "Twilio",
  "Supabase",
  "Vercel",
  "Stripe",
  "Meta",
  "Retell",
];

const TOUR_KEYS = ["chat", "book", "dash"] as const;

export function LogoStrip() {
  const t = useTranslations("landing.logos");

  return (
    <section className="border-y border-white/5 py-12">
      <BlurFade inView>
        <p className="mb-8 text-center text-xs tracking-[0.2em] text-zinc-500 uppercase">
          {t("label")}
        </p>
      </BlurFade>
      <Marquee className="[--duration:32s]" pauseOnHover>
        {LOGOS.map((logo) => (
          <div
            className="mx-8 flex h-10 items-center text-sm font-semibold tracking-wide text-zinc-500"
            key={logo}
          >
            {logo}
          </div>
        ))}
      </Marquee>
    </section>
  );
}

export function ProductTour() {
  const t = useTranslations("landing.tour");
  const [active, setActive] = useState<(typeof TOUR_KEYS)[number]>("chat");

  return (
    <section className="py-24" id="features">
      <Container>
        <BlurFade inView>
          <SectionHeading subtitle={t("subtitle")} title={t("title")} />
        </BlurFade>

        <div className="grid items-start gap-8 lg:grid-cols-[220px_1fr]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" role="tablist">
            {TOUR_KEYS.map((key) => (
              <button
                aria-selected={active === key}
                className={cn(
                  "shrink-0 rounded-2xl border px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                  active === key
                    ? "border-white/20 bg-white text-black"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white",
                )}
                key={key}
                onClick={() => setActive(key)}
                role="tab"
                type="button"
              >
                <span className="block text-sm font-semibold">
                  {t(`items.${key}.label`)}
                </span>
              </button>
            ))}
          </div>

          <BlurFade key={active} inView>
            <ProductFrame>
              <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
                <div className="border-b border-white/8 p-8 md:border-r md:border-b-0 md:p-10">
                  <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                    {t(`items.${active}.title`)}
                  </h3>
                  <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-400 sm:text-base">
                    {t(`items.${active}.body`)}
                  </p>
                </div>
                <div className="flex min-h-[240px] items-center justify-center bg-[#0a0a0a] p-8">
                  <TourVisual kind={active} />
                </div>
              </div>
            </ProductFrame>
          </BlurFade>
        </div>
      </Container>
    </section>
  );
}

function TourVisual({ kind }: { kind: (typeof TOUR_KEYS)[number] }) {
  if (kind === "chat") {
    return (
      <div className="w-full max-w-xs space-y-3">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3.5 py-2.5 text-sm text-black">
          Any openings Friday afternoon?
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-200">
          Yes — 1:00, 2:00, and 3:30 PM are free. Want one?
        </div>
      </div>
    );
  }
  if (kind === "book") {
    return (
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-zinc-950 p-5">
        <p className="text-xs tracking-wide text-zinc-500 uppercase">Cal.com</p>
        <p className="mt-2 text-lg font-semibold text-white">Fri · 2:00 PM</p>
        <p className="mt-1 text-sm text-zinc-400">Dental cleaning · 45 min</p>
        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-400">
          <CheckIcon className="size-4" weight="bold" />
          Event created
        </div>
      </div>
    );
  }
  return (
    <div className="grid w-full max-w-sm grid-cols-2 gap-3">
      {["Leads", "18", "Booked", "47"].map((cell, i) => (
        <div
          className="rounded-xl border border-white/10 bg-zinc-950 px-4 py-5"
          key={cell}
        >
          <p
            className={cn(
              "text-sm",
              i % 2 === 0 ? "text-zinc-500" : "text-2xl font-semibold text-white",
            )}
          >
            {cell}
          </p>
        </div>
      ))}
    </div>
  );
}

export function Integrations() {
  const t = useTranslations("landing.integrations");

  const items = [
    { key: "cal", icon: CalendarBlankIcon, soon: false },
    { key: "web", icon: ChatCircleIcon, soon: false },
    { key: "embed", icon: GlobeIcon, soon: false },
    { key: "whatsapp", icon: DevicesIcon, soon: true },
    { key: "voice", icon: MicrophoneIcon, soon: true },
  ] as const;

  return (
    <section className="border-y border-white/5 py-24">
      <Container>
        <BlurFade inView>
          <SectionHeading subtitle={t("subtitle")} title={t("title")} />
        </BlurFade>
        <div className="flex flex-wrap justify-center gap-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <BlurFade delay={0.05 * i} inView key={item.key}>
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-200">
                  <Icon className="size-4 text-zinc-400" weight="duotone" />
                  {t(`items.${item.key}`)}
                  {item.soon ? (
                    <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      {t("items.soon")}
                    </span>
                  ) : null}
                </div>
              </BlurFade>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

const MOMENT_KEYS = [
  "chat",
  "cal",
  "leads",
  "embed",
  "tenant",
  "remind",
] as const;

function MomentVisual({ kind }: { kind: (typeof MOMENT_KEYS)[number] }) {
  if (kind === "chat") {
    return (
      <div className="flex w-full flex-col justify-center gap-1">
        <div className="ml-auto w-[78%] rounded-lg rounded-br-sm bg-white px-2 py-1 text-[10px] leading-snug text-black">
          Friday 2pm?
        </div>
        <div className="w-[90%] rounded-lg rounded-bl-sm border border-white/10 bg-zinc-900 px-2 py-1 text-[10px] leading-snug text-zinc-300">
          Booked — see you then.
        </div>
      </div>
    );
  }

  if (kind === "cal") {
    return (
      <div className="flex w-full items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
          <CalendarBlankIcon className="size-4 text-zinc-300" weight="duotone" />
        </div>
        <div className="flex min-w-0 flex-1 gap-1">
          {["1:00", "2:00", "3:30"].map((slot, i) => (
            <span
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium",
                i === 1
                  ? "bg-white text-black"
                  : "border border-white/10 text-zinc-400",
              )}
              key={slot}
            >
              {slot}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (kind === "leads") {
    return (
      <div className="flex w-full items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
          <UserFocusIcon className="size-4 text-zinc-300" weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-white">Maya Chen</p>
          <p className="truncate text-[10px] text-zinc-500">
            maya@studio.co · wants consult
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
          New
        </span>
      </div>
    );
  }

  if (kind === "embed") {
    return (
      <div className="flex w-full items-center gap-3">
        <div className="relative flex size-9 items-center justify-center rounded-full bg-white text-black shadow-[0_0_0_4px_rgba(255,255,255,0.08)]">
          <ChatCircleIcon className="size-4" weight="fill" />
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-dashed border-white/15 bg-zinc-900/60 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <CodeIcon className="size-3 shrink-0" weight="bold" />
            {"<script src=\"…/embed.js\">"}
          </span>
        </div>
      </div>
    );
  }

  if (kind === "tenant") {
    return (
      <div className="flex w-full items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
          <BuildingsIcon className="size-4 text-zinc-300" weight="duotone" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-zinc-300">/b/north-clinic</p>
          <p className="text-[10px] text-zinc-500">Isolated workspace</p>
        </div>
        <span className="size-2 shrink-0 rounded-full bg-emerald-400" />
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-3">
      <div className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-zinc-900">
        <BellIcon className="size-4 text-zinc-300" weight="duotone" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white">Reminder sent</p>
        <p className="text-[10px] text-zinc-500">Tomorrow · 2:00 PM · SMS</p>
      </div>
      <CheckIcon className="size-3.5 shrink-0 text-emerald-400" weight="bold" />
    </div>
  );
}

export function FeatureMoments() {
  const t = useTranslations("landing.moments");

  return (
    <section className="py-24">
      <Container>
        <BlurFade inView>
          <SectionHeading subtitle={t("subtitle")} title={t("title")} />
        </BlurFade>
        <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MOMENT_KEYS.map((key, i) => (
            <BlurFade
              className={cn(
                "flex h-full flex-col",
                i === 0 && "sm:col-span-2 lg:col-span-1",
              )}
              delay={0.05 * i}
              inView
              key={key}
            >
              <article className="group flex h-full flex-col rounded-[1.5rem] border border-white/10 bg-zinc-950/80 p-6 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20">
                <div className="h-[5.25rem] shrink-0">
                  <h3 className="line-clamp-1 text-lg font-semibold text-white">
                    {t(`items.${key}.title`)}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
                    {t(`items.${key}.body`)}
                  </p>
                </div>
                <div className="pointer-events-none mt-6 flex h-20 shrink-0 items-center rounded-xl border border-white/5 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_55%)] px-3 py-3 opacity-90 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:opacity-100">
                  <MomentVisual kind={key} />
                </div>
              </article>
            </BlurFade>
          ))}
        </div>
      </Container>
    </section>
  );
}

type PlanId = "basic" | "premium" | "enterprise";

const PLANS: {
  id: PlanId;
  price: number;
  popular: boolean;
  featureKeys: string[];
  soonKeys?: string[];
}[] = [
  {
    id: "basic",
    price: 39,
    popular: false,
    featureKeys: ["f1", "f2", "f3", "f4"],
  },
  {
    id: "premium",
    price: 89,
    popular: true,
    featureKeys: ["f1", "f2", "f3", "f4"],
    soonKeys: ["f4"],
  },
  {
    id: "enterprise",
    price: 199,
    popular: false,
    featureKeys: ["f1", "f2", "f3", "f4", "f5"],
    soonKeys: ["f5"],
  },
];

export function Pricing() {
  const t = useTranslations("landing.pricing");
  const [annual, setAnnual] = useState(true);

  return (
    <section className="py-24" id="pricing">
      <Container>
        <BlurFade inView>
          <SectionHeading subtitle={t("subtitle")} title={t("title")} />
        </BlurFade>

        <BlurFade delay={0.08} inView>
          <div className="mb-10 flex justify-center">
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-sm">
              <button
                className={cn(
                  "rounded-full px-4 py-1.5 transition",
                  !annual ? "bg-white text-black" : "text-zinc-400",
                )}
                onClick={() => setAnnual(false)}
                type="button"
              >
                {t("monthly")}
              </button>
              <button
                className={cn(
                  "rounded-full px-4 py-1.5 transition",
                  annual ? "bg-white text-black" : "text-zinc-400",
                )}
                onClick={() => setAnnual(true)}
                type="button"
              >
                {t("annual")}
                <span className="ml-1 text-[11px] font-semibold text-zinc-500">
                  {t("annualSave")}
                </span>
              </button>
            </div>
          </div>
        </BlurFade>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const price = annual ? Math.round(plan.price * 10) : plan.price;
            const period = annual ? t("perYear") : t("perMonth");
            return (
              <BlurFade delay={0.06 * i} inView key={plan.id}>
                <article
                  className={cn(
                    "flex h-full flex-col rounded-[1.5rem] border p-6",
                    plan.popular
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 bg-zinc-950 text-white",
                  )}
                >
                  <div className="mb-6">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">
                        {t(`plans.${plan.id}.name`)}
                      </h3>
                      {plan.popular ? (
                        <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                          {t("popular")}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-sm",
                        plan.popular ? "text-zinc-600" : "text-zinc-400",
                      )}
                    >
                      {t(`plans.${plan.id}.description`)}
                    </p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">
                      ${price}
                      <span className="text-base font-normal text-zinc-500">
                        {period}
                      </span>
                    </p>
                  </div>
                  <ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm">
                    {plan.featureKeys.map((fk) => {
                      const soon = plan.soonKeys?.includes(fk);
                      return (
                        <li className="flex items-start gap-2" key={fk}>
                          <CheckIcon
                            className={cn(
                              "mt-0.5 size-4 shrink-0",
                              plan.popular ? "text-black" : "text-zinc-300",
                              soon && "opacity-40",
                            )}
                            weight="bold"
                          />
                          <span
                            className={cn(
                              plan.popular ? "text-zinc-700" : "text-zinc-300",
                              soon && "opacity-60",
                            )}
                          >
                            {t(`plans.${plan.id}.features.${fk}`)}
                            {soon ? (
                              <span
                                className={cn(
                                  "ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                                  plan.popular
                                    ? "border-zinc-300 text-zinc-500"
                                    : "border-white/15 text-zinc-500",
                                )}
                              >
                                {t("comingSoon")}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <a
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition",
                      plan.popular
                        ? "bg-black text-white hover:bg-zinc-800"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                    )}
                    href="/signup"
                  >
                    {t(`plans.${plan.id}.cta`)}
                  </a>
                </article>
              </BlurFade>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6"] as const;

export function Faq() {
  const t = useTranslations("landing.faq");
  const [open, setOpen] = useState<string | null>("q1");

  return (
    <section className="border-t border-white/5 py-24" id="faq">
      <Container className="max-w-3xl">
        <BlurFade inView>
          <SectionHeading subtitle={t("subtitle")} title={t("title")} />
        </BlurFade>
        <div className="divide-y divide-white/8 rounded-[1.5rem] border border-white/10 bg-zinc-950/60">
          {FAQ_KEYS.map((key, i) => {
            const isOpen = open === key;
            return (
              <BlurFade delay={0.04 * i} inView key={key}>
                <div>
                  <button
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium text-white sm:px-6 sm:text-base"
                    onClick={() => setOpen(isOpen ? null : key)}
                    type="button"
                  >
                    {t(`items.${key}.q`)}
                    <span
                      className={cn(
                        "text-zinc-500 transition",
                        isOpen && "rotate-45 text-white",
                      )}
                    >
                      +
                    </span>
                  </button>
                  {isOpen ? (
                    <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-400 sm:px-6">
                      {t(`items.${key}.a`)}
                    </p>
                  ) : null}
                </div>
              </BlurFade>
            );
          })}
        </div>
      </Container>
    </section>
  );
}

export function FinalCta() {
  const t = useTranslations("landing.finalCta");

  return (
    <section className="px-4 pb-24 sm:px-8">
      <Container className="max-w-5xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 px-6 py-16 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_60%)]" />
          <div className="relative z-10">
            <BlurFade inView>
              <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                {t("title")}
              </h2>
            </BlurFade>
            <BlurFade delay={0.08} inView>
              <p className="mx-auto mt-4 max-w-lg text-zinc-400">
                {t("subtitle")}
              </p>
            </BlurFade>
            <BlurFade delay={0.14} inView>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <PrimaryButton href="/signup">{t("ctaPrimary")}</PrimaryButton>
                <GhostButton href="/chat">{t("ctaSecondary")}</GhostButton>
              </div>
            </BlurFade>
          </div>
        </div>
      </Container>
    </section>
  );
}
