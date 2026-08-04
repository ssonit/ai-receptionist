"use server";

import { revalidatePath } from "next/cache";
import { compareYmd, todayYmd } from "@/agent/date-context";
import { createWorkspaceBooking } from "@/lib/booking-create";
import { getAvailableSlots, withCalApiKey } from "@/lib/calcom";
import { getDashboardUser } from "@/lib/dashboard-user";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatUnknownError,
} from "@/lib/errors";
import { formatSlotForGuest } from "@/lib/guest-timezone";
import { syncCalBookingsToSupabase } from "@/lib/sync-cal-bookings";
import { createClient } from "@/lib/supabase/server";
import { getCalApiKeyForWorkspace, getWorkspaceById } from "@/lib/workspace";
import {
  eventRefFromMeetingType,
  getWorkspaceEventTypeById,
} from "@/lib/workspace-cal";

export type SyncBookingsState = {
  error?: string;
  success?: string;
};

export async function syncBookingsAction(): Promise<SyncBookingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  const result = await syncCalBookingsToSupabase(profile.workspace_id);

  if (result.error && !result.skipped) {
    return {
      error: formatUnknownError(
        new Error(result.error),
        APP_ERROR_CODE.SYNC_FAILED,
      ),
    };
  }

  if (result.skipped) {
    return { error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notifications");

  const windowHint = result.scopeLabel ? ` (${result.scopeLabel})` : "";
  const truncWarn = result.truncated
    ? " — some filters were truncated by maxPages; increase BOOKING_SYNC_MAX_PAGES."
    : "";
  const changeHint =
    (result.cancelledNotified ?? 0) + (result.rescheduledNotified ?? 0) > 0
      ? ` · ${result.cancelledNotified ?? 0} cancelled, ${result.rescheduledNotified ?? 0} rescheduled → notifications.`
      : "";

  return {
    success:
      result.synced > 0
        ? `Synced ${result.synced} booking${result.synced === 1 ? "" : "s"} from Cal.com${windowHint}.${truncWarn}${changeHint}`
        : `No bookings in sync scope${windowHint}.${truncWarn}${changeHint}`,
  };
}

/**
 * Workspace and identity come from the server session only — the
 * meetingTypeId argument each action below takes is a lookup key, scoped by
 * workspace on every read, never an authority.
 */
async function requireStaff(): Promise<
  | { error: string }
  | { workspaceId: string; staffUserId: string; timeZone: string }
> {
  const user = await getDashboardUser();
  if (!user) return { error: appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED) };
  if (!user.workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }
  const ws = await getWorkspaceById(user.workspaceId);
  return {
    workspaceId: user.workspaceId,
    staffUserId: user.userId,
    timeZone: ws?.timezone ?? "UTC",
  };
}

async function resolveEventRef(workspaceId: string, meetingTypeId: string) {
  const [meetingType, ws] = await Promise.all([
    getWorkspaceEventTypeById(workspaceId, meetingTypeId),
    getWorkspaceById(workspaceId),
  ]);
  if (!meetingType) return null;
  const username = ws?.cal_username || "";
  return {
    meetingType,
    eventRef: eventRefFromMeetingType(meetingType, username),
  };
}

export async function getAvailableSlotsAction(input: {
  meetingTypeId: string;
  date: string;
}): Promise<
  | { ok: true; slots: { start: string; display: string }[] }
  | { ok: false; error: string }
> {
  const ctx = await requireStaff();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (compareYmd(input.date, todayYmd(ctx.timeZone)) < 0) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const resolved = await resolveEventRef(ctx.workspaceId, input.meetingTypeId);
  if (!resolved) {
    return {
      ok: false,
      error: appErrorMessage(APP_ERROR_CODE.MEETING_TYPE_NOT_FOUND),
    };
  }

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(ctx.workspaceId);
  } catch {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  try {
    const rawSlots = await withCalApiKey(apiKey, () =>
      getAvailableSlots({
        startDate: input.date,
        endDate: input.date,
        timeZone: ctx.timeZone,
        ...resolved.eventRef,
      }),
    );
    const slots = rawSlots.map((slot) => ({
      start: slot.start,
      display: formatSlotForGuest(slot.start, null, ctx.timeZone).business,
    }));
    return { ok: true, slots };
  } catch (error) {
    console.error("[bookings] getAvailableSlotsAction failed", error);
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
  }
}

export async function createManualBookingAction(input: {
  meetingTypeId: string;
  start: string;
  guestName: string;
  phone: string;
  email: string;
  notes?: string;
}): Promise<{ ok: true; bookingUid: string } | { ok: false; error: string }> {
  const ctx = await requireStaff();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  if (!input.guestName.trim() || !input.phone.trim() || !input.email.trim()) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const resolved = await resolveEventRef(ctx.workspaceId, input.meetingTypeId);
  if (!resolved) {
    return {
      ok: false,
      error: appErrorMessage(APP_ERROR_CODE.MEETING_TYPE_NOT_FOUND),
    };
  }

  let apiKey: string;
  try {
    apiKey = await getCalApiKeyForWorkspace(ctx.workspaceId);
  } catch {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.CAL_NOT_CONFIGURED) };
  }

  try {
    const result = await withCalApiKey(apiKey, () =>
      createWorkspaceBooking({
        workspaceId: ctx.workspaceId,
        eventRef: resolved.eventRef,
        eventTitle: resolved.meetingType.title,
        start: input.start,
        guestName: input.guestName.trim(),
        phone: input.phone.trim(),
        email: input.email.trim(),
        timeZone: ctx.timeZone,
        notes: input.notes,
        source: "staff",
        staffUserId: ctx.staffUserId,
      }),
    );
    if (!result.ok) {
      console.error("[bookings] createManualBookingAction failed", result.error);
      return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
    }
    return { ok: true, bookingUid: result.booking.uid };
  } catch (error) {
    console.error("[bookings] createManualBookingAction failed", error);
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.BOOKING_CREATE_FAILED) };
  }
}
