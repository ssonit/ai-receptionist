import { WorkspaceSettingsForm } from "@/app/_components/workspace-settings-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/settings");
  }

  const meetingTypes = dashboard.workspaceId
    ? await listWorkspaceMeetingTypes(dashboard.workspaceId).catch(() => [])
    : [];

  let workspace: {
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    email: string | null;
    website: string | null;
    tagline: string | null;
    about: string | null;
    businessHours: string | null;
    servicesSummary: string | null;
    agentInstructions: string | null;
  } | null = null;

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, timezone, phone, address, email, website, tagline, about, business_hours, services_summary, agent_instructions",
      )
      .eq("id", dashboard.workspaceId)
      .maybeSingle();

    if (data) {
      workspace = {
        name: data.name,
        timezone: data.timezone,
        phone: data.phone,
        address: data.address,
        email: data.email,
        website: data.website,
        tagline: data.tagline,
        about: data.about,
        businessHours: data.business_hours,
        servicesSummary: data.services_summary,
        agentInstructions: data.agent_instructions,
      };
    }
  }

  return (
    <DashboardShell title="Settings" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Cấu hình hồ sơ workspace cho AI và chọn meeting type đặt lịch.
          </p>
        </div>
        <WorkspaceSettingsForm
          meetingTypes={meetingTypes}
          workspace={workspace}
        />
      </div>
    </DashboardShell>
  );
}
