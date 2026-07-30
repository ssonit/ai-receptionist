import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { absoluteAppOrigin } from "@/lib/app-origin";
import {
  buildEmbedSnippets,
  formatEmbedSiteId,
} from "@/lib/embed";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createTranslator } from "@/lib/i18n";
import { readDashboardLocale } from "@/lib/read-locale-cookie";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceBookingLive } from "@/lib/workspace";

import { EmbedPageClient } from "./embed-page-client";

export default async function EmbedDashboardPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.embed);

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) redirect(DASHBOARD_PATH.setup);

  const supabase = await createClient();
  const [{ data: workspace }, bookingLive, origin, locale] = await Promise.all([
    supabase
      .from("workspaces")
      .select("slug, embed_allowed_origins")
      .eq("id", workspaceId)
      .maybeSingle(),
    isWorkspaceBookingLive(workspaceId),
    absoluteAppOrigin(),
    readDashboardLocale(),
  ]);
  const t = createTranslator(locale);

  const siteId = formatEmbedSiteId(workspaceId);
  const snippets = buildEmbedSnippets(origin, siteId);
  const embedPreviewUrl = siteId
    ? `${origin}/embed/${encodeURIComponent(siteId)}`
    : null;
  const embedHostDemoUrl = siteId
    ? `${origin}/embed-host-demo.html?id=${encodeURIComponent(siteId)}`
    : null;
  const allowedOrigins = Array.isArray(workspace?.embed_allowed_origins)
    ? (workspace.embed_allowed_origins as string[])
    : [];

  return (
    <DashboardShell
      title={t("dashboard.embedTitle")}
      user={dashboard.navUser}
      workspaceId={workspaceId}
    >
      <EmbedPageClient
        allowedOrigins={allowedOrigins}
        bookingLive={bookingLive}
        embedHostDemoUrl={embedHostDemoUrl}
        embedPreviewUrl={embedPreviewUrl}
        siteId={siteId}
        snippets={snippets}
      />
    </DashboardShell>
  );
}
