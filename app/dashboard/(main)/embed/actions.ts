"use server";

import { revalidatePath } from "next/cache";

import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
} from "@/lib/errors";
import { parseEmbedAllowedOriginsInput } from "@/lib/embed";
import {
  ownerWorkspaceErrorMessage,
  requireOwnerWorkspace,
} from "@/lib/workspace-invites";

export type EmbedSecurityState = {
  error?: string;
  success?: boolean;
  origins?: string[];
};

const MAX_EMBED_ORIGINS = 50;

export async function saveEmbedAllowedOrigins(
  _prev: EmbedSecurityState,
  formData: FormData,
): Promise<EmbedSecurityState> {
  const auth = await requireOwnerWorkspace();
  if (!auth.ok) return { error: ownerWorkspaceErrorMessage(auth.error) };

  const raw = String(formData.get("allowedOrigins") ?? "");
  const origins = parseEmbedAllowedOriginsInput(raw);

  if (origins.length > MAX_EMBED_ORIGINS) {
    return { error: appErrorMessage(APP_ERROR_CODE.INVALID_INPUT) };
  }

  const { error } = await auth.supabase
    .from("workspaces")
    .update({ embed_allowed_origins: origins })
    .eq("id", auth.workspaceId);

  if (error) return { error: formatDbError(error) };

  revalidatePath("/dashboard/embed");
  return { success: true, origins };
}
