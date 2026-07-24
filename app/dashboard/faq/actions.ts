"use server";

import { generateObject } from "ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  faqItemInvalidMessage,
  faqItemRequiredMessage,
  formatDbError,
  formatUnknownError,
} from "@/lib/errors";
import {
  defaultSlot,
  hasAnyProviderKey,
  resolveLanguageModel,
} from "@/lib/models";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_FAQ_ITEMS,
  type FaqItemInput,
  type FaqSettingsState,
} from "@/lib/workspace-faq-types";

export type { FaqSettingsState } from "@/lib/workspace-faq-types";

export type GenerateFaqDraftState = {
  error?: string;
  items?: FaqItemInput[];
};

const generatedFaqSchema = z.object({
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        answer: z.string().min(1).max(2000),
      }),
    )
    .min(3)
    .max(8),
});

function parseFaqItems(formData: FormData): FaqItemInput[] | { error: string } {
  const raw = String(formData.get("faq_items") ?? "").trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_FAQ) };
  }

  if (!Array.isArray(parsed)) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_FAQ) };
  }

  if (parsed.length > MAX_FAQ_ITEMS) {
    return { error: appErrorMessage(APP_ERROR_CODE.FAQ_LIMIT) };
  }

  const items: FaqItemInput[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object") {
      return { error: faqItemInvalidMessage(i + 1) };
    }
    const question = String(
      (entry as { question?: unknown }).question ?? "",
    ).trim();
    const answer = String((entry as { answer?: unknown }).answer ?? "").trim();
    if (!question || !answer) {
      return { error: faqItemRequiredMessage(i + 1) };
    }
    items.push({ question, answer });
  }

  return items;
}

async function requireWorkspace() {
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

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  return { supabase, workspaceId: workspaceId as string };
}

export async function saveFaqSettings(
  _prev: FaqSettingsState,
  formData: FormData,
): Promise<FaqSettingsState> {
  const auth = await requireWorkspace();
  if ("error" in auth) return { error: auth.error };

  const parsedItems = parseFaqItems(formData);
  if ("error" in parsedItems) {
    return { error: parsedItems.error };
  }

  const { error: deleteError } = await auth.supabase
    .from("workspace_faq_items")
    .delete()
    .eq("workspace_id", auth.workspaceId);

  if (deleteError) {
    return { error: formatDbError(deleteError) };
  }

  if (parsedItems.length > 0) {
    const { error: insertError } = await auth.supabase
      .from("workspace_faq_items")
      .insert(
        parsedItems.map((item, index) => ({
          workspace_id: auth.workspaceId,
          question: item.question,
          answer: item.answer,
          sort_order: index,
        })),
      );

    if (insertError) {
      return { error: formatDbError(insertError) };
    }
  }

  revalidatePath("/dashboard/faq");
  return {
    success:
      "FAQ saved. The agent will use the new content on the next chat turn.",
  };
}

/**
 * Generate FAQ draft Q&A from workspace profile. Does not write to DB —
 * client merges into the form; user must Save.
 */
export async function generateFaqDraftAction(): Promise<GenerateFaqDraftState> {
  const auth = await requireWorkspace();
  if ("error" in auth) return { error: auth.error };

  if (!hasAnyProviderKey()) {
    return {
      error: appErrorMessage(APP_ERROR_CODE.FAQ_GENERATE_UNAVAILABLE),
    };
  }

  const { data: workspace, error: loadError } = await auth.supabase
    .from("workspaces")
    .select(
      "name, tagline, about, business_hours, services_summary, phone, email, address, website, timezone, agent_instructions",
    )
    .eq("id", auth.workspaceId)
    .maybeSingle();

  if (loadError) {
    return { error: formatDbError(loadError, APP_ERROR_CODE.LOAD_FAILED) };
  }
  if (!workspace) {
    return { error: appErrorMessage(APP_ERROR_CODE.NO_WORKSPACE) };
  }

  const profileBlock = [
    `Name: ${workspace.name}`,
    `Timezone: ${workspace.timezone ?? ""}`,
    `Tagline: ${workspace.tagline ?? ""}`,
    `About: ${workspace.about ?? ""}`,
    `Business hours: ${workspace.business_hours ?? ""}`,
    `Services: ${workspace.services_summary ?? ""}`,
    `Phone: ${workspace.phone ?? ""}`,
    `Email: ${workspace.email ?? ""}`,
    `Address: ${workspace.address ?? ""}`,
    `Website: ${workspace.website ?? ""}`,
    `Agent notes: ${workspace.agent_instructions ?? ""}`,
  ].join("\n");

  try {
    const { object } = await generateObject({
      model: resolveLanguageModel(defaultSlot()),
      schema: generatedFaqSchema,
      prompt: [
        "You write FAQ drafts for a booking assistant used by a small business.",
        "Return 5–7 concise Q&A items guests commonly ask before booking.",
        "Prefer topics: hours, services, pricing (no invented prices), how to book via chat, cancel/reschedule, location/contact.",
        "Use short markdown bullet answers when helpful.",
        "Only use facts from the profile below. If a detail is missing, write a careful placeholder that tells staff to fill Settings — do not invent phone numbers, prices, or hours.",
        "Write in clear English.",
        "",
        "Workspace profile:",
        profileBlock,
      ].join("\n"),
    });

    const items = object.items
      .map((item) => ({
        question: item.question.trim(),
        answer: item.answer.trim(),
      }))
      .filter((item) => item.question && item.answer)
      .slice(0, MAX_FAQ_ITEMS);

    if (items.length === 0) {
      return { error: appErrorMessage(APP_ERROR_CODE.FAQ_GENERATE_FAILED) };
    }

    return { items };
  } catch (error) {
    return {
      error: formatUnknownError(error, APP_ERROR_CODE.FAQ_GENERATE_FAILED),
    };
  }
}
