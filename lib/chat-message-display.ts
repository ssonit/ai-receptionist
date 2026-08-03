import type { EveMessage } from "eve/react";
import type { ChatMessageRow } from "@/lib/chat-sessions";

/** Convert a projected DB row into a display EveMessage (history hydrate). */
export function chatMessageRowToEveMessage(row: ChatMessageRow): EveMessage {
  const raw = row.raw;
  const isHandoff =
    raw !== null &&
    typeof raw === "object" &&
    "kind" in raw &&
    (raw as { kind?: unknown }).kind === "handoff";
  if (raw && typeof raw === "object" && "parts" in raw && Array.isArray((raw as { parts: unknown }).parts)) {
    return {
      id: row.eve_message_id || row.id,
      role: row.role as EveMessage["role"],
      parts: (raw as { parts: EveMessage["parts"] }).parts,
      metadata: isHandoff ? { handoff: true } : undefined,
    } as EveMessage;
  }

  return {
    id: row.eve_message_id || row.id,
    role: row.role as EveMessage["role"],
    parts: [{ type: "text", text: row.content }],
    metadata: isHandoff ? { handoff: true } : undefined,
  } as EveMessage;
}

export function chatMessageRowsToEveMessages(
  rows: readonly ChatMessageRow[],
): EveMessage[] {
  return rows.map(chatMessageRowToEveMessage);
}
