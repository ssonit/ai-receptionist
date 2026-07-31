import { SetupShell } from "@/components/setup-shell";
import { SetupWizard } from "@/components/setup-wizard";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.setup);
  if (!dashboard.workspaceId) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select(
      "id, name, slug, timezone, about, cal_username, cal_event_type_id, cal_api_key_encrypted, cal_auth_mode, setup_completed_at",
    )
    .eq("id", dashboard.workspaceId)
    .maybeSingle();

  if (!workspace) {
    redirect("/login");
  }

  const meetingTypes = await listWorkspaceMeetingTypes(
    dashboard.workspaceId,
  ).catch(() => []);

  const aiRow = meetingTypes.find((r) => r.is_ai_booking) ?? null;
  const hasCalKey = Boolean(workspace.cal_api_key_encrypted);
  const calAuthMode = (workspace.cal_auth_mode as string | null) ?? (hasCalKey ? "api_key" : null);
  const setupCompleted = Boolean(workspace.setup_completed_at);

  let initialStep: 1 | 2 | 3 | 4 = 1;
  if (setupCompleted && hasCalKey && aiRow) initialStep = 4;
  else if (setupCompleted && hasCalKey) initialStep = 4;
  else if (setupCompleted) initialStep = 3;

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
        setupCompleted={setupCompleted}
        workspace={{
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          about: workspace.about?.trim() || null,
          calUsername: workspace.cal_username,
          hasCalKey,
          calAuthMode,
          aiMeetingTypeId: aiRow?.id ?? null,
        }}
      />
    </SetupShell>
  );
}
