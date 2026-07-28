import { defineAgent, defineDynamic } from "eve";
import {
  defaultSlot,
  extractLatestUserText,
  hasAnyProviderKey,
  languageModelFor,
  pickSlotForTurn,
  resolveLanguageModel,
} from "../lib/models";

/**
 * Multi-model, cost-first routing with per-provider API keys.
 * - DeepSeek: DEEPSEEK_API_KEY (flash = deepseek-v4-flash, pro = deepseek-v4-pro)
 * - Google:   GOOGLE_GENERATIVE_AI_API_KEY (gemini-2.5-flash)
 * - Anthropic: ANTHROPIC_API_KEY (claude-haiku-4-5)
 *
 * LanguageModel objects are only returned from step.started (Eve requirement).
 * Prefer resolveLanguageModel so missing keys fail/fallback before the stream hangs.
 */
function fallbackModel() {
  if (hasAnyProviderKey()) {
    return resolveLanguageModel(defaultSlot());
  }
  // Eve requires a LanguageModel object at define time; turn will still fail
  // fast in step.started via resolveLanguageModel when no keys are present.
  return languageModelFor(defaultSlot());
}

export default defineAgent({
  model: defineDynamic({
    fallback: fallbackModel(),
    events: {
      "step.started": (_event, ctx) => {
        const slot = pickSlotForTurn(extractLatestUserText(ctx.messages));
        return {
          model: resolveLanguageModel(slot),
        };
      },
    },
  }),
  reasoning: "low",
  // Compact booking threads sooner so long sessions stay snappy.
  compaction: {
    thresholdPercent: 0.75,
  },
});
