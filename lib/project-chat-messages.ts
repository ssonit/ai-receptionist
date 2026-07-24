import type { EveMessage } from "eve/react";
import type { ProjectedChatMessage } from "@/lib/chat-sessions";

function partText(part: EveMessage["parts"][number]): string {
  if (part.type === "text" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  if (part.type === "reasoning" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}

export function projectEveMessages(
  messages: readonly EveMessage[],
): ProjectedChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "system")
    .map((m) => {
      const text = m.parts.map(partText).filter(Boolean).join("\n").trim();
      const role = m.role as "user" | "assistant" | "system";
      return {
        role,
        content: text || (role === "assistant" ? "(no text)" : ""),
        eve_message_id: m.id,
        raw: { id: m.id, role: m.role, parts: m.parts },
      };
    })
    .filter((m) => m.content.length > 0);
}
