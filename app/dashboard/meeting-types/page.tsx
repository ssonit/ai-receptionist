import { MeetingTypesForm } from "@/app/_components/meeting-types-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { getCalMeProfile, withCalApiKey } from "@/lib/calcom";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
} from "@/lib/workspace";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { redirect } from "next/navigation";

export default async function MeetingTypesPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/meeting-types");
  }
  if (!dashboard.workspaceId) {
    redirect("/dashboard/setup");
  }

  const meetingTypes = await listWorkspaceMeetingTypes(
    dashboard.workspaceId,
  ).catch(() => []);

  let calUsername = "";
  try {
    const apiKey = await getCalApiKeyForWorkspace(dashboard.workspaceId);
    const me = await withCalApiKey(apiKey, () => getCalMeProfile());
    calUsername = me.username;
    if (me.username) {
      const admin = createAdminClient();
      await admin
        .from("workspaces")
        .update({ cal_username: me.username })
        .eq("id", dashboard.workspaceId);
    }
  } catch {
    const ws = await getWorkspaceById(dashboard.workspaceId);
    calUsername = ws?.cal_username ?? "";
  }

  return (
    <DashboardShell title="Meeting types" user={dashboard.navUser} workspaceId={dashboard.workspaceId}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <MeetingTypesForm calUsername={calUsername} rows={meetingTypes} />
      </div>
    </DashboardShell>
  );
}
