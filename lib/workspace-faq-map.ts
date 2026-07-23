import type {
  WorkspaceFaqItem,
  WorkspaceFaqItemRow,
  WorkspaceFaqQueryRow,
  WorkspaceFaqRecord,
} from "./workspace-faq-types";

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
  return {
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
    items: mapFaqItems(workspace.workspace_faq_items),
  };
}
