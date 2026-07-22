/**
 * Cost-conscious model pool — each provider uses its own API key.
 * DeepSeek → DEEPSEEK_API_KEY
 * Google   → GOOGLE_GENERATIVE_AI_API_KEY
 * Anthropic → ANTHROPIC_API_KEY
 *
 * No Vercel AI Gateway string IDs (those share one gateway key).
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export const MODEL_SLOTS = [
  "deepseekFlash",
  "deepseekPro",
  "geminiFlash",
  "claudeHaiku",
] as const;

export type ModelSlot = (typeof MODEL_SLOTS)[number];

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Native provider model ids (not gateway `provider/model` strings). */
const NATIVE_IDS: Record<ModelSlot, string> = {
  deepseekFlash: "deepseek-chat",
  deepseekPro: "deepseek-reasoner",
  geminiFlash: "gemini-2.5-flash",
  claudeHaiku: "claude-haiku-4-5",
};

function envKeyFor(slot: ModelSlot): string | undefined {
  switch (slot) {
    case "deepseekFlash":
    case "deepseekPro":
      return process.env.DEEPSEEK_API_KEY;
    case "geminiFlash":
      return process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    case "claudeHaiku":
      return process.env.ANTHROPIC_API_KEY;
  }
}

export function hasProviderKey(slot: ModelSlot): boolean {
  const key = envKeyFor(slot)?.trim();
  return Boolean(key && key.length > 0);
}

export function languageModelFor(slot: ModelSlot): LanguageModel {
  switch (slot) {
    case "deepseekFlash":
      return deepseek(NATIVE_IDS.deepseekFlash);
    case "deepseekPro":
      return deepseek(NATIVE_IDS.deepseekPro);
    case "geminiFlash":
      return google(NATIVE_IDS.geminiFlash);
    case "claudeHaiku":
      return anthropic(NATIVE_IDS.claudeHaiku);
  }
}

/** Prefer this slot; if its key is missing, walk the cheap pool for the next configured key. */
export function resolveLanguageModel(preferred: ModelSlot): LanguageModel {
  const order: ModelSlot[] = [
    preferred,
    ...MODEL_SLOTS.filter((slot) => slot !== preferred),
  ];
  for (const slot of order) {
    if (hasProviderKey(slot)) {
      return languageModelFor(slot);
    }
  }
  // Last resort: still return preferred so the provider surfaces a clear missing-key error.
  return languageModelFor(preferred);
}

export function defaultSlot(): ModelSlot {
  const raw = process.env.AGENT_DEFAULT_MODEL?.trim();
  if (raw && (MODEL_SLOTS as readonly string[]).includes(raw)) {
    return raw as ModelSlot;
  }
  return "deepseekFlash";
}

export function forcedSlot(): ModelSlot | null {
  const raw = process.env.AGENT_MODEL?.trim();
  if (raw && (MODEL_SLOTS as readonly string[]).includes(raw)) {
    return raw as ModelSlot;
  }
  return null;
}

const BOOKING_RE =
  /\b(đặt lịch|dat lich|book|booking|appointment|slot|lịch trống|lich trong|availability|check_availability|book_appointment|hẹn|hen|calendar|cal\.com)\b/i;

const COMPLEX_RE =
  /\b(đau|sưng|chảy máu|cấp cứu|emergency|reschedule|đổi lịch|hủy|cancel|bảo hiểm|insurance)\b/i;

/**
 * Pick a cheap slot for this user turn.
 * Escalates only within the approved pool — never Sonnet/Opus.
 */
export function pickSlotForTurn(userText: string): ModelSlot {
  const forced = forcedSlot();
  if (forced) return forced;

  const text = userText.trim();
  if (!text) return defaultSlot();

  if (BOOKING_RE.test(text) || COMPLEX_RE.test(text)) {
    return "deepseekPro";
  }

  return "deepseekFlash";
}

export function extractLatestUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; content?: unknown };
    if (msg?.role !== "user") continue;
    const content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && "text" in part) {
            return String((part as { text?: unknown }).text ?? "");
          }
          return "";
        })
        .join(" ")
        .trim();
    }
  }
  return "";
}
