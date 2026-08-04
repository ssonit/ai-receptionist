/**
 * Presentation helpers shared by the conversations table and its detail sheet.
 * Lives here rather than in `lib/` because the badge classes are Tailwind, not
 * domain logic.
 */
import type { ConversationOutcome } from "@/lib/conversations-dashboard";

export function outcomeBadgeClass(outcome: ConversationOutcome) {
  switch (outcome) {
    case "booked":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "lead":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "errors":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "abandoned":
      return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function outcomeLabel(outcome: ConversationOutcome) {
  switch (outcome) {
    case "booked":
      return "Booked";
    case "lead":
      return "Lead";
    case "errors":
      return "Tool errors";
    case "abandoned":
      return "Abandoned";
    default:
      return "Empty";
  }
}

/** Set apart from the outcome palette: this is "who answers", not "how it went". */
export const HUMAN_BADGE_CLASS =
  "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400";

export function formatConversationWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
