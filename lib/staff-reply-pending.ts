/** Last non-handoff message decides whether the guest is waiting on staff. */
export function isAwaitingStaffReply(
  replyMode: "ai" | "human",
  messages: readonly { role: string; metadata?: { handoff?: unknown } }[],
): boolean {
  if (replyMode !== "human") return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const isHandoff =
      message.role === "system" && message.metadata?.handoff === true;
    if (isHandoff) continue;
    if (message.role === "user") return true;
    if (message.role === "assistant") return false;
  }
  // Human mode with only a handoff notice (or empty) — staff has not spoken yet.
  return true;
}
