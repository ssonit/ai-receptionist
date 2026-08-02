"use client";

import { ArrowRightIcon, ChatCircleIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { BlurFade } from "@/components/ui/blur-fade";
import {
  Container,
  GhostButton,
  PrimaryButton,
} from "./primitives";
import { ProductStage } from "./product-stage";
import { ROUTES } from "@/lib/routes";

export function LandingHero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative px-4 pb-8 pt-16 sm:px-8 sm:pb-12 sm:pt-24">
      <Container className="max-w-5xl">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <BlurFade delay={0.04} inView>
            <p className="mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
              {t("badge")}
            </p>
          </BlurFade>

          <BlurFade delay={0.1} inView>
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl sm:leading-[1.02]">
              {t("title")}
            </h1>
          </BlurFade>

          <BlurFade delay={0.16} inView>
            <p className="mt-5 max-w-xl text-pretty text-base text-zinc-400 sm:text-lg">
              {t("subtitle")}
            </p>
          </BlurFade>

          <BlurFade delay={0.22} inView>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <PrimaryButton href={ROUTES.SIGNUP}>
                {t("ctaPrimary")}
                <ArrowRightIcon className="size-4 transition group-hover:translate-x-0.5" />
              </PrimaryButton>
              <GhostButton href="/chat">
                <ChatCircleIcon className="size-4" weight="fill" />
                {t("ctaSecondary")}
              </GhostButton>
            </div>
          </BlurFade>
        </div>

        <BlurFade className="mx-auto mt-14 max-w-5xl" delay={0.28} inView>
          <div className="relative">
            <div className="pointer-events-none absolute -inset-x-8 -top-8 -z-10 h-40 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.14),transparent_70%)] blur-2xl" />
            <ProductStage />
          </div>
        </BlurFade>
      </Container>
    </section>
  );
}
