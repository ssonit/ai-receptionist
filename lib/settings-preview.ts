import type {
  WorkspaceFaqItem,
  WorkspaceFaqRecord,
} from "@/lib/workspace-faq-types";
import { buildBookingFaqMarkdown } from "@/lib/workspace-faq";

/** Draft fields from the Settings form used for live agent preview. */
export type SettingsPreviewDraft = {
  name: string;
  timezone: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  tagline: string;
  about: string;
  businessHours: string;
  servicesSummary: string;
  agentInstructions: string;
  /** Saved FAQ items from the FAQ page (not edited here). */
  faqItems?: WorkspaceFaqItem[];
};

function orNull(value: string): string | null {
  const v = value.trim();
  return v || null;
}

/** Build the same markdown shape the agent gets from booking_faq. */
export function buildSettingsAgentPreview(draft: SettingsPreviewDraft): string {
  const row: WorkspaceFaqRecord = {
    workspaceId: "preview",
    name: draft.name.trim() || "Your workspace",
    timezone: draft.timezone.trim() || "Asia/Ho_Chi_Minh",
    phone: orNull(draft.phone),
    email: orNull(draft.email),
    website: orNull(draft.website),
    address: orNull(draft.address),
    tagline: orNull(draft.tagline),
    about: orNull(draft.about),
    businessHours: orNull(draft.businessHours),
    servicesSummary: orNull(draft.servicesSummary),
    agentInstructions: orNull(draft.agentInstructions),
    agentDisplayName: null,
    agentTone: null,
    agentReplyLocale: null,
    agentHandoff: null,
    items: draft.faqItems ?? [],
  };
  return buildBookingFaqMarkdown(row);
}
