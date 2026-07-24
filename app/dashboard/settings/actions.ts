"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_CHAT_SUGGESTIONS,
  type ChatSuggestion,
} from "@/lib/chat-branding";
import { canonicalizeTimezone } from "@/lib/timezones";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";
import { slugifyWorkspaceName } from "@/lib/workspace";

export type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

async function requireWorkspaceId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to sign in." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.workspace_id) {
    return { error: "Account is not assigned to a workspace." as const };
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
    return { error: "Invalid suggestion data." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Invalid suggestion data." };
  }

  if (parsed.length > MAX_CHAT_SUGGESTIONS) {
    return { error: `Maximum ${MAX_CHAT_SUGGESTIONS} suggestions.` };
  }

  const items: ChatSuggestion[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object") {
      return { error: `Suggestion #${i + 1} is invalid.` };
    }
    const label = String((entry as { label?: unknown }).label ?? "").trim();
    const prompt = String((entry as { prompt?: unknown }).prompt ?? "").trim();
    if (!label || !prompt) {
      return {
        error: `Suggestion #${i + 1}: both button label and message are required.`,
      };
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

  if (!name) return { error: "Workspace name is required." };
  if (!timezone) return { error: "Timezone is required." };

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
    return { error: `Slug “${slug}” is already taken. Choose another.` };
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

  if (error) return { error: error.message };

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
    return { available: false, slug: "", message: auth.error ?? "Authentication error." };
  }

  const slug = slugifyWorkspaceName(slugRaw);
  if (slug.length < 2) {
    return {
      available: false,
      slug,
      message: "Slug needs at least 2 characters (a-z, 0-9).",
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
      message: `“${slug}” is already your slug.`,
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
      message: `“${slug}” is already taken. Choose another.`,
    };
  }

  return {
    available: true,
    slug,
    message: `“${slug}” is available.`,
  };
}
