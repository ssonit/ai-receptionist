"use server";

import { revalidatePath } from "next/cache";
import {
  APP_ERROR_CODE,
  appErrorMessage,
  faqItemInvalidMessage,
  faqItemRequiredMessage,
  formatDbError,
} from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_FAQ_ITEMS,
  type FaqItemInput,
  type FaqSettingsState,
} from "@/lib/workspace-faq-types";

export type { FaqSettingsState } from "@/lib/workspace-faq-types";

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

export async function saveFaqSettings(
  _prev: FaqSettingsState,
  formData: FormData,
): Promise<FaqSettingsState> {
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

  const parsedItems = parseFaqItems(formData);
  if ("error" in parsedItems) {
    return { error: parsedItems.error };
  }

  const { error: deleteError } = await supabase
    .from("workspace_faq_items")
    .delete()
    .eq("workspace_id", workspaceId);

  if (deleteError) {
    return { error: formatDbError(deleteError) };
  }

  if (parsedItems.length > 0) {
    const { error: insertError } = await supabase
      .from("workspace_faq_items")
      .insert(
        parsedItems.map((item, index) => ({
          workspace_id: workspaceId,
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
