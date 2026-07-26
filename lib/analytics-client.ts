"use client";

import posthog from "posthog-js";
import type { AnalyticsEvent } from "@/lib/analytics-events";

let initialized = false;

export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return;

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    capture_pageview: true,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
  initialized = true;
}

export function track(
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.capture(event, props);
}

export function identifyUser(
  id: string,
  props?: Record<string, unknown>,
): void {
  if (!initialized) return;
  posthog.identify(id, props);
}
