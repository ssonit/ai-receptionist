import { clearSessionVerifications } from "@/lib/agent-booking-auth";
import {
  chatErrorResponse,
  getChatActor,
  getChatWorkspaceId,
  jsonError,
} from "@/lib/chat-api";
import { getChatSessionForActor } from "@/lib/chat-sessions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isVisitorId,
  VISITOR_COOKIE,
  visitorCookieOptions,
} from "@/lib/visitor";
import { NextResponse } from "next/server";

/**
 * "Not you? End session" — rotate visitor cookie, close owned sessions,
 * clear verifies, and revoke A1 (clear bookings.chat_session_id).
 */
export async function POST(request: Request) {
  try {
    const { visitorId, userId } = await getChatActor(request);
    // Privacy action — must keep working even when the workspace is unpaid.
    const workspaceId = await getChatWorkspaceId(request, {
      skipSubscriptionCheck: true,
    });
    const body = (await request.json().catch(() => ({}))) as {
      chatSessionId?: string;
    };

    const supabase = createAdminClient();
    const revokeIds = new Set<string>();

    const requestedId = body.chatSessionId?.trim();
    if (requestedId) {
      const owned = await getChatSessionForActor({
        id: requestedId,
        visitorId,
        userId,
        workspaceId,
      });
      if (owned) revokeIds.add(owned.id);
    }

    if (visitorId) {
      const { data: openSessions } = await supabase
        .from("chat_sessions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("visitor_id", visitorId)
        .eq("status", "active");
      for (const row of openSessions ?? []) {
        if (row.id) revokeIds.add(row.id as string);
      }
    }

    const ids = [...revokeIds];
    if (ids.length > 0) {
      for (const id of ids) {
        await clearSessionVerifications(id);
      }

      const nowIso = new Date().toISOString();
      await supabase
        .from("chat_sessions")
        .update({
          visitor_id: null,
          status: "closed",
          updated_at: nowIso,
        })
        .in("id", ids);

      // Revoke A1 even if someone still knows the old session UUID
      await supabase
        .from("bookings")
        .update({ chat_session_id: null })
        .in("chat_session_id", ids);
    }

    const newVisitorId = crypto.randomUUID();
    if (!isVisitorId(newVisitorId)) {
      return jsonError("Could not rotate visitor", 500);
    }

    const res = NextResponse.json({ ok: true, visitorId: newVisitorId });
    res.cookies.set(VISITOR_COOKIE, newVisitorId, visitorCookieOptions());
    return res;
  } catch (error) {
    return chatErrorResponse(error, "Failed to end session");
  }
}
