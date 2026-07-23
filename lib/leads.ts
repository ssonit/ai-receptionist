import { createAdminClient } from "@/lib/supabase/admin";

export async function findWorkspaceLead(opts: {
  workspaceId: string;
  sessionId?: string | null;
  phone?: string | null;
}): Promise<{ id: string; status: string } | null> {
  const supabase = createAdminClient();

  if (opts.sessionId) {
    const { data } = await supabase
      .from("leads")
      .select("id, status")
      .eq("workspace_id", opts.workspaceId)
      .eq("session_id", opts.sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (opts.phone) {
    const { data } = await supabase
      .from("leads")
      .select("id, status")
      .eq("workspace_id", opts.workspaceId)
      .eq("phone", opts.phone)
      .neq("status", "lost")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

/** Mark an existing lead as booked, or insert a booked lead if none exists. */
export async function upsertLeadAsBooked(opts: {
  workspaceId: string;
  fullName: string;
  phone: string;
  email: string;
  service?: string | null;
  notes?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const existing = await findWorkspaceLead({
    workspaceId: opts.workspaceId,
    sessionId: opts.sessionId,
    phone: opts.phone,
  });

  const patch = {
    full_name: opts.fullName,
    phone: opts.phone,
    email: opts.email,
    service: opts.service ?? null,
    notes: opts.notes ?? null,
    session_id: opts.sessionId ?? null,
    status: "booked" as const,
  };

  if (existing) {
    const { error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("leads").insert({
    workspace_id: opts.workspaceId,
    ...patch,
  });
  if (error) throw new Error(error.message);
}
