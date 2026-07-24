"use server";

import { revalidatePath } from "next/cache";
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
    return { error: "Invalid FAQ data." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Invalid FAQ data." };
  }

  if (parsed.length > MAX_FAQ_ITEMS) {
    return { error: `Maximum ${MAX_FAQ_ITEMS} FAQ items per workspace.` };
  }

  const items: FaqItemInput[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object") {
      return { error: `FAQ #${i + 1} is invalid.` };
    }
    const question = String(
      (entry as { question?: unknown }).question ?? "",
    ).trim();
    const answer = String((entry as { answer?: unknown }).answer ?? "").trim();
    if (!question || !answer) {
      return { error: `FAQ #${i + 1}: question and answer are both required.` };
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
    return { error: "You need to sign in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return { error: "Account is not assigned to a workspace." };
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
    return { error: deleteError.message };
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
      return { error: insertError.message };
    }
  }

  revalidatePath("/dashboard/faq");
  return {
    success: "FAQ saved. The agent will use the new content on the next chat turn.",
  };
}
