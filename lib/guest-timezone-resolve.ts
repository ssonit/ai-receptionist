/**
 * Resolve guest IANA timezone: chat_sessions.guest_timezone > x-eve-tz header.
 */
import { authAttr, type AgentAuthBag } from "@/lib/agent-booking-auth";
import { normalizeIanaTimeZone } from "@/lib/guest-timezone";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveGuestTimeZone(input: {
  auth?: AgentAuthBag;
  chatSessionId?: string | null;
}): Promise<{
  guestTimeZone: string | null;
  source: "session" | "header" | null;
}> {
  const headerTz = normalizeIanaTimeZone(
    authAttr(input.auth?.attributes, "guestTimeZone"),
  );

  const sessionId =
    input.chatSessionId?.trim() ||
    authAttr(input.auth?.attributes, "chatSessionId");

  if (sessionId) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("chat_sessions")
      .select("guest_timezone")
      .eq("id", sessionId)
      .maybeSingle();
    const fromSession = normalizeIanaTimeZone(
      (data?.guest_timezone as string | null) ?? null,
    );
    if (fromSession) {
      return { guestTimeZone: fromSession, source: "session" };
    }
  }

  if (headerTz) {
    return { guestTimeZone: headerTz, source: "header" };
  }

  return { guestTimeZone: null, source: null };
}

export async function setChatSessionGuestTimeZone(input: {
  chatSessionId: string;
  timeZone: string;
}): Promise<boolean> {
  const tz = normalizeIanaTimeZone(input.timeZone);
  if (!tz) return false;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chat_sessions")
    .update({
      guest_timezone: tz,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.chatSessionId);
  return !error;
}
