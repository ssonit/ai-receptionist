"use server";

import { revalidatePath } from "next/cache";
import {
  createSchedule,
  getDefaultSchedule,
  updateSchedule,
  withCalApiKey,
  type CalScheduleAvailability,
} from "@/lib/calcom";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
  formatUnknownError,
  slugAvailableMessage,
  slugIsYoursMessage,
  slugTakenMessage,
} from "@/lib/errors";
import { bookingRoute } from "@/lib/routes";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { createAdminClient } from "@/lib/supabase/admin";
import { canonicalizeTimezone } from "@/lib/timezones";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";
import { formatScheduleAsBusinessHours } from "@/lib/workspace-schedule";
import {
  getCalAccessTokenForWorkspace,
  slugifyWorkspaceName,
} from "@/lib/workspace";
import {
  ownerWorkspaceErrorMessage,
  requireOwnerWorkspace,
} from "@/lib/workspace-invites";

export type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

export type WorkingHoursDayInput = {
  day:
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday"
    | "Sunday";
  enabled: boolean;
  startTime: string;
  endTime: string;
};

function toAvailability(days: WorkingHoursDayInput[]): CalScheduleAvailability[] {
  // Group consecutive enabled days sharing the same start/end into one
  // entry — matches how Cal.com's own UI represents "Mon–Fri 9-5" as a
  // single availability object rather than 5 separate ones.
  const enabled = days.filter((d) => d.enabled);
  const groups: CalScheduleAvailability[] = [];
  for (const d of enabled) {
    const last = groups[groups.length - 1];
    if (last && last.startTime === d.startTime && last.endTime === d.endTime) {
      last.days.push(d.day);
    } else {
      groups.push({ days: [d.day], startTime: d.startTime, endTime: d.endTime });
    }
  }
  return groups;
}

