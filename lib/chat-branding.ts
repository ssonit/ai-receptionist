/** Shared chat empty-state branding — defaults used when workspace leaves fields empty. */

export type ChatSuggestion = {
  label: string;
  prompt: string;
};

export type ChatBranding = {
  assistantLabel: string;
  intro: string;
  suggestions: ChatSuggestion[];
  /** Composer placeholder; empty = use i18n default in the chat UI. */
  placeholder: string;
};

/** VI-first product defaults (aligned with lib/workspace-ai-defaults.ts). */
export const DEFAULT_CHAT_ASSISTANT_LABEL = "Trợ lý đặt lịch AI";

export const DEFAULT_CHAT_INTRO =
  "Hỏi FAQ, xem lịch trống, hoặc đặt hẹn ngay.";

export const DEFAULT_CHAT_SUGGESTIONS: ChatSuggestion[] = [
  { label: "Chiều mai", prompt: "Chiều mai còn chỗ trống không?" },
  { label: "Giờ mở cửa", prompt: "Hôm nay mở cửa lúc mấy giờ?" },
  { label: "Đặt lịch", prompt: "Tôi muốn đặt một lịch hẹn" },
  { label: "Dịch vụ", prompt: "Các bạn có những dịch vụ nào?" },
];

export const MAX_CHAT_SUGGESTIONS = 6;

export const DEFAULT_CHAT_PLACEHOLDER =
  "Hỏi giờ mở cửa, dịch vụ, hoặc đặt lịch…";

export const DEFAULT_CHAT_BRANDING: ChatBranding = {
  assistantLabel: DEFAULT_CHAT_ASSISTANT_LABEL,
  intro: DEFAULT_CHAT_INTRO,
  suggestions: DEFAULT_CHAT_SUGGESTIONS,
  placeholder: DEFAULT_CHAT_PLACEHOLDER,
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
  placeholder?: string | null;
} | null): ChatBranding {
  const suggestions = parseChatSuggestions(input?.suggestions);
  return {
    assistantLabel:
      input?.assistantLabel?.trim() || DEFAULT_CHAT_ASSISTANT_LABEL,
    intro: input?.intro?.trim() || DEFAULT_CHAT_INTRO,
    suggestions:
      suggestions.length > 0 ? suggestions : DEFAULT_CHAT_SUGGESTIONS,
    placeholder: input?.placeholder?.trim() || DEFAULT_CHAT_PLACEHOLDER,
  };
}
