import { redirect } from "next/navigation";

import { absoluteAppOrigin } from "@/lib/app-origin";
import {
  buildEmbedSnippets,
  formatEmbedSiteId,
} from "@/lib/embed";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceBookingLive } from "@/lib/workspace";

import { EmbedPageClient } from "./embed-page-client";

export default async function EmbedDashboardPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.embed);

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) redirect(DASHBOARD_PATH.setup);

  const supabase = await createClient();
  const [{ data: workspace }, bookingLive, origin] = await Promise.all([
    supabase
      .from("workspaces")
      .select("slug, embed_allowed_origins")
      .eq("id", workspaceId)
      .maybeSingle(),
    isWorkspaceBookingLive(workspaceId),
    absoluteAppOrigin(),
  ]);

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
    <EmbedPageClient
      allowedOrigins={allowedOrigins}
      bookingLive={bookingLive}
      embedHostDemoUrl={embedHostDemoUrl}
      embedPreviewUrl={embedPreviewUrl}
      siteId={siteId}
      snippets={snippets}
    />
  );
}
