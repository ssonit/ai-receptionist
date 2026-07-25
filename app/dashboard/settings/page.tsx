import { WorkspaceSettingsForm } from "@/app/_components/workspace-settings-form";
import { WorkspaceTeamCard } from "@/app/_components/workspace-team-card";
import { DashboardShell } from "@/components/dashboard-shell";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { publicBookingPath } from "@/lib/workspace";
import { WORKSPACE_AI_DEFAULTS } from "@/lib/workspace-ai-defaults";
import {
  listPendingInvites,
  listWorkspaceMembers,
} from "@/lib/workspace-invites";
import type { WorkspaceOpsValues } from "@/lib/workspace-settings-types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function absoluteOrigin(): Promise<string> {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export default async function SettingsPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/settings");
  }

  let workspace: WorkspaceOpsValues | null = null;
  let members: Awaited<ReturnType<typeof listWorkspaceMembers>> = [];
  let pendingInvites: Awaited<ReturnType<typeof listPendingInvites>> = [];

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, slug, timezone, phone, address, email, website, tagline, guest_cancel_enabled, guest_reschedule_enabled, guest_change_cutoff_minutes",
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
      };
    }

    try {
      members = await listWorkspaceMembers(dashboard.workspaceId);
      if (dashboard.role === "owner") {
        pendingInvites = await listPendingInvites(dashboard.workspaceId);
      }
    } catch {
      members = [];
      pendingInvites = [];
    }
  }

  const origin = await absoluteOrigin();
  const publicBookingUrl = workspace?.slug
    ? `${origin}${publicBookingPath(workspace.slug)}`
    : null;

  return (
    <DashboardShell title="Settings" user={dashboard.navUser}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="text-sm text-muted-foreground">
            Workspace identity, contact, language, booking link, and team.
            Configure the AI greeting and persona on AI Agent.
          </p>
        </div>
        <WorkspaceSettingsForm
          publicBookingUrl={publicBookingUrl}
          workspace={workspace}
        />
        {dashboard.workspaceId && dashboard.role ? (
          <div className="mx-auto max-w-2xl space-y-6 px-4 pb-10 lg:px-6">
            <WorkspaceTeamCard
              inviteOrigin={origin}
              members={members}
              pendingInvites={pendingInvites}
              role={dashboard.role}
            />
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}
