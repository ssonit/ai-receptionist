import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { isWorkspaceBookingLive } from "@/lib/workspace";

import { EmbedSnippet } from "./embed-snippet";

export default async function EmbedDashboardPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) redirect("/login?next=/dashboard/embed");

  const workspaceId = dashboard.workspaceId;
  if (!workspaceId) redirect("/dashboard/setup");

  const supabase = await createClient();
  const [{ data: workspace }, bookingLive, h, t] = await Promise.all([
    supabase
      .from("workspaces")
      .select("slug")
      .eq("id", workspaceId)
      .maybeSingle(),
    isWorkspaceBookingLive(workspaceId),
    headers(),
    getTranslations(),
  ]);

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const slug = workspace?.slug ?? "";

  const snippet = `<script src="${proto}://${host}/embed.js"\n        data-eve-slug="${slug}" async></script>`;

  return (
    <DashboardShell
      title={t("dashboard.embedTitle")}
      user={dashboard.navUser}
      workspaceId={workspaceId}
    >
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.embedBody")}
        </p>
        {bookingLive ? null : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            {t("dashboard.embedNotLive")}
          </p>
        )}
        <EmbedSnippet snippet={snippet} />
      </div>
    </DashboardShell>
  );
}

