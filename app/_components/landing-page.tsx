"use client";

import { useEffect } from "react";
import { LenisProvider } from "@/components/providers/lenis-provider";
import { LocaleProvider } from "@/components/locale-provider";
import type { AppLocale } from "@/lib/locale";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { track } from "@/lib/analytics-client";
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
  useEffect(() => {
    track(ANALYTICS_EVENT.LANDING_VIEWED);
  }, []);

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
