import { createClient } from "@/lib/supabase/server";
import type { WorkspaceFaqRecord } from "@/lib/workspace-faq";

function mapRecord(
  workspace: {
    id: string;
    name: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    workspace_faq:
      | {
          opening_hours: string | null;
          services: string | null;
          pricing: string | null;
          preparation: string | null;
          cancel_policy: string | null;
          extra: string | null;
        }
      | {
          opening_hours: string | null;
          services: string | null;
          pricing: string | null;
          preparation: string | null;
          cancel_policy: string | null;
          extra: string | null;
        }[]
      | null;
  },
): WorkspaceFaqRecord {
  const faq = Array.isArray(workspace.workspace_faq)
    ? (workspace.workspace_faq[0] ?? null)
    : workspace.workspace_faq;

  return {
    workspaceId: workspace.id,
    name: workspace.name,
    timezone: workspace.timezone,
    phone: workspace.phone,
    address: workspace.address,
    openingHours: faq?.opening_hours ?? null,
    services: faq?.services ?? null,
    pricing: faq?.pricing ?? null,
    preparation: faq?.preparation ?? null,
    cancelPolicy: faq?.cancel_policy ?? null,
    extra: faq?.extra ?? null,
  };
}

/** Load workspace + FAQ for the logged-in user's workspace. */
export async function fetchWorkspaceFaqForUser(
  workspaceId: string,
): Promise<WorkspaceFaqRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspaces")
    .select(
      "id, name, timezone, phone, address, workspace_faq(opening_hours, services, pricing, preparation, cancel_policy, extra)",
    )
    .eq("id", workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRecord(data);
}
