/** Shared FAQ domain types — import from here instead of redefining. */

export const MAX_FAQ_ITEMS = 50;

/** App-facing FAQ Q&A item (camelCase). */
export type WorkspaceFaqItem = {
  id: string;
  question: string;
  answer: string;
  sortOrder: number;
};

/** App-facing workspace profile + FAQ items. */
export type WorkspaceFaqRecord = {
  workspaceId: string;
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
  items: WorkspaceFaqItem[];
};

/** Supabase row shape for `workspace_faq_items`. */
export type WorkspaceFaqItemRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
};

/** Supabase join row: workspace + nested FAQ items. */
export type WorkspaceFaqQueryRow = {
  id: string;
  name: string;
  timezone: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
  tagline: string | null;
  about: string | null;
  business_hours: string | null;
  services_summary: string | null;
  agent_instructions: string | null;
  workspace_faq_items: WorkspaceFaqItemRow[] | WorkspaceFaqItemRow | null;
};

/** Payload for creating/updating FAQ items (no id / sort yet). */
export type FaqItemInput = {
  question: string;
  answer: string;
};

/** Client draft row while editing the FAQ form. */
export type FaqDraftItem = {
  key: string;
  question: string;
  answer: string;
};

export type FaqSettingsState = {
  error?: string;
  success?: string;
};

export type FaqSettingsFormProps = {
  faq: WorkspaceFaqRecord | null;
  previewMarkdown: string;
};

export const WORKSPACE_FAQ_SELECT =
  "id, name, timezone, phone, address, email, website, tagline, about, business_hours, services_summary, agent_instructions, workspace_faq_items(id, question, answer, sort_order)";
