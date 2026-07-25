import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  markBookingVerified,
  resolveGuestBookingActor,
  toolError,
} from "@/lib/agent-booking-auth";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import {
  bookingCodesEqual,
  CODE_ATTEMPT_WINDOW_MS,
  hashBookingCode,
  MAX_CODE_ATTEMPTS,
  normalizeBookingCodeInput,
  OTP_TTL_MS,
  PHONE_LAST4_TTL_MS,
} from "@/lib/booking-manage-code";
import { APP_ERROR_CODE } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Brute-force lockout for manage_code / phone_last4 (no pre-issued row to
 * attach attempts to, unlike email_otp). Tracks a booking_id-null row per
 * (chat_session_id, channel) within a rolling window.
 */
async function checkAttemptLock(
  supabase: AdminClient,
  input: {
    workspaceId: string;
    chatSessionId: string;
    channel: "manage_code" | "phone_last4";
  },
): Promise<{ ok: true } | { ok: false }> {
  const nowIso = new Date().toISOString();
  const { data: tracker } = await supabase
    .from("booking_verifications")
    .select("attempts, expires_at")
    .eq("workspace_id", input.workspaceId)
    .eq("chat_session_id", input.chatSessionId)
    .eq("channel", input.channel)
    .is("booking_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tracker && tracker.expires_at > nowIso && (tracker.attempts ?? 0) >= MAX_CODE_ATTEMPTS) {
    return { ok: false };
  }
  return { ok: true };
}

async function bumpAttemptLock(
  supabase: AdminClient,
  input: {
    workspaceId: string;
    chatSessionId: string;
    channel: "manage_code" | "phone_last4";
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: tracker } = await supabase
    .from("booking_verifications")
    .select("id, attempts, expires_at")
    .eq("workspace_id", input.workspaceId)
    .eq("chat_session_id", input.chatSessionId)
    .eq("channel", input.channel)
    .is("booking_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tracker && tracker.expires_at > nowIso) {
    await supabase
      .from("booking_verifications")
      .update({ attempts: (tracker.attempts ?? 0) + 1 })
      .eq("id", tracker.id);
    return;
  }

  await supabase.from("booking_verifications").insert({
    workspace_id: input.workspaceId,
    chat_session_id: input.chatSessionId,
    booking_id: null,
    channel: input.channel,
    code_hash: "lockout-tracker",
    attempts: 1,
    expires_at: new Date(Date.now() + CODE_ATTEMPT_WINDOW_MS).toISOString(),
  });
}

