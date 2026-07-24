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
  suggestionInvalidMessage,
  suggestionRequiredMessage,
} from "@/lib/errors";
import {
  parseAgentReplyLocale,
  parseAgentTone,
} from "@/lib/agent-reply-customs";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceSettingsState } from "@/lib/workspace-settings-types";

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

export async function saveWorkspaceAgent(
  _prev: WorkspaceSettingsState,
  formData: FormData,
): Promise<WorkspaceSettingsState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

  const suggestions = parseSuggestionsFromForm(formData);
  if ("error" in suggestions) return { error: suggestions.error };

  const toneRaw = String(formData.get("agent_tone") ?? "").trim();
  const localeRaw = String(formData.get("agent_reply_locale") ?? "").trim();
  const agentTone = toneRaw ? parseAgentTone(toneRaw) : null;
  const agentReplyLocale = localeRaw
    ? parseAgentReplyLocale(localeRaw)
    : null;

  if (toneRaw && !agentTone) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }
  if (localeRaw && !agentReplyLocale) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const { error } = await auth.supabase
    .from("workspaces")
    .update({
      about: optionalText(formData, "about"),
      business_hours: optionalText(formData, "business_hours"),
      services_summary: optionalText(formData, "services_summary"),
      agent_instructions: optionalText(formData, "agent_instructions"),
      agent_display_name: optionalText(formData, "agent_display_name"),
      agent_tone: agentTone,
      agent_reply_locale: agentReplyLocale,
      agent_handoff: optionalText(formData, "agent_handoff"),
      chat_assistant_label: optionalText(formData, "chat_assistant_label"),
      chat_intro: optionalText(formData, "chat_intro"),
      chat_placeholder: optionalText(formData, "chat_placeholder"),
      chat_suggestions: suggestions.length > 0 ? suggestions : null,
    })
    .eq("id", auth.workspaceId);

  if (error) return { error: formatDbError(error) };

  const { data: ws } = await auth.supabase
    .from("workspaces")
    .select("slug")
    .eq("id", auth.workspaceId)
    .maybeSingle();

  revalidatePath("/dashboard/agent");
  revalidatePath("/dashboard/faq");
  revalidatePath("/dashboard/settings");
  if (ws?.slug) revalidatePath(`/b/${ws.slug}`);

  return { success: "AI Agent saved." };
}
