"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocaleToggle } from "@/components/locale-provider";
import { Container, PrimaryButton } from "./primitives";

export function LandingHeader() {
  const t = useTranslations("landing");

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#070707]/70 backdrop-blur-xl">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Link
          className="text-sm font-semibold tracking-tight text-white"
          href="/"
        >
          {t("brand")}
        </Link>

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
            href="/login"
          >
            {t("nav.logIn")}
          </Link>
          <PrimaryButton className="h-9 px-4 text-xs" href="/signup">
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
        <div className="text-center sm:text-left">
          <p className="font-medium text-zinc-300">{brand("brand")}</p>
          <p className="mt-1">{t("tagline")}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <Link className="hover:text-white" href="/chat">
            {t("try")}
          </Link>
          <Link className="hover:text-white" href="/signup">
            {t("signUp")}
          </Link>
          <Link className="hover:text-white" href="/login">
            {t("logIn")}
          </Link>
          <Link className="hover:text-white" href="/dashboard">
            {t("dashboard")}
          </Link>
          <Link className="hover:text-white" href="/terms">
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