export default defineTool({
  description:
    "Verify ownership via manage code (6 chars), email OTP (6 digits), or last 4 phone digits for A2 visitor bookings. On success, the booking becomes claimable for 30 minutes in this chat.",
  inputSchema: z.object({
    code: z.string().min(4).max(12),
    channel: z
      .enum(["manage_code", "email_otp", "phone_last4"])
      .describe("Which proof the guest provided"),
    bookingUid: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  async execute({ code, channel, bookingUid, sessionId }, ctx) {
    const sid = sessionId ?? ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;

    try {
      const gate = await resolveGuestBookingActor({ sessionId: sid, auth });
      if (!gate.ok) return toolError(gate.errorCode);
      const actor = gate.actor;
      if (!actor.chatSessionId) {
        return toolError(APP_ERROR_CODE.BOOKING_VERIFY_REQUIRED);
      }

      const normalized = normalizeBookingCodeInput(code);
      const supabase = createAdminClient();
      const nowIso = new Date().toISOString();

      if (channel === "manage_code" || channel === "phone_last4") {
        const lock = await checkAttemptLock(supabase, {
          workspaceId: actor.workspaceId,
          chatSessionId: actor.chatSessionId,
          channel,
        });
        if (!lock.ok) {
          return toolError(APP_ERROR_CODE.BOOKING_CODE_RATE_LIMITED);
        }

        let query = supabase
          .from("bookings")
          .select(
            "id, cal_booking_uid, guest_phone, manage_code_hash, visitor_id, start_time, status, list_status",
          )
          .eq("workspace_id", actor.workspaceId)
          .gte("start_time", nowIso)
          .limit(40);

        if (bookingUid?.trim()) {
          query = query.eq("cal_booking_uid", bookingUid.trim());
        }

        const { data: bookings } = await query;
        const candidates = (bookings ?? []).filter(
          (b) => b.list_status !== "cancelled",
        );

        let matched: (typeof candidates)[0] | null = null;

        if (channel === "manage_code") {
          for (const b of candidates) {
            if (
              b.manage_code_hash &&
              bookingCodesEqual(b.manage_code_hash, normalized)
            ) {
              matched = b;
              break;
            }
          }
        } else {
          // phone_last4 — only among same visitor (A2)
          const last4 = normalized.replace(/\D/g, "").slice(-4);
          if (last4.length !== 4 || !actor.visitorId) {
            return toolError(APP_ERROR_CODE.BOOKING_CODE_INVALID);
          }
          for (const b of candidates) {
            if (b.visitor_id !== actor.visitorId) continue;
            const phoneDigits = String(b.guest_phone ?? "").replace(/\D/g, "");
            if (phoneDigits.endsWith(last4)) {
              matched = b;
              break;
            }
          }
        }

        if (!matched) {
          await bumpAttemptLock(supabase, {
            workspaceId: actor.workspaceId,
            chatSessionId: actor.chatSessionId,
            channel,
          });
          await logAgentToolEvent({
            toolName: "verify_booking_code",
            ok: false,
            error: APP_ERROR_CODE.BOOKING_CODE_INVALID,
            sessionId: sid,
            workspaceId: actor.workspaceId,
          });
          return toolError(APP_ERROR_CODE.BOOKING_CODE_INVALID);
        }

        await markBookingVerified({
          workspaceId: actor.workspaceId,
          chatSessionId: actor.chatSessionId,
          bookingId: matched.id as string,
          channel,
          codeHash: hashBookingCode(normalized),
        });

        await logAgentToolEvent({
          toolName: "verify_booking_code",
          ok: true,
          sessionId: sid,
          workspaceId: actor.workspaceId,
          meta: { channel, bookingId: matched.id },
        });

        return {
          ok: true as const,
          bookingUid: matched.cal_booking_uid,
          verifiedMinutes: 30,
        };
      }

      // email_otp — look up pending verification rows
      const { data: rows } = await supabase
        .from("booking_verifications")
        .select(
          "id, booking_id, code_hash, attempts, expires_at, consumed_at",
        )
        .eq("workspace_id", actor.workspaceId)
        .eq("chat_session_id", actor.chatSessionId)
        .eq("channel", "email_otp")
        .is("consumed_at", null)
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!rows?.length) {
        return toolError(APP_ERROR_CODE.BOOKING_OTP_EXPIRED);
      }

      let hit: (typeof rows)[0] | null = null;
      for (const row of rows) {
        if ((row.attempts ?? 0) >= MAX_CODE_ATTEMPTS) continue;
        if (bookingCodesEqual(row.code_hash as string, normalized)) {
          hit = row;
          break;
        }
        await supabase
          .from("booking_verifications")
          .update({ attempts: (row.attempts ?? 0) + 1 })
          .eq("id", row.id);
      }

      if (!hit?.booking_id) {
        return toolError(APP_ERROR_CODE.BOOKING_CODE_INVALID);
      }

      const until = new Date(Date.now() + OTP_TTL_MS * 3).toISOString();
      await supabase
        .from("booking_verifications")
        .update({
          consumed_at: nowIso,
          verified_until: new Date(
            Date.now() + PHONE_LAST4_TTL_MS,
          ).toISOString(),
        })
        .eq("id", hit.id);

      const { data: booking } = await supabase
        .from("bookings")
        .select("cal_booking_uid")
        .eq("id", hit.booking_id)
        .maybeSingle();

      await logAgentToolEvent({
        toolName: "verify_booking_code",
        ok: true,
        sessionId: sid,
        workspaceId: actor.workspaceId,
        meta: { channel: "email_otp" },
      });

      return {
        ok: true as const,
        bookingUid: booking?.cal_booking_uid ?? null,
        verifiedMinutes: 30,
        verifiedUntil: until,
      };
    } catch (error) {
      console.error("[verify_booking_code]", error);
      return toolError(APP_ERROR_CODE.BOOKING_CODE_INVALID);
    }
  },
});
