"use server";

import { logSetupEvent, type SetupAnalyticsEvent } from "@/lib/setup-analytics";
import { getDashboardUser } from "@/lib/dashboard-user";

export async function trackSetupEventAction(
  event: SetupAnalyticsEvent,
  meta?: Record<string, unknown>,
): Promise<void> {
  const dashboard = await getDashboardUser();
  if (!dashboard?.workspaceId) return;
  await logSetupEvent({
    workspaceId: dashboard.workspaceId,
    event,
    meta,
  });
}
