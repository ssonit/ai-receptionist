import { defineTool } from "eve/tools";
import { z } from "zod";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { authAttr } from "@/lib/agent-booking-auth";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import { APP_ERROR_CODE, appErrorMessage } from "@/lib/errors";
import { calendarDayInTimeZone, formatSlotForGuest } from "@/lib/guest-timezone";
import { resolveGuestTimeZone } from "@/lib/guest-timezone-resolve";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  resolveWorkspaceIdFromAgentContext,
} from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";
import { addDaysYmd, compareYmd, toYmd, todayYmd } from "../date-context";

export default defineTool({
  description:
    "Check real available appointment slots from the calendar. Always call this before confirming any time to the guest. Never invent slots. Dates must be today or in the future (YYYY-MM-DD). Slots are fetched in the business timezone; when guest timezone is known, each slot includes a dual display string.",
  inputSchema: z.object({
    startDate: z
      .string()
      .describe("Range start as YYYY-MM-DD or ISO datetime — must be today or later"),
    endDate: z
      .string()
      .describe("Range end as YYYY-MM-DD or ISO datetime — must be >= startDate"),
  }),
  async execute({ startDate, endDate }, ctx) {
    const sessionId = ctx.session?.id ?? null;
    const auth =
      ctx.session?.auth?.current ?? ctx.session?.auth?.initiator ?? null;
    const chatSessionId = authAttr(auth?.attributes, "chatSessionId");
    let workspaceIdForLog: string | null = null;
    try {
      const workspaceId = await resolveWorkspaceIdFromAgentContext({
        sessionId,
        auth,
      });
      workspaceIdForLog = workspaceId;
      const aiEvent = await getAiBookingEventType(workspaceId);
      if (!aiEvent) {
        const error =
          "AI booking meeting type is not configured. Go to Dashboard → Setup / Settings to select one.";
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: false,
          error,
          sessionId,
          chatSessionId,
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const ws = await getWorkspaceById(workspaceId);
      const businessTz = ws?.timezone ?? bookingConfig.timezone;
      const serviceMode = ws?.service_mode ?? "onsite";

      const guestResolved = await resolveGuestTimeZone({
        auth,
        chatSessionId,
      });
      const guestTz =
        serviceMode === "online" ? guestResolved.guestTimeZone : null;

      const today = todayYmd(businessTz);
      let start = toYmd(startDate);
      let end = toYmd(endDate);
      const notes: string[] = [];

      if (compareYmd(start, today) < 0) {
        notes.push(
          `Clamped startDate from ${start} to ${today} (past dates are not allowed).`,
        );
        start = today;
      }
      if (compareYmd(end, start) < 0) {
        const next = addDaysYmd(start, 7, businessTz);
        notes.push(
          `Clamped endDate from ${end} to ${next} (end was before start).`,
        );
        end = next;
      }
      const maxEnd = addDaysYmd(start, 60, businessTz);
      if (compareYmd(end, maxEnd) > 0) {
        notes.push(
          `Clamped endDate from ${end} to ${maxEnd} (max 60-day window).`,
        );
        end = maxEnd;
      }

      if (serviceMode === "online" && !guestTz) {
        notes.push(
          "Online workspace: guest timezone unknown. Ask once (or call set_guest_timezone) before confirming a slot. Browser may send x-eve-tz automatically.",
        );
      }

      let apiKey: string;
      try {
        apiKey = await getCalApiKeyForWorkspace(workspaceId);
      } catch {
        const error = appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED_GUEST);
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: false,
          error,
          sessionId,
          chatSessionId,
          workspaceId,
        });
        return { ok: false as const, error };
      }
      const slots = await withCalApiKey(apiKey, () =>
        getAvailableSlots({
          startDate: start,
          endDate: end,
          timeZone: businessTz,
          eventTypeId: aiEvent.calEventTypeId || undefined,
          eventTypeSlug: aiEvent.slug,
          username: aiEvent.username,
        }),
      );
      // Cal.com ignores `start` when an event type enables a rolling window
      // (https://github.com/calcom/cal.com/issues/25405), so filter its response
      // back to the requested range. This is a no-op once Cal fixes the issue.
      const inRange = slots.filter((slot) => {
        const day = calendarDayInTimeZone(slot.start, businessTz);
        return compareYmd(day, start) >= 0 && compareYmd(day, end) <= 0;
      });
      if (inRange.length !== slots.length) {
        notes.push(
          `Filtered ${slots.length - inRange.length} slots outside ${start}..${end} (Cal.com returned days beyond the requested range). Internal note — do not read this to the guest.`,
        );
      }

      type SlotRow = {
        start: string;
        display: string;
        guestDisplay: string | null;
        businessDisplay: string;
      };
      const byDay: Record<string, SlotRow[]> = {};
      const formattedSlots: SlotRow[] = inRange.slice(0, 40).map((slot) => {
        const display = formatSlotForGuest(slot.start, guestTz, businessTz);
        const row: SlotRow = {
          start: slot.start,
          display: display.combined,
          guestDisplay: display.guest,
          businessDisplay: display.business,
        };
        // Key by the business day, not the UTC day — `today` above comes from
        // todayYmd(businessTz), and west-of-UTC evening slots would otherwise
        // land in tomorrow's bucket and read as "no slots today".
        const day = calendarDayInTimeZone(slot.start, businessTz);
        byDay[day] ??= [];
        byDay[day].push(row);
        return row;
      });

      const noticeHours =
        aiEvent.minimumNoticeMinutes != null
          ? Math.max(1, Math.round(aiEvent.minimumNoticeMinutes / 60))
          : bookingConfig.minNoticeHours;
      const todaySlots = byDay[today] ?? [];
      if (start === today && todaySlots.length === 0) {
        notes.push(
          `No remaining slots on ${today}. Calendar enforces ~${noticeHours}h minimum booking notice — same-day late slots may already be closed. Suggest the earliest upcoming slots from other days.`,
        );
      } else if (start === today) {
        notes.push(
          `Minimum booking notice is ~${noticeHours} hours. If the guest asked for a same-day time that is missing here, explain the notice rule and offer the earliest remaining starts.`,
        );
      }

      await logAgentToolEvent({
        toolName: "check_availability",
        ok: true,
        sessionId,
        chatSessionId,
        workspaceId,
        meta: { count: inRange.length, start, end, guestTz },
      });

      return {
        ok: true as const,
        timezone: businessTz,
        businessTimeZone: businessTz,
        guestTimeZone: guestTz,
        serviceMode,
        today,
        eventType: {
          id: aiEvent.calEventTypeId || null,
          slug: aiEvent.slug,
          title: aiEvent.title,
          lengthMinutes: aiEvent.lengthMinutes,
        },
        minNoticeHours: noticeHours,
        startDate: start,
        endDate: end,
        notes: notes.length > 0 ? notes : undefined,
        count: inRange.length,
        slotsByDay: byDay,
        earliestStart: inRange[0]?.start,
        slots: formattedSlots,
        truncated: inRange.length > 40,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch availability";
      if (workspaceIdForLog) {
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: false,
          error: message,
          sessionId,
          chatSessionId,
          workspaceId: workspaceIdForLog,
        });
      }
      return { ok: false as const, error: message };
    }
  },
});
