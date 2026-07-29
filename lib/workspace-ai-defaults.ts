import type { ChatSuggestion } from "@/lib/chat-branding";
import type {
  AgentReplyLocale,
  AgentTone,
} from "@/lib/agent-reply-customs";

/**
 * Starter copy for new workspaces (and empty fields).
 * Matches Eve Pilot seed tone — VI-first booking assistant.
 */
export const DEFAULT_WORKSPACE_TAGLINE =
  "Trợ lý đặt lịch 24/7 cho phòng khám / studio";

export const DEFAULT_WORKSPACE_ABOUT =
  "Chúng tôi hỗ trợ khách hỏi FAQ, xem lịch trống và đặt hẹn qua chat AI. Chi tiết dịch vụ / giá xác nhận khi đặt lịch.";

export const DEFAULT_WORKSPACE_BUSINESS_HOURS = [
  "- Thứ 2–Thứ 7: 08:00–20:00",
  "- Chủ nhật: 08:00–12:00",
  "- Nghỉ các ngày lễ lớn",
].join("\n");

export const DEFAULT_WORKSPACE_SERVICES = [
  "- Tư vấn / Consultation (30 phút) — Có thể đặt lịch trực tiếp qua chat.",
  "- Khám / điều trị dài hơn — nhân viên xếp lịch",
].join("\n");

export const DEFAULT_WORKSPACE_AGENT_INSTRUCTIONS = [
  "- Xưng hô lịch sự, ưu tiên slot sớm nếu khách gấp.",
  "- Không cam kết giá cuối nếu chưa xác nhận.",
  "- Nếu ngoài phạm vi booking: đề nghị gọi SĐT workspace.",
].join("\n");

export const DEFAULT_AGENT_DISPLAY_NAME = "Trợ lý đặt lịch";

export const DEFAULT_AGENT_HANDOFF =
  "Nếu khách cần việc ngoài FAQ / đặt lịch: đề nghị gọi SĐT hoặc email workspace. Không hứa kết quả chưa xác nhận được.";

export const DEFAULT_CHAT_ASSISTANT_LABEL_VI = "Trợ lý đặt lịch AI";

export const DEFAULT_CHAT_INTRO_VI =
  "Hỏi FAQ, xem lịch trống, hoặc đặt hẹn ngay.";

export const DEFAULT_CHAT_PLACEHOLDER_VI =
  "Hỏi giờ mở cửa, dịch vụ, hoặc đặt lịch…";

export const DEFAULT_CHAT_SUGGESTIONS_VI: ChatSuggestion[] = [
  {
    label: "Chiều mai",
    prompt: "Chiều mai còn chỗ trống không?",
  },
  {
    label: "Giờ mở cửa",
    prompt: "Hôm nay mở cửa lúc mấy giờ?",
  },
  {
    label: "Đặt lịch",
    prompt: "Tôi muốn đặt một lịch hẹn",
  },
  {
    label: "Dịch vụ",
    prompt: "Các bạn có những dịch vụ nào?",
  },
];

export type WorkspaceAiDefaults = {
  tagline: string;
  about: string;
  businessHours: string;
  servicesSummary: string;
  agentInstructions: string;
  agentDisplayName: string;
  agentTone: AgentTone;
  agentReplyLocale: AgentReplyLocale;
  agentHandoff: string;
  chatAssistantLabel: string;
  chatIntro: string;
  chatPlaceholder: string;
  chatSuggestions: ChatSuggestion[];
};

export const WORKSPACE_AI_DEFAULTS: WorkspaceAiDefaults = {
  tagline: DEFAULT_WORKSPACE_TAGLINE,
  about: DEFAULT_WORKSPACE_ABOUT,
  businessHours: DEFAULT_WORKSPACE_BUSINESS_HOURS,
  servicesSummary: DEFAULT_WORKSPACE_SERVICES,
  agentInstructions: DEFAULT_WORKSPACE_AGENT_INSTRUCTIONS,
  agentDisplayName: DEFAULT_AGENT_DISPLAY_NAME,
  agentTone: "friendly",
  agentReplyLocale: "vi",
  agentHandoff: DEFAULT_AGENT_HANDOFF,
  chatAssistantLabel: DEFAULT_CHAT_ASSISTANT_LABEL_VI,
  chatIntro: DEFAULT_CHAT_INTRO_VI,
  chatPlaceholder: DEFAULT_CHAT_PLACEHOLDER_VI,
  chatSuggestions: DEFAULT_CHAT_SUGGESTIONS_VI,
};

function orDefault(
  value: string | null | undefined,
  fallback: string,
): string {
  const v = value?.trim();
  return v || fallback;
}

/** Fill empty AI / chat profile fields with product defaults (does not invent contact). */
export function withWorkspaceAiDefaults<
  T extends {
    tagline?: string | null;
    about?: string | null;
    businessHours?: string | null;
    servicesSummary?: string | null;
    agentInstructions?: string | null;
    agentDisplayName?: string | null;
    agentTone?: AgentTone | null;
    agentReplyLocale?: AgentReplyLocale | null;
    agentHandoff?: string | null;
    chatAssistantLabel?: string | null;
    chatIntro?: string | null;
    chatPlaceholder?: string | null;
    chatSuggestions?: ChatSuggestion[] | null;
  },
>(row: T): T & WorkspaceAiDefaults {
  const suggestions =
    row.chatSuggestions && row.chatSuggestions.length > 0
      ? row.chatSuggestions
      : WORKSPACE_AI_DEFAULTS.chatSuggestions;

  return {
    ...row,
    tagline: orDefault(row.tagline, WORKSPACE_AI_DEFAULTS.tagline),
    about: orDefault(row.about, WORKSPACE_AI_DEFAULTS.about),
    businessHours: orDefault(
      row.businessHours,
      WORKSPACE_AI_DEFAULTS.businessHours,
    ),
    servicesSummary: orDefault(
      row.servicesSummary,
      WORKSPACE_AI_DEFAULTS.servicesSummary,
    ),
    agentInstructions: orDefault(
      row.agentInstructions,
      WORKSPACE_AI_DEFAULTS.agentInstructions,
    ),
    agentDisplayName: orDefault(
      row.agentDisplayName,
      WORKSPACE_AI_DEFAULTS.agentDisplayName,
    ),
    agentTone: row.agentTone ?? WORKSPACE_AI_DEFAULTS.agentTone,
    agentReplyLocale:
      row.agentReplyLocale ?? WORKSPACE_AI_DEFAULTS.agentReplyLocale,
    agentHandoff: orDefault(
      row.agentHandoff,
      WORKSPACE_AI_DEFAULTS.agentHandoff,
    ),
    chatAssistantLabel: orDefault(
      row.chatAssistantLabel,
      WORKSPACE_AI_DEFAULTS.chatAssistantLabel,
    ),
    chatIntro: orDefault(row.chatIntro, WORKSPACE_AI_DEFAULTS.chatIntro),
    chatPlaceholder: orDefault(
      row.chatPlaceholder,
      WORKSPACE_AI_DEFAULTS.chatPlaceholder,
    ),
    chatSuggestions: suggestions,
  };
}
