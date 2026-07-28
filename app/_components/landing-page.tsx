"use client";

import { LenisProvider } from "@/components/providers/lenis-provider";
import { LocaleProvider } from "@/components/locale-provider";
import type { AppLocale } from "@/lib/locale";
import { LandingFooter, LandingHeader } from "./landing/chrome";
import { LandingHero } from "./landing/hero";
import { LandingShell } from "./landing/primitives";
import {
  Faq,
  FeatureMoments,
  FinalCta,
  Integrations,
  LogoStrip,
  Pricing,
  ProductTour,
} from "./landing/sections";

export function LandingPage({
  initialLocale,
}: {
  initialLocale?: AppLocale;
}) {
  return (
    <LocaleProvider initialLocale={initialLocale} kind="guest">
      <LenisProvider>
        <LandingShell>
          <LandingHeader />
          <LandingHero />
          <LogoStrip />
          <ProductTour />
          <Integrations />
          <FeatureMoments />
          <Pricing />
          <Faq />
          <FinalCta />
          <LandingFooter />
        </LandingShell>
      </LenisProvider>
    </LocaleProvider>
  );
}
