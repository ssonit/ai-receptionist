import { defineTool } from "eve/tools";
import { z } from "zod";
import { logAgentToolEvent } from "@/lib/agent-tool-log";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { bookingConfig } from "@/lib/booking-config";
import {
  getCalApiKeyForWorkspace,
  getWorkspaceById,
  resolveWorkspaceIdForAgentSession,
} from "@/lib/workspace";
import { getAiBookingEventType } from "@/lib/workspace-cal";
import { addDaysYmd, compareYmd, toYmd, todayYmd } from "../date-context";

export default defineTool({
  description:
    "Check real available appointment slots from the calendar. Always call this before confirming any time to the guest. Never invent slots. Dates must be today or in the future (YYYY-MM-DD).",
  inputSchema: z.object({
    startDate: z
      .string()
      .describe("Range start as YYYY-MM-DD or ISO datetime — must be today or later"),
    endDate: z
      .string()
      .describe("Range end as YYYY-MM-DD or ISO datetime — must be >= startDate"),
    timeZone: z
      .string()
      .optional()
      .describe(`IANA timezone, default ${bookingConfig.timezone}`),
  }),
  async execute({ startDate, endDate, timeZone }, ctx) {
    const sessionId = ctx.session?.id ?? null;
    try {
      const workspaceId = await resolveWorkspaceIdForAgentSession(sessionId);
      const aiEvent = await getAiBookingEventType(workspaceId);
      if (!aiEvent) {
        const error =
          "Chưa cấu hình meeting type cho AI booking. Vào Dashboard → Setup / Settings để chọn.";
        await logAgentToolEvent({
          toolName: "check_availability",
          ok: false,
          error,
          sessionId,
          workspaceId,
        });
        return { ok: false as const, error };
      }

      const ws = await getWorkspaceById(workspaceId);
      const tz = timeZone ?? ws?.timezone ?? bookingConfig.timezone;
      const today = todayYmd(tz);
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
        const next = addDaysYmd(start, 7, tz);
        notes.push(
          `Clamped endDate from ${end} to ${next} (end was before start).`,
        );
        end = next;
      }
      const maxEnd = addDaysYmd(start, 60, tz);
      if (compareYmd(end, maxEnd) > 0) {
        notes.push(
          `Clamped endDate from ${end} to ${maxEnd} (max 60-day window).`,
        );
        end = maxEnd;
      }

      const apiKey = await getCalApiKeyForWorkspace(workspaceId);
      const slots = await withCalApiKey(apiKey, () =>
        getAvailableSlots({
          startDate: start,
          endDate: end,
          timeZone: tz,
          eventTypeId: aiEvent.calEventTypeId || undefined,
          eventTypeSlug: aiEvent.slug,
          username: aiEvent.username,
        }),
      );

      const byDay: Record<string, string[]> = {};
      for (const slot of slots.slice(0, 40)) {
        const day = slot.start.slice(0, 10);
        byDay[day] ??= [];
        byDay[day].push(slot.start);
      }
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
        workspaceId,
        meta: { count: slots.length, start, end },
      });

      return {
        ok: true as const,
        timezone: tz,
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
        count: slots.length,
        slotsByDay: byDay,
        earliestStart: slots[0]?.start,
        slots: slots.slice(0, 40),
        truncated: slots.length > 40,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch availability";
      await logAgentToolEvent({
        toolName: "check_availability",
        ok: false,
        error: message,
        sessionId,
      });
      return { ok: false as const, error: message };
    }
  },
});
