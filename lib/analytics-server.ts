import { PostHog } from "posthog-node";
import type { AnalyticsEvent } from "@/lib/analytics-events";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ||
        "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

export async function trackServer(
  event: AnalyticsEvent,
  distinctId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.capture({ distinctId, event, properties: props });
    await ph.flush();
  } catch (error) {
    console.error("[analytics] server capture failed", error);
  }
}

export async function identifyUserServer(
  distinctId: string,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    const ph = getClient();
    if (!ph) return;
    ph.identify({ distinctId, properties: props });
    await ph.flush();
  } catch (error) {
    console.error("[analytics] server identify failed", error);
  }
}

