"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { EveLogo } from "@/components/eve-logo";
import { LocaleToggle } from "@/components/locale-provider";
import { Container, PrimaryButton } from "./primitives";
import { ROUTES } from "@/lib/routes";

export function LandingHeader() {
  const t = useTranslations("landing");

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070707]/70 backdrop-blur-xl">
      <Container className="flex h-14 items-center justify-between gap-4">
        <EveLogo
          href="/"
          label={t("brand")}
          linkClassName="text-white"
          showLabel
          size="sm"
        />

        <nav className="hidden items-center gap-7 text-sm text-zinc-400 md:flex">
          <a className="transition hover:text-white" href="#features">
            {t("nav.features")}
          </a>
          <a className="transition hover:text-white" href="#pricing">
            {t("nav.pricing")}
          </a>
          <a className="transition hover:text-white" href="#faq">
            {t("nav.faq")}
          </a>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <LocaleToggle className="hidden sm:inline-flex" variant="dark" />
          <Link
            className="hidden text-sm text-zinc-300 transition hover:text-white sm:inline"
            href={ROUTES.LOGIN}
          >
            {t("nav.logIn")}
          </Link>
          <PrimaryButton className="h-9 px-4 text-xs" href={ROUTES.SIGNUP}>
            {t("nav.startFree")}
          </PrimaryButton>
        </div>
      </Container>
    </header>
  );
}

export function LandingFooter() {
  const t = useTranslations("landing.footer");
  const brand = useTranslations("landing");

  return (
    <footer className="border-t border-white/5 py-10">
      <Container className="flex flex-col items-center justify-between gap-5 text-sm text-zinc-500 sm:flex-row">
        <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
          <EveLogo
            label={brand("brand")}
            labelClassName="text-zinc-300"
            showLabel
            size="sm"
          />
          <p>{t("tagline")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link className="hover:text-white" href="/chat">
            {t("try")}
          </Link>
          <Link className="hover:text-white" href={ROUTES.SIGNUP}>
            {t("signUp")}
          </Link>
          <Link className="hover:text-white" href={ROUTES.LOGIN}>
            {t("logIn")}
          </Link>
          <Link className="hover:text-white" href="/dashboard">
            {t("dashboard")}
          </Link>
          <Link className="hover:text-white" href={ROUTES.TERMS}>
            {t("terms")}
          </Link>
          <Link className="hover:text-white" href="/privacy">
            {t("privacy")}
          </Link>
        </div>
      </Container>
    </footer>
  );
}
