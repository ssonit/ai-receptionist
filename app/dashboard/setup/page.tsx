import { SetupShell } from "@/components/setup-shell";
import { SetupWizard } from "@/components/setup-wizard";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/setup");
  }
  if (!dashboard.workspaceId) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, timezone, about, cal_username, cal_event_type_id, cal_api_key_encrypted, setup_completed_at",
    )
    .eq("id", dashboard.workspaceId)
    .maybeSingle();

  if (!workspace) {
    redirect("/login");
  }

  if (workspace.setup_completed_at) {
    redirect("/dashboard");
  }

  const meetingTypes = await listWorkspaceMeetingTypes(
    dashboard.workspaceId,
  ).catch(() => []);

  const aiRow = meetingTypes.find((r) => r.is_ai_booking) ?? null;
  const hasCalKey = Boolean(workspace.cal_api_key_encrypted);

  let initialStep: 1 | 2 | 3 = 1;
  if (hasCalKey && aiRow) initialStep = 3;
  else if (hasCalKey) initialStep = 2;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const chatBaseUrl = `${proto}://${host}`;

  return (
    <SetupShell>
      <SetupWizard
        chatBaseUrl={chatBaseUrl}
        initialStep={initialStep}
        meetingTypes={meetingTypes}
        workspace={{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          about: workspace.about?.trim() || null,
          calUsername: workspace.cal_username,
          hasCalKey,
          aiMeetingTypeId: aiRow?.id ?? null,
        }}
      />
    </SetupShell>
  );
}
