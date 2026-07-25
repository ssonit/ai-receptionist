"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
  slugAvailableMessage,
  slugIsYoursMessage,
  slugTakenMessage,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { canonicalizeTimezone } from "@/lib/timezones";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";
import { slugifyWorkspaceName } from "@/lib/workspace";

export type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

async function requireWorkspaceId() {
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

  return { supabase, workspaceId: profile.workspace_id as string };
}

function optionalText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim() || null;
}

/** Workspace identity / contact only — AI fields save via `/dashboard/agent`. */
export async function saveWorkspaceSettings(
  _prev: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

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
      guest_change_cutoff_minutes: (() => {
        const raw = formData.get("guestChangeCutoffMinutes");
        if (raw === null || raw === "") return 120;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return 120;
        return Math.max(0, Math.floor(parsed));
      })(),
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: formatDbError(error) };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/agent");
  revalidatePath("/dashboard/faq");
  revalidatePath(`/b/${slug}`);
  return { success: "Workspace settings saved." };
}

export async function checkWorkspaceSlugAvailable(
  slugRaw: string,
): Promise<{ available: boolean; slug: string; message: string }> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) {
    return {
      available: false,
      slug: "",
      message: auth.error ?? appErrorMessage(APP_ERROR_CODE.SIGN_IN_REQUIRED),
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
