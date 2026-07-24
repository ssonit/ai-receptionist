/** Shared chat empty-state branding — defaults used when workspace leaves fields empty. */

export type ChatSuggestion = {
  label: string;
  prompt: string;
};

export type ChatBranding = {
  assistantLabel: string;
  intro: string;
  suggestions: ChatSuggestion[];
};

export const DEFAULT_CHAT_ASSISTANT_LABEL = "AI booking assistant";

export const DEFAULT_CHAT_INTRO =
  "Ask FAQs, check open slots, or book an appointment. Not a substitute for a doctor — booking support only.";

export const DEFAULT_CHAT_SUGGESTIONS: ChatSuggestion[] = [
  { label: "Tomorrow afternoon", prompt: "Any openings tomorrow afternoon?" },
  { label: "Business hours", prompt: "What are today's business hours?" },
  { label: "Teeth cleaning", prompt: "I'd like to book a teeth cleaning" },
  { label: "Exam pricing", prompt: "About how much is a general checkup?" },
];

export const MAX_CHAT_SUGGESTIONS = 6;

export const DEFAULT_CHAT_BRANDING: ChatBranding = {
  assistantLabel: DEFAULT_CHAT_ASSISTANT_LABEL,
  intro: DEFAULT_CHAT_INTRO,
  suggestions: DEFAULT_CHAT_SUGGESTIONS,
};

export function parseChatSuggestions(raw: unknown): ChatSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const items: ChatSuggestion[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const label = String((entry as { label?: unknown }).label ?? "").trim();
    const prompt = String((entry as { prompt?: unknown }).prompt ?? "").trim();
    if (!label || !prompt) continue;
    items.push({ label, prompt });
    if (items.length >= MAX_CHAT_SUGGESTIONS) break;
  }
  return items;
}

/** Resolve branding with shared defaults when workspace fields are empty. */
export function resolveChatBranding(input?: {
  assistantLabel?: string | null;
  intro?: string | null;
  suggestions?: unknown;
} | null): ChatBranding {
  const suggestions = parseChatSuggestions(input?.suggestions);
  return {
    assistantLabel:
      input?.assistantLabel?.trim() || DEFAULT_CHAT_ASSISTANT_LABEL,
    intro: input?.intro?.trim() || DEFAULT_CHAT_INTRO,
    suggestions:
      suggestions.length > 0 ? suggestions : DEFAULT_CHAT_SUGGESTIONS,
  };
}
