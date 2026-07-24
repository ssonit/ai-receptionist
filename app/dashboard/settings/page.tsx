import { WorkspaceSettingsForm } from "@/app/_components/workspace-settings-form";
import { DashboardShell } from "@/components/dashboard-shell";
import { parseChatSuggestions } from "@/lib/chat-branding";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { publicBookingPath } from "@/lib/workspace";
import type { WorkspaceSettingsValues } from "@/lib/workspace-settings-types";
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

  const meetingTypes = dashboard.workspaceId
    ? await listWorkspaceMeetingTypes(dashboard.workspaceId).catch(() => [])
    : [];

  let workspace: WorkspaceSettingsValues | null = null;

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, slug, timezone, phone, address, email, website, tagline, about, business_hours, services_summary, agent_instructions, chat_assistant_label, chat_intro, chat_suggestions",
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
        tagline: data.tagline,
        about: data.about,
        businessHours: data.business_hours,
        servicesSummary: data.services_summary,
        agentInstructions: data.agent_instructions,
        chatAssistantLabel: data.chat_assistant_label,
        chatIntro: data.chat_intro,
        chatSuggestions: parseChatSuggestions(data.chat_suggestions),
      };
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
            Workspace profile, chat screen, public booking link, and meeting
            type for AI.
          </p>
        </div>
        <WorkspaceSettingsForm
          meetingTypes={meetingTypes}
          publicBookingUrl={publicBookingUrl}
          workspace={workspace}
        />
      </div>
    </DashboardShell>
  );
}
