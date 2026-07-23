import { createClient } from "@/lib/supabase/server";
import { mapWorkspaceFaqRecord } from "@/lib/workspace-faq-map";
import {
  WORKSPACE_FAQ_SELECT,
  type WorkspaceFaqQueryRow,
  type WorkspaceFaqRecord,
} from "@/lib/workspace-faq-types";

/** Load workspace + FAQ for the logged-in user's workspace. */
export async function fetchWorkspaceFaqForUser(
  workspaceId: string,
): Promise<WorkspaceFaqRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(WORKSPACE_FAQ_SELECT)
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return mapWorkspaceFaqRecord(data as WorkspaceFaqQueryRow);
}
