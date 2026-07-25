import type { WorkspaceMeetingTypeRow } from "./workspace-cal";
import type { ChatSuggestion } from "./chat-branding";
import type {
  AgentReplyLocale,
  AgentTone,
} from "./agent-reply-customs";
import type { WorkspaceFaqItem } from "./workspace-faq-types";

/** Shared workspace settings types — import from here instead of redefining. */

export type WorkspaceSettingsState = {
  error?: string;
  success?: string;
};

/** Identity / contact / locale — `/dashboard/settings`. */
export type WorkspaceOpsValues = {
  name: string;
  slug: string | null;
  timezone: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  website: string | null;
  tagline: string | null;
  guestCancelEnabled?: boolean;
  guestRescheduleEnabled?: boolean;
  guestChangeCutoffMinutes?: number;
};

/** AI personality + chat empty screen — `/dashboard/agent`. */
export type WorkspaceAgentValues = {
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
  agentDisplayName: string | null;
  agentTone: AgentTone | null;
  agentReplyLocale: AgentReplyLocale | null;
  agentHandoff: string | null;
  chatAssistantLabel: string | null;
  chatIntro: string | null;
  chatSuggestions: ChatSuggestion[];
  chatPlaceholder: string | null;
};

/** Full workspace row shape (ops + agent). Prefer the split types for new UI. */
export type WorkspaceSettingsValues = WorkspaceOpsValues & {
  about: string | null;
  businessHours: string | null;
  servicesSummary: string | null;
  agentInstructions: string | null;
  agentDisplayName: string | null;
  agentTone: AgentTone | null;
  agentReplyLocale: AgentReplyLocale | null;
  agentHandoff: string | null;
  chatAssistantLabel: string | null;
  chatIntro: string | null;
  chatSuggestions: ChatSuggestion[];
  chatPlaceholder: string | null;
};

export type WorkspaceSettingsFormProps = {
  workspace: WorkspaceOpsValues | null;
  /** Absolute public booking page URL, e.g. https://eve.app/b/slug */
  publicBookingUrl?: string | null;
};

export type WorkspaceAgentStudioProps = {
  workspace: WorkspaceAgentValues | null;
  meetingTypes: WorkspaceMeetingTypeRow[];
  /** Saved FAQ Q&A for persona card (managed on /dashboard/faq). */
  faqItems?: WorkspaceFaqItem[];
};
