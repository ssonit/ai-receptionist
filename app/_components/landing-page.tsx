"use client";

import { ArrowRightIcon, CheckIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { Marquee } from "@/components/magicui/marquee";
import { LenisProvider } from "@/components/providers/lenis-provider";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Particles } from "@/components/ui/particles";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { Safari } from "@/components/ui/safari";
import { cn } from "@/lib/utils";

const logos = [
  "Cal.com",
  "WhatsApp",
  "Twilio",
  "Supabase",
  "Vercel",
  "Retell",
  "Stripe",
  "Meta",
];

const features = [
  {
    title: "Chat 24/7",
    description:
      "Agent trả lời FAQ, sàng lọc lead và giữ cuộc trò chuyện khi bạn đang bận.",
  },
  {
    title: "Booking thật",
    description:
      "Kiểm tra slot trống rồi tạo lịch trên Cal.com. Một tool chung, không double-book.",
  },
  {
    title: "Dashboard rõ",
    description:
      "Xem leads, booking và trạng thái lịch trong một bảng điều khiển gọn.",
  },
  {
    title: "An toàn rõ",
    description:
      "Disclaimer rõ. Giữ quyền kiểm soát lịch và dữ liệu cho workspace của bạn.",
  },
];

const plans = [
  {
    name: "Basic",
    price: 39,
    description: "Cho team mới bắt đầu với chat đặt lịch.",
    features: ["Chat web", "Cal.com booking", "FAQ + intake", "Dashboard cơ bản"],
    cta: "Bắt đầu",
    href: "/signup",
    popular: false,
  },
  {
    name: "Premium",
    price: 89,
    description: "Cho team đang tăng lead và cần nhắc lịch.",
    features: [
      "Mọi thứ ở Basic",
      "WhatsApp (sắp mở)",
      "Outbound reminder",
      "Onboarding ưu tiên",
    ],
    cta: "Chọn Premium",
    href: "/signup",
    popular: true,
  },
  {
    name: "Enterprise",
    price: 149,
    description: "Hạn mức cao hơn cho team đang mở rộng.",
    features: ["Hạn mức cao", "Custom FAQ", "Multi-location roadmap", "Hỗ trợ 1:1"],
    cta: "Liên hệ",
    href: "/chat",
    popular: false,
  },
  {
    name: "Ultimate",
    price: 199,
    description: "Gói đầy đủ cho nhiều workspace và team vận hành.",
    features: [
      "Mọi thứ ở Enterprise",
      "Voice agent Retell",
      "SLA ưu tiên",
      "Tùy biến agent theo brand",
    ],
    cta: "Dùng thử chat",
    href: "/chat",
    popular: false,
  },
];

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-8">
        <Link className="text-sm font-semibold tracking-tight text-white" href="/">
          Eve
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
          <a className="transition hover:text-white" href="#features">
            Features
          </a>
          <a className="transition hover:text-white" href="#pricing">
            Pricing
          </a>
          <Link className="transition hover:text-white" href="/dashboard">
            Dashboard
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link className="hidden text-sm text-zinc-300 transition hover:text-white sm:inline" href="/login">
            Log in
          </Link>
          <Link href="/chat">
            <RainbowButton className="h-9 rounded-full px-4 text-xs font-semibold" size="sm">
              Get Started
            </RainbowButton>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-10 pt-16 sm:px-8 sm:pt-24">
      <Particles className="absolute inset-0" color="#ffffff" ease={80} quantity={120} refresh />
      <AnimatedGridPattern
        className={cn(
          "absolute inset-0 h-full w-full fill-white/[0.03] stroke-white/[0.06]",
          "[mask-image:radial-gradient(700px_circle_at_center,white,transparent)]",
        )}
        duration={3}
        maxOpacity={0.25}
        numSquares={40}
      />

      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
        <BlurFade delay={0.05} inView>
          <Link
            className="group mb-8 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 transition hover:bg-white/10"
            href="#pricing"
          >
            <AnimatedShinyText className="inline-flex items-center gap-2 text-xs text-zinc-300 dark:text-zinc-300">
              <span>Introducing Eve Template</span>
              <ArrowRightIcon className="size-3.5 transition group-hover:translate-x-0.5" />
            </AnimatedShinyText>
          </Link>
        </BlurFade>

        <BlurFade delay={0.12} inView>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl sm:leading-[1.05]">
            Eve is the new way to book appointments.
          </h1>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <p className="mt-5 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
            AI chat answers FAQ, checks availability, and books straight into your calendar so you
            never miss another lead.
          </p>
        </BlurFade>

        <BlurFade delay={0.28} inView>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/chat">
              <RainbowButton className="rounded-full px-6 font-semibold" size="lg">
                Get Started for free
              </RainbowButton>
            </Link>
            <Link
              className="inline-flex h-11 items-center rounded-full border border-white/15 bg-white/5 px-6 text-sm font-medium text-white transition hover:bg-white/10"
              href="#pricing"
            >
              View pricing
            </Link>
          </div>
        </BlurFade>
      </div>

      <BlurFade className="relative z-10 mx-auto mt-14 max-w-5xl" delay={0.35} inView>
        <div className="relative">
          <div className="pointer-events-none absolute -inset-x-10 -top-10 -z-10 h-40 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.18),transparent_70%)] blur-2xl" />
          <Safari
            className="size-full"
            imageSrc="/landing-hero-chat.png"
            url="eve.app/chat"
          />
        </div>
      </BlurFade>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="border-y border-white/5 bg-black py-12">
      <BlurFade inView>
        <p className="mb-8 text-center text-xs tracking-[0.22em] text-zinc-500 uppercase">
          Trusted by teams from around the world
        </p>
      </BlurFade>
      <Marquee className="[--duration:30s]" pauseOnHover>
        {logos.map((logo) => (
          <div
            className="mx-8 flex h-10 items-center text-sm font-semibold tracking-wide text-zinc-500"
            key={logo}
          >
            {logo}
          </div>
        ))}
      </Marquee>
      <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-6 px-4 sm:grid-cols-4 sm:px-8">
        {[
          { value: 98, suffix: "%", label: "Lead response rate" },
          { value: 3, suffix: "x", label: "More bookings" },
          { value: 24, suffix: "/7", label: "Always online" },
          { value: 2, suffix: "min", label: "Avg. book time" },
        ].map((stat, i) => (
          <BlurFade delay={0.08 * i} inView key={stat.label}>
            <div className="text-center">
              <div className="text-3xl font-semibold tracking-tight text-white">
                <NumberTicker value={stat.value} />
                {stat.suffix}
              </div>
              <p className="mt-1 text-xs text-zinc-500">{stat.label}</p>
            </div>
          </BlurFade>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="relative px-4 py-24 sm:px-8" id="features">
      <div className="mx-auto max-w-6xl">
        <BlurFade inView>
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Everything you need to never miss a booking.
            </h2>
            <p className="mt-4 text-zinc-400">
              Beautifully designed flows for chat, booking, and ops. Built with Tailwind,
              React, and Magic UI motion.
            </p>
          </div>
        </BlurFade>

        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((feature, i) => (
            <BlurFade className="h-full" delay={0.08 * i} inView key={feature.title}>
              <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/80 p-8 transition hover:border-white/20">
                <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                  <div className="absolute inset-0 bg-[radial-gradient(500px_circle_at_var(--x,50%)_0%,rgba(255,255,255,0.08),transparent_50%)]" />
                </div>
                <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{feature.description}</p>
              </article>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <section className="relative px-4 py-24 sm:px-8" id="pricing">
      <div className="mx-auto max-w-6xl">
        <BlurFade inView>
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Simple pricing for everyone.
            </h2>
            <p className="mt-4 text-zinc-400">
              Choose an affordable plan packed with the best features for engaging visitors,
              creating loyalty, and driving bookings.
            </p>
          </div>
        </BlurFade>

        <BlurFade delay={0.1} inView>
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
                Monthly
              </button>
              <button
                className={cn(
                  "rounded-full px-4 py-1.5 transition",
                  annual ? "bg-white text-black" : "text-zinc-400",
                )}
                onClick={() => setAnnual(true)}
                type="button"
              >
                Annual
                <span className="ml-1 text-[11px] font-semibold text-emerald-600">
                  2 months free
                </span>
              </button>
            </div>
          </div>
        </BlurFade>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, i) => {
            const price = annual ? Math.round(plan.price * 10) : plan.price;
            const period = annual ? "/year" : "/month";
            return (
              <BlurFade delay={0.06 * i} inView key={plan.name}>
                <article
                  className={cn(
                    "flex h-full flex-col rounded-3xl border p-6",
                    plan.popular
                      ? "border-white/30 bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                      : "border-white/10 bg-zinc-950 text-white",
                  )}
                >
                  <div className="mb-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      {plan.popular ? (
                        <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-semibold text-white">
                          Popular
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={cn(
                        "mt-2 text-sm",
                        plan.popular ? "text-zinc-600" : "text-zinc-400",
                      )}
                    >
                      {plan.description}
                    </p>
                    <p className="mt-5 text-4xl font-semibold tracking-tight">
                      ${price}
                      <span
                        className={cn(
                          "text-base font-normal",
                          plan.popular ? "text-zinc-500" : "text-zinc-500",
                        )}
                      >
                        {period}
                      </span>
                    </p>
                  </div>
                  <ul className="mb-8 flex flex-1 flex-col gap-2.5 text-sm">
                    {plan.features.map((item) => (
                      <li className="flex items-start gap-2" key={item}>
                        <CheckIcon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            plan.popular ? "text-black" : "text-zinc-300",
                          )}
                          weight="bold"
                        />
                        <span className={plan.popular ? "text-zinc-700" : "text-zinc-300"}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={cn(
                      "inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition",
                      plan.popular
                        ? "bg-black text-white hover:bg-zinc-800"
                        : "border border-white/15 bg-white/5 text-white hover:bg-white/10",
                    )}
                    href={plan.href}
                  >
                    {plan.cta}
                  </Link>
                </article>
              </BlurFade>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden px-4 pb-24 sm:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 px-6 py-16 text-center sm:px-12">
        <Particles className="absolute inset-0" color="#ffffff" ease={70} quantity={60} />
        <div className="relative z-10">
          <BlurFade inView>
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">
              Stop wasting time on missed calls.
            </h2>
          </BlurFade>
          <BlurFade delay={0.1} inView>
            <p className="mx-auto mt-4 max-w-lg text-zinc-400">
              Start your free chat trial. No credit card required.
            </p>
          </BlurFade>
          <BlurFade delay={0.18} inView>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/chat">
                <RainbowButton className="rounded-full px-6 font-semibold" size="lg">
                  Start free trial
                </RainbowButton>
              </Link>
              <Link
                className="inline-flex h-11 items-center rounded-full border border-white/15 px-6 text-sm font-medium text-white transition hover:bg-white/10"
                href="/signup"
              >
                Create account
              </Link>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/5 px-4 py-10 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
        <p>Eve</p>
        <p>AI booking assistant. Not a substitute for a dentist.</p>
        <div className="flex gap-4">
          <Link className="hover:text-white" href="/chat">
            Chat
          </Link>
          <Link className="hover:text-white" href="/login">
            Login
          </Link>
          <Link className="hover:text-white" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <LenisProvider>
      <div className="min-h-dvh bg-black text-zinc-100">
        <SiteHeader />
        <Hero />
        <SocialProof />
        <Features />
        <Pricing />
        <FinalCta />
        <SiteFooter />
      </div>
    </LenisProvider>
  );
}
