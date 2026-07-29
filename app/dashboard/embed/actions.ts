"use server";

import { revalidatePath } from "next/cache";

import {
  APP_ERROR_CODE,
  appErrorMessage,
  formatDbError,
} from "@/lib/errors";
import { parseEmbedAllowedOriginsInput } from "@/lib/embed";
import { createClient } from "@/lib/supabase/server";

export type EmbedSecurityState = {
  error?: string;
  success?: boolean;
  origins?: string[];
};

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

const MAX_EMBED_ORIGINS = 50;

export async function saveEmbedAllowedOrigins(
  _prev: EmbedSecurityState,
  formData: FormData,
): Promise<EmbedSecurityState> {
  const auth = await requireWorkspaceId();
  if ("error" in auth) return { error: auth.error };

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
