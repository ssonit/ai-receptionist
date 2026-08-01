import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveGuestBookingActor, toolError } from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  generateOtpDigits,
  hashBookingCode,
  OTP_PER_EMAIL_PER_HOUR,
  OTP_PER_SESSION_PER_HOUR,
  OTP_PER_WORKSPACE_PER_DAY,
  OTP_TTL_MS,
} from "@/lib/booking-manage-code";
import { bookingOtpEmailCopy, sendTransactionalEmail } from "@/lib/email";
import { APP_ERROR_CODE } from "@/lib/errors";
import { escapeLikePattern } from "@/lib/sql-like";
import { createAdminClient } from "@/lib/supabase/admin";

const INVARIANT_OTP_MSG =
  "If that email has an upcoming appointment, a verification code was sent. Enter the 6-digit code next.";

export default defineTool({
  description:
    "Send a 6-digit OTP to an email for booking ownership (tier C). Always returns the same message whether or not a booking exists (anti-enumeration).",
  inputSchema: z.object({
    email: z.string().email(),
    sessionId: z.string().optional(),
  }),
  async execute({ email, sessionId }, ctx) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
    const dest = email.trim().toLowerCase();

    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) return toolError(gate.errorCode);
      const actor = gate.actor;
      if (!actor.chatSessionId) {
        return { ok: true as const, message: INVARIANT_OTP_MSG };
      }

      const supabase = createAdminClient();
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { count: sessionCount } = await supabase
        .from("booking_verifications")
        .select("id", { count: "exact", head: true })
        .eq("chat_session_id", actor.chatSessionId)
        .eq("channel", "email_otp")
        .gte("created_at", hourAgo);

      if ((sessionCount ?? 0) >= OTP_PER_SESSION_PER_HOUR) {
        return toolError(APP_ERROR_CODE.BOOKING_OTP_RATE_LIMITED);
      }

      const { count: emailCount } = await supabase
        .from("booking_verifications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId)
        .eq("channel", "email_otp")
        .eq("destination", dest)
        .gte("created_at", hourAgo);

      if ((emailCount ?? 0) >= OTP_PER_EMAIL_PER_HOUR) {
        return toolError(APP_ERROR_CODE.BOOKING_OTP_RATE_LIMITED);
      }

      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { count: workspaceDayCount } = await supabase
        .from("booking_verifications")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", actor.workspaceId)
        .eq("channel", "email_otp")
        .gte("created_at", dayStart.toISOString());

      if ((workspaceDayCount ?? 0) >= OTP_PER_WORKSPACE_PER_DAY) {
        return toolError(APP_ERROR_CODE.BOOKING_OTP_RATE_LIMITED);
      }

      const nowIso = new Date().toISOString();
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, list_status")
        .eq("workspace_id", actor.workspaceId)
        // Escaped: `dest` is typed by the guest, so unescaped wildcards would
        // bind the OTP to whichever stranger's booking happened to match.
        .ilike("guest_email", escapeLikePattern(dest))
        .gte("start_time", nowIso)
        .limit(5);

      const booking = (bookings ?? []).find(
        (b) => b.list_status !== "cancelled",
      );

      if (booking) {
        const code = generateOtpDigits();
        const codeHash = hashBookingCode(code);
        await supabase.from("booking_verifications").insert({
          workspace_id: actor.workspaceId,
          chat_session_id: actor.chatSessionId,
          booking_id: booking.id,
          channel: "email_otp",
          destination: dest,
          code_hash: codeHash,
          attempts: 0,
          expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        });

        const { data: ws } = await supabase
          .from("workspaces")
          .select("name")
          .eq("id", actor.workspaceId)
          .maybeSingle();

        const localeAttr =
          typeof auth?.attributes?.locale === "string"
            ? auth.attributes.locale
            : "en";
        const locale = localeAttr.startsWith("vi") ? "vi" : "en";
        const copy = bookingOtpEmailCopy({
          code,
          locale,
          workspaceName: ws?.name as string | undefined,
        });
        await sendTransactionalEmail({ to: dest, ...copy, locale });
      }

      await logAgentToolEvent({
        toolName: "request_booking_otp",
        ok: true,
        sessionId: sid,
        workspaceId: actor.workspaceId,
        meta: { hadBooking: Boolean(booking) },
      });

      return { ok: true as const, message: INVARIANT_OTP_MSG };
    } catch (error) {
      console.error("[request_booking_otp]", error);
      return { ok: true as const, message: INVARIANT_OTP_MSG };
    }
  },
});
