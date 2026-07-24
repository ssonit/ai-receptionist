"use server";

import { revalidatePath } from "next/cache";
import {
  MAX_CHAT_SUGGESTIONS,
  type ChatSuggestion,
} from "@/lib/chat-branding";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
  slugAvailableMessage,
  slugIsYoursMessage,
  slugTakenMessage,
  suggestionInvalidMessage,
  suggestionRequiredMessage,
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

function parseSuggestionsFromForm(
  formData: FormData,
): ChatSuggestion[] | { error: string } {
  const raw = String(formData.get("chat_suggestions") ?? "").trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_SUGGESTIONS) };
  }

  if (!Array.isArray(parsed)) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_SUGGESTIONS) };
  }

  if (parsed.length > MAX_CHAT_SUGGESTIONS) {
    return { error: appErrorMessage(APP_ERROR_CODE.SUGGESTION_LIMIT) };
  }

  const items: ChatSuggestion[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object") {
      return { error: suggestionInvalidMessage(i + 1) };
    }
    const label = String((entry as { label?: unknown }).label ?? "").trim();
    const prompt = String((entry as { prompt?: unknown }).prompt ?? "").trim();
    if (!label || !prompt) {
      return { error: suggestionRequiredMessage(i + 1) };
    }
    items.push({ label, prompt });
  }
  return items;
}

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

  const suggestions = parseSuggestionsFromForm(formData);
  if ("error" in suggestions) return { error: suggestions.error };

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
      about: optionalText(formData, "about"),
      business_hours: optionalText(formData, "business_hours"),
      services_summary: optionalText(formData, "services_summary"),
      agent_instructions: optionalText(formData, "agent_instructions"),
      chat_assistant_label: optionalText(formData, "chat_assistant_label"),
      chat_intro: optionalText(formData, "chat_intro"),
      chat_suggestions: suggestions.length > 0 ? suggestions : null,
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: formatDbError(error) };

  revalidatePath("/dashboard/settings");
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
