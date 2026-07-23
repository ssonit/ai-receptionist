import { MeetingTypesForm } from "@/app/_components/meeting-types-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { getCalMeProfile } from "@/lib/calcom";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { redirect } from "next/navigation";

export default async function MeetingTypesPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/meeting-types");
  }

  const meetingTypes = dashboard.workspaceId
    ? await listWorkspaceMeetingTypes(dashboard.workspaceId).catch(() => [])
    : [];

  let calUsername = "";
  try {
    const me = await getCalMeProfile();
    calUsername = me.username;
    if (dashboard.workspaceId && me.username) {
      const admin = createAdminClient();
      await admin
        .from("workspaces")
        .update({ cal_username: me.username })
        .eq("id", dashboard.workspaceId);
    }
  } catch {
    // URL prefix stays empty until Cal.com is reachable; form shows a hint.
  }

  return (
    <DashboardShell title="Meeting types" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <MeetingTypesForm calUsername={calUsername} rows={meetingTypes} />
      </div>
    </DashboardShell>
  );
}