export async function saveWorkingHoursAction(
  workspaceId: string,
  input: { days: WorkingHoursDayInput[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return { ok: false, error: ownerWorkspaceErrorMessage(auth.error) };
  }
  if (auth.workspaceId !== workspaceId) {
    return { ok: false, error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const token = await getCalAccessTokenForWorkspace(workspaceId);
    const availability = toAvailability(input.days);

    const schedule = await withCalApiKey(token, async () => {
      const existing = await getDefaultSchedule();
      if (existing) {
        return updateSchedule(existing.id, {
          name: existing.name,
          timeZone: existing.timeZone,
          isDefault: true,
          availability,
        });
      }

      // New Cal account: use the workspace timezone, never a hardcoded UTC.
      const admin = createAdminClient();
      const { data: ws } = await admin
        .from("workspaces")
        .select("timezone")
        .eq("id", workspaceId)
        .maybeSingle();
      const timeZone =
        typeof ws?.timezone === "string" && ws.timezone.trim()
          ? ws.timezone.trim()
          : null;
      if (!timeZone) {
        throw new Error("Workspace timezone is not set");
      }

      return createSchedule({
        name: "Working Hours",
        timeZone,
        isDefault: true,
        availability,
      });
    });

    const businessHours = formatScheduleAsBusinessHours(
      schedule.availability,
      "vi",
    );
    const admin = createAdminClient();
    await admin
      .from("workspaces")
      .update({ business_hours: businessHours })
      .eq("id", workspaceId);

    revalidatePath(DASHBOARD_PATH.settings);
    revalidatePath(DASHBOARD_PATH.agent);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save working hours";
    return { ok: false, error: message };
  }
}

function optionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

/** Workspace identity / contact only — AI fields save via `/dashboard/agent`. */
export async function saveWorkspaceSettings(
  _prev: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  let slug = String(formData.get("slug") ?? "").trim();

  if (!name) return { error: appErrorMessage(APP_ERROR_CODE.NAME_REQUIRED) };
  if (!timezone) {
    return { error: appErrorMessage(APP_ERROR_CODE.TIMEZONE_REQUIRED) };
  }

  const canonicalTimezone = canonicalizeTimezone(timezone);

  if (!slug) slug = slugifyWorkspaceName(name);
  slug = slugifyWorkspaceName(slug);

  const { data: taken } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .neq("id", auth.workspaceId)
    .maybeSingle();

  if (taken) {
    return { error: slugTakenMessage(slug) };
  }

  const guestChangeCutoffMinutes = (() => {
    const raw = formData.get("guestChangeCutoffMinutes");
    if (raw === null || raw === "") return 120;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return 120;
    return Math.max(0, Math.floor(parsed));
  })();

  const { error } = await auth.supabase
    .from("workspaces")
    .update({
      name,
      slug,
      timezone: canonicalTimezone,
      phone: optionalText(formData, "phone"),
      address: optionalText(formData, "address"),
      email: optionalText(formData, "email"),
      website: optionalText(formData, "website"),
      tagline: optionalText(formData, "tagline"),
      guest_cancel_enabled: formData.get("guestCancelEnabled") === "on",
      guest_reschedule_enabled: formData.get("guestRescheduleEnabled") === "on",
      guest_email_required: formData.get("guestEmailRequired") === "on",
      guest_change_cutoff_minutes: guestChangeCutoffMinutes,
      service_mode:
        formData.get("serviceMode") === "online" ? "online" : "onsite",
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: formatDbError(error) };

  revalidatePath(DASHBOARD_PATH.settings);
  revalidatePath(DASHBOARD_PATH.agent);
  revalidatePath(DASHBOARD_PATH.faq);
  revalidatePath(bookingRoute(slug));
  return { success: "Workspace settings saved." };
}

export async function checkWorkspaceSlugAvailable(
  slugRaw: string,
): Promise<{ available: boolean; slug: string; message: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) {
    return {
      available: false,
      slug: "",
      message: ownerWorkspaceErrorMessage(auth.error),
    };
  }

  const slug = slugifyWorkspaceName(slugRaw);
  if (slug.length < 2) {
    return {
      available: false,
      slug,
      message: appErrorMessage(APP_ERROR_CODE.SLUG_TOO_SHORT),
    };
  }

  const { data: self } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("id", auth.workspaceId)
    .eq("slug", slug)
    .maybeSingle();

  if (self) {
    return {
      available: true,
      slug,
      message: slugIsYoursMessage(slug),
    };
  }

  const { data: taken } = await auth.supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .neq("id", auth.workspaceId)
    .maybeSingle();

  if (taken) {
    return {
      available: false,
      slug,
      message: slugTakenMessage(slug),
    };
  }

  return {
    available: true,
    slug,
    message: slugAvailableMessage(slug),
  };
}

/**
 * Reveal the workspace's Cal.com webhook signing secret, generating one on
 * first use. Deliberately owner-triggered rather than generated on page load:
 * the moment a workspace has its own secret it stops accepting payloads signed
 * with the shared `CALCOM_WEBHOOK_SECRET`, so the owner must be standing by to
 * paste the new value into Cal.com.
 */
export async function revealWebhookSecretAction(
  workspaceId: string,
): Promise<{ secret?: string; error?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  if (auth.workspaceId !== workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const { ensureWebhookSecret } = await import("@/lib/workspace");
    const secret = await ensureWebhookSecret(workspaceId);
    revalidatePath(DASHBOARD_PATH.settings);
    return { secret };
  } catch (error) {
    return {
      error: formatUnknownError(error, APP_ERROR_CODE.WEBHOOK_SECRET_FAILED),
    };
  }
}

export async function disconnectMessengerAction(
  workspaceId: string,
): Promise<{ error?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  if (auth.workspaceId !== workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const { clearMessengerTokens } = await import("@/lib/messenger-oauth");
    await clearMessengerTokens(workspaceId);
    revalidatePath(DASHBOARD_PATH.settings);
    return {};
  } catch {
    return { error: appErrorMessage(APP_ERROR_CODE.MESSENGER_DISCONNECT_FAILED) };
  }
}

export async function disconnectZaloAction(
  workspaceId: string,
): Promise<{ error?: string }> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  if (auth.workspaceId !== workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.UNAUTHORIZED) };
  }

  try {
    const { disconnectZalo } = await import("@/lib/zalo-oauth");
    await disconnectZalo(workspaceId);
    revalidatePath(DASHBOARD_PATH.settings);
    return {};
  } catch {
    return { error: appErrorMessage(APP_ERROR_CODE.ZALO_DISCONNECT_FAILED) };
  }
}
