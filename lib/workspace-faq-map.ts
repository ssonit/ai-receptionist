import type {
  WorkspaceFaqItem,
  WorkspaceFaqItemRow,
  WorkspaceFaqQueryRow,
  WorkspaceFaqRecord,
} from "./workspace-faq-types";
import {
  parseAgentReplyLocale,
  parseAgentTone,
} from "./agent-reply-customs";
import { withWorkspaceAiDefaults } from "./workspace-ai-defaults";

export function mapFaqItems(
  items: WorkspaceFaqItemRow[] | WorkspaceFaqItemRow | null | undefined,
): WorkspaceFaqItem[] {
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((item) => ({
      id: item.id,
      question: item.question,
      answer: item.answer,
      sortOrder: item.sort_order,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function mapWorkspaceFaqRecord(
  workspace: WorkspaceFaqQueryRow,
): WorkspaceFaqRecord {
  const mapped = {
    workspaceId: workspace.id,
    name: workspace.name,
    timezone: workspace.timezone,
    phone: workspace.phone,
    address: workspace.address,
    email: workspace.email,
    website: workspace.website,
    tagline: workspace.tagline,
    about: workspace.about,
    businessHours: workspace.business_hours,
    servicesSummary: workspace.services_summary,
    agentInstructions: workspace.agent_instructions,
    agentDisplayName: workspace.agent_display_name,
    agentTone: parseAgentTone(workspace.agent_tone),
    agentReplyLocale: parseAgentReplyLocale(workspace.agent_reply_locale),
    agentHandoff: workspace.agent_handoff,
    items: mapFaqItems(workspace.workspace_faq_items),
  };

  const filled = withWorkspaceAiDefaults(mapped);
  return {
    ...mapped,
    tagline: filled.tagline,
    about: filled.about,
    businessHours: filled.businessHours,
    servicesSummary: filled.servicesSummary,
    agentInstructions: filled.agentInstructions,
    agentDisplayName: filled.agentDisplayName,
    agentTone: filled.agentTone,
    agentReplyLocale: filled.agentReplyLocale,
    agentHandoff: filled.agentHandoff,
  };
}
