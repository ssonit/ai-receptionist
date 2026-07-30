import { WorkspaceSettingsForm } from "@/app/_components/workspace-settings-form";
import { WorkspaceTeamCard } from "@/app/_components/workspace-team-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { absoluteAppOrigin } from "@/lib/app-origin";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { WORKSPACE_ROLE } from "@/lib/workspace-roles";
import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";
import { WORKSPACE_AI_DEFAULTS } from "@/lib/workspace-ai-defaults";
import {
  listPendingInvites,
  listWorkspaceMembers,
} from "@/lib/workspace-invites";
import type { WorkspaceOpsValues } from "@/lib/workspace-settings-types";

export default async function SettingsPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.settings);

  let workspace: WorkspaceOpsValues | null = null;
  let currentUserId: string | null = null;
  let members: Awaited<ReturnType<typeof listWorkspaceMembers>> = [];
  let pendingInvites: Awaited<ReturnType<typeof listPendingInvites>> = [];

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    currentUserId = user?.id ?? null;
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, slug, timezone, phone, address, email, website, tagline, guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes, service_mode, booking_reminders_enabled, reminder_lead_minutes, reminder_quiet_start, reminder_quiet_end",
      )
      .eq("id", dashboard.workspaceId)
      .maybeSingle();

    if (data) {
      workspace = {
        name: data.name,
        slug: data.slug,
        timezone: data.timezone,
        phone: data.phone,
        address: data.address,
        email: data.email,
        website: data.website,
        tagline: data.tagline?.trim() || WORKSPACE_AI_DEFAULTS.tagline,
        guestCancelEnabled: data.guest_cancel_enabled !== false,
        guestRescheduleEnabled: data.guest_reschedule_enabled !== false,
        guestChangeCutoffMinutes:
          typeof data.guest_change_cutoff_minutes === "number"
            ? data.guest_change_cutoff_minutes
            : 120,
        serviceMode: data.service_mode === "online" ? "online" : "onsite",
        bookingRemindersEnabled: data.booking_reminders_enabled === true,
        reminderLeadMinutes: Array.isArray(data.reminder_lead_minutes)
          ? data.reminder_lead_minutes
          : [1440],
        reminderQuietStart:
          typeof data.reminder_quiet_start === "number"
            ? data.reminder_quiet_start
            : 21,
        reminderQuietEnd:
          typeof data.reminder_quiet_end === "number"
            ? data.reminder_quiet_end
            : 8,
      };
    }

    try {
      members = await listWorkspaceMembers(dashboard.workspaceId);
      if (dashboard.role === WORKSPACE_ROLE.OWNER) {
        pendingInvites = await listPendingInvites(dashboard.workspaceId);
      }
    } catch {
      members = [];
      pendingInvites = [];
    }
  }

  const origin = await absoluteAppOrigin();
  const publicBookingUrl = workspace?.slug
    ? `${origin}${publicBookingPath(workspace.slug)}`
    : null;

  return (
    <DashboardShell
      title="Settings"
      user={dashboard.navUser}
      workspaceId={dashboard.workspaceId}
    >
      <div className="py-4 md:py-6">
        <WorkspaceSettingsForm
          publicBookingUrl={publicBookingUrl}
          workspace={workspace}
        >
          {dashboard.workspaceId && dashboard.role ? (
            <WorkspaceTeamCard
              currentUserId={currentUserId ?? ""}
              inviteOrigin={origin}
              members={members}
              pendingInvites={pendingInvites}
              role={dashboard.role}
            />
          ) : null}
        </WorkspaceSettingsForm>
      </div>
    </DashboardShell>
  );
}
