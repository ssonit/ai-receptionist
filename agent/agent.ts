import { defineAgent, defineDynamic } from "eve";
import {
  defaultSlot,
  extractLatestUserText,
  languageModelFor,
  pickSlotForTurn,
  resolveLanguageModel,
} from "../lib/models";

/**
 * Multi-model, cost-first routing with per-provider API keys.
 * - DeepSeek: DEEPSEEK_API_KEY (flash = deepseek-chat, pro = deepseek-reasoner)
 * - Google:   GOOGLE_GENERATIVE_AI_API_KEY (gemini-2.5-flash)
 * - Anthropic: ANTHROPIC_API_KEY (claude-haiku-4-5)
 *
 * LanguageModel objects are only returned from step.started (Eve requirement).
 */
export default defineAgent({
  model: defineDynamic({
    fallback: languageModelFor(defaultSlot()),
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
