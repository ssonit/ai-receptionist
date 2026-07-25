/**
 * One-time manage links from reminder emails (`?mt=` on /b/[slug]).
 */
import { VERIFIED_UNTIL_MS, hashManageLinkToken } from "@/lib/booking-manage-code";
import { createChatSession } from "@/lib/chat-sessions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureVisitorId } from "@/lib/visitor-server";

export type ConsumeManageLinkResult =
  | {
      ok: true;
      chatSessionId: string;
      bookingId: string;
    }
  | {
      ok: false;
      reason:
        | "invalid"
        | "expired"
        | "consumed"
        | "not_found"
        | "workspace_mismatch";
    };

export async function consumeManageLink(input: {
  workspaceId: string;
  token: string;
}): Promise<ConsumeManageLinkResult> {
  const token = input.token.trim();
  if (!token || token.length < 16) {
    return { ok: false, reason: "invalid" };
  }

  const codeHash = hashManageLinkToken(token);
  const supabase = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: row, error } = await supabase
    .from("booking_verifications")
    .select(
      "id, workspace_id, booking_id, expires_at, consumed_at, chat_session_id",
    )
    .eq("channel", "manage_link")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.workspace_id !== input.workspaceId) {
    return { ok: false, reason: "workspace_mismatch" };
  }
  if (row.consumed_at) {
    return { ok: false, reason: "consumed" };
  }
  if (new Date(row.expires_at).getTime() < now) {
    return { ok: false, reason: "expired" };
  }
  if (!row.booking_id) {
    return { ok: false, reason: "invalid" };
  }

  const visitorId = await ensureVisitorId();
  const session = await createChatSession({
    visitorId,
    workspaceId: input.workspaceId,
    title: "Manage appointment",
  });

  const { data: updated, error: updateError } = await supabase
    .from("booking_verifications")
    .update({
      chat_session_id: session.id,
      consumed_at: nowIso,
      verified_until: new Date(now + VERIFIED_UNTIL_MS).toISOString(),
    })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    return { ok: false, reason: "consumed" };
  }

  return {
    ok: true,
    chatSessionId: session.id,
    bookingId: row.booking_id as string,
  };
}
