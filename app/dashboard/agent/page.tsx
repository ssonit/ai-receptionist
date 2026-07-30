import { WorkspaceAgentStudio } from "@/app/_components/workspace-agent-studio";
import { DashboardShell } from "@/components/dashboard-shell";
import {
  parseAgentReplyLocale,
  parseAgentTone,
} from "@/lib/agent-reply-customs";
import { parseChatSuggestions } from "@/lib/chat-branding";
import { assertOwnerPage } from "@/lib/dashboard-access-server";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaceMeetingTypes } from "@/lib/workspace-cal";
import { fetchWorkspaceFaqForUser } from "@/lib/workspace-faq-server";
import { withWorkspaceAiDefaults } from "@/lib/workspace-ai-defaults";
import type { WorkspaceAgentValues } from "@/lib/workspace-settings-types";

export default async function AgentPage() {
  const dashboard = await assertOwnerPage(DASHBOARD_PATH.agent);

  const meetingTypes = dashboard.workspaceId
    ? await listWorkspaceMeetingTypes(dashboard.workspaceId).catch(() => [])
    : [];

  const faqRecord = dashboard.workspaceId
    ? await fetchWorkspaceFaqForUser(dashboard.workspaceId).catch(() => null)
    : null;

  let workspace: WorkspaceAgentValues | null = null;

  if (dashboard.workspaceId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("workspaces")
      .select(
        "name, timezone, phone, address, email, website, tagline, about, business_hours, services_summary, agent_instructions, agent_display_name, agent_tone, agent_reply_locale, agent_handoff, chat_assistant_label, chat_intro, chat_suggestions, chat_placeholder",
      )
      .eq("id", dashboard.workspaceId)
      .maybeSingle();

    if (data) {
      const filled = withWorkspaceAiDefaults({
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
        agentDisplayName: data.agent_display_name,
        agentTone: parseAgentTone(data.agent_tone),
        agentReplyLocale: parseAgentReplyLocale(data.agent_reply_locale),
        agentHandoff: data.agent_handoff,
        chatAssistantLabel: data.chat_assistant_label,
        chatIntro: data.chat_intro,
        chatSuggestions: parseChatSuggestions(data.chat_suggestions),
        chatPlaceholder: data.chat_placeholder,
      });

      workspace = {
        name: filled.name,
        timezone: filled.timezone,
        phone: filled.phone,
        address: filled.address,
        email: filled.email,
        website: filled.website,
        tagline: filled.tagline,
        about: filled.about,
        businessHours: filled.businessHours,
        servicesSummary: filled.servicesSummary,
        agentInstructions: filled.agentInstructions,
        agentDisplayName: filled.agentDisplayName,
        agentTone: filled.agentTone,
        agentReplyLocale: filled.agentReplyLocale,
        agentHandoff: filled.agentHandoff,
        chatAssistantLabel: filled.chatAssistantLabel,
        chatIntro: filled.chatIntro,
        chatSuggestions: filled.chatSuggestions,
        chatPlaceholder: filled.chatPlaceholder,
      };
    }
  }

  return (
    <DashboardShell title="AI Agent" user={dashboard.navUser} workspaceId={dashboard.workspaceId}>
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="text-sm text-muted-foreground">
            Preview what guests see, set how the agent replies, and pick the
            meeting type used for AI booking. Empty fields start from Eve
            starter defaults — edit and save anytime.
          </p>
        </div>
        <WorkspaceAgentStudio
          faqItems={faqRecord?.items ?? []}
          meetingTypes={meetingTypes}
          workspace={workspace}
        />
      </div>
    </DashboardShell>
  );
}
