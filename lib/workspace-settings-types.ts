import type { WorkspaceMeetingTypeRow } from "./workspace-cal";
import type { ChatSuggestion } from "./chat-branding";

/** Shared workspace settings types — import from here instead of redefining. */

export type WorkspaceSettingsState = {
  error?: string;
  success?: string;
};

export type WorkspaceSettingsValues = {
  name: string;
  slug: string | null;
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
  chatAssistantLabel: string | null;
  chatIntro: string | null;
  chatSuggestions: ChatSuggestion[];
};

export type WorkspaceSettingsFormProps = {
  workspace: WorkspaceSettingsValues | null;
  meetingTypes: WorkspaceMeetingTypeRow[];
  /** Absolute public booking page URL, e.g. https://eve.app/b/slug */
  publicBookingUrl?: string | null;
};
