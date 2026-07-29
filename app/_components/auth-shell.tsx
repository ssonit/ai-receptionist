"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { EveLogo } from "@/components/eve-logo";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";
import { Particles } from "@/components/ui/particles";
import { cn } from "@/lib/utils";

const highlights = [
  "View bookings & leads in realtime",
  "24/7 scheduling chat agent",
  "Cal.com + Supabase sync",
];

export function AuthShell({
  title,
  description,
  children,
  footer,
  mode = "login",
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  mode?: "login" | "signup";
}) {
  return (
    <main className="relative flex min-h-dvh overflow-hidden bg-black text-zinc-100">
      <Particles className="pointer-events-none absolute inset-0 opacity-50" color="#ffffff" ease={80} quantity={70} />
      <AnimatedGridPattern
        className={cn(
          "pointer-events-none absolute inset-0 fill-white/[0.02] stroke-white/[0.05]",
          "[mask-image:radial-gradient(700px_circle_at_30%_40%,white,transparent)]",
        )}
        duration={3}
        maxOpacity={0.22}
        numSquares={36}
      />
      <div className="pointer-events-none absolute -left-24 top-1/4 size-[28rem] rounded-full bg-teal-500/10 blur-[100px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 size-[22rem] rounded-full bg-white/5 blur-[90px]" />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 lg:grid-cols-2">
        <aside className="hidden flex-col justify-between border-r border-white/5 px-10 py-10 lg:flex xl:px-14">
          <EveLogo href="/" linkClassName="text-white" showLabel size="sm" />

          <BlurFade delay={0.1} inView>
            <div className="max-w-md space-y-6">
              <AnimatedShinyText className="text-xs tracking-[0.2em] text-zinc-400 uppercase dark:text-zinc-400">
                Booking dashboard
              </AnimatedShinyText>
              <h2 className="text-4xl font-semibold tracking-tight text-white xl:text-5xl">
                One place to run bookings.
              </h2>
              <p className="text-sm leading-relaxed text-zinc-400">
                Sign in to track schedules, chat leads, and booking status — a minimal UI in the
                Magic UI / shadcn style.
              </p>
              <ul className="space-y-3 pt-2">
                {highlights.map((item) => (
                  <li className="flex items-center gap-3 text-sm text-zinc-300" key={item}>
                    <span className="size-1.5 shrink-0 rounded-full bg-teal-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </BlurFade>

          <p className="text-xs text-zinc-600">
            {mode === "login" ? "Welcome back to Eve." : "Create your Eve account."}
          </p>
        </aside>

        <section className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <EveLogo href="/" linkClassName="text-white" showLabel size="sm" />
            <Link className="text-sm text-zinc-400 transition hover:text-white" href="/chat">
              Open chat
            </Link>
          </div>

          <BlurFade className="mx-auto w-full max-w-md" delay={0.05} inView>
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-950/75 p-6 shadow-[0_40px_100px_-50px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:p-8">
              <BorderBeam
                borderWidth={1.5}
                colorFrom="#5eead4"
                colorTo="#ffffff"
                duration={8}
                size={120}
              />
              <div className="mb-7 space-y-2">
                <EveLogo
                  labelClassName="text-xs tracking-[0.18em] text-zinc-500 uppercase"
                  showLabel
                  size="xs"
                />
                <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  {title}
                </h1>
                <div className="text-sm leading-relaxed text-zinc-400">{description}</div>
              </div>
              {children}
            </div>
            {footer ? <div className="mt-6 text-center text-sm text-zinc-500">{footer}</div> : null}
          </BlurFade>
        </section>
      </div>
    </main>
  );
}
