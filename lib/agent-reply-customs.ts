/** Workspace-controlled how the agent replies (tone, name, locale, handoff). */

export const AGENT_TONES = ["friendly", "formal", "brief"] as const;
export type AgentTone = (typeof AGENT_TONES)[number];

export const AGENT_REPLY_LOCALES = ["auto", "vi", "en"] as const;
export type AgentReplyLocale = (typeof AGENT_REPLY_LOCALES)[number];

export const DEFAULT_AGENT_TONE: AgentTone = "friendly";
export const DEFAULT_AGENT_REPLY_LOCALE: AgentReplyLocale = "auto";

export const AGENT_TONE_OPTIONS: readonly {
  id: AgentTone;
  label: string;
  blurb: string;
  prompt: string;
}[] = [
  {
    id: "friendly",
    label: "Friendly",
    blurb: "Warm and clear — default for most bookings.",
    prompt: "Be warm, polite, clear, and concise.",
  },
  {
    id: "formal",
    label: "Formal",
    blurb: "Professional wording; still easy to follow.",
    prompt: "Be professional and polite. Prefer complete sentences; stay concise.",
  },
  {
    id: "brief",
    label: "Brief",
    blurb: "Short answers; lead with the slot or fact.",
    prompt: "Be brief. Lead with the answer or next step; avoid long preambles.",
  },
];

export const AGENT_REPLY_LOCALE_OPTIONS: readonly {
  id: AgentReplyLocale;
  label: string;
  blurb: string;
}[] = [
  {
    id: "auto",
    label: "Match guest UI",
    blurb: "Follow the language toggle on the booking page.",
  },
  {
    id: "vi",
    label: "Vietnamese first",
    blurb: "Prefer Vietnamese unless the guest writes in English.",
  },
  {
    id: "en",
    label: "English first",
    blurb: "Prefer English unless the guest writes in Vietnamese.",
  },
];

export function parseAgentTone(raw: unknown): AgentTone | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (AGENT_TONES as readonly string[]).includes(v)
    ? (v as AgentTone)
    : null;
}

export function parseAgentReplyLocale(raw: unknown): AgentReplyLocale | null {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (AGENT_REPLY_LOCALES as readonly string[]).includes(v)
    ? (v as AgentReplyLocale)
    : null;
}

export function resolveAgentTone(raw: unknown): AgentTone {
  return parseAgentTone(raw) ?? DEFAULT_AGENT_TONE;
}

export function resolveAgentReplyLocale(raw: unknown): AgentReplyLocale {
  return parseAgentReplyLocale(raw) ?? DEFAULT_AGENT_REPLY_LOCALE;
}

export function agentTonePrompt(tone: AgentTone): string {
  return (
    AGENT_TONE_OPTIONS.find((o) => o.id === tone)?.prompt ??
    AGENT_TONE_OPTIONS[0].prompt
  );
}
