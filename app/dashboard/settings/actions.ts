"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
  formatUnknownError,
  reminderLeadTooShortMessage,
  slugAvailableMessage,
  slugIsYoursMessage,
  slugTakenMessage,
} from "@/lib/errors";
import { minLongLeadMinutes } from "@/lib/booking-reminders";
import { bookingRoute } from "@/lib/routes";
import { DASHBOARD_PATH } from "@/lib/dashboard-access";
import { canonicalizeTimezone } from "@/lib/timezones";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";
import { slugifyWorkspaceName } from "@/lib/workspace";
import {
  ownerWorkspaceErrorMessage,
  requireOwnerWorkspace,
} from "@/lib/workspace-invites";

export type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

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

  const bookingRemindersEnabled =
    formData.get("bookingRemindersEnabled") === "on";

  const reminderLeadMinutesRaw = String(
    formData.get("reminderLeadMinutes") ?? "",
  ).trim();
  const reminderLeadMinutesInRange = reminderLeadMinutesRaw
    ? reminderLeadMinutesRaw
        .split(/[,\s]+/)
        .map((p) => Math.floor(Number(p)))
        .filter((n) => Number.isFinite(n) && n >= 60 && n <= 10080)
    : [];
  const reminderLeadMinutes =
    reminderLeadMinutesInRange.length > 0 ? reminderLeadMinutesInRange : [1440];

  // A lead too close to the cancel/reschedule cutoff collapses into the
  // short-lead slot and is silently dropped at send time — reject here
  // instead, so the owner sees why their value "didn't stick".
  if (bookingRemindersEnabled) {
    const minLead = minLongLeadMinutes(guestChangeCutoffMinutes);
    if (reminderLeadMinutes.some((n) => n <= minLead)) {
      return { error: reminderLeadTooShortMessage(minLead) };
    }
  }

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
      guest_change_cutoff_minutes: guestChangeCutoffMinutes,
      service_mode:
        formData.get("serviceMode") === "online" ? "online" : "onsite",
      booking_reminders_enabled: bookingRemindersEnabled,
      reminder_lead_minutes: reminderLeadMinutes,
      reminder_quiet_start: (() => {
        const parsed = Number(formData.get("reminderQuietStart"));
        if (!Number.isFinite(parsed)) return 21;
        return Math.min(23, Math.max(0, Math.floor(parsed)));
      })(),
      reminder_quiet_end: (() => {
        const parsed = Number(formData.get("reminderQuietEnd"));
        if (!Number.isFinite(parsed)) return 8;
        return Math.min(23, Math.max(0, Math.floor(parsed)));
      })(),
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
