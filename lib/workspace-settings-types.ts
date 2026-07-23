import type { WorkspaceMeetingTypeRow } from "./workspace-cal";

/** Shared workspace settings types — import from here instead of redefining. */

export type WorkspaceSettingsState = {
  error?: string;
  success?: string;
};

export type WorkspaceSettingsValues = {
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
};

export type WorkspaceSettingsFormProps = {
  workspace: WorkspaceSettingsValues | null;
  meetingTypes: WorkspaceMeetingTypeRow[];
};
