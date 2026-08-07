import { createAdminClient } from "@/lib/supabase/admin";

export async function findWorkspaceLead(opts: {
  workspaceId: string;
  sessionId?: string | null;
  /** Stable chat_sessions.id — matches even after a guest "Restart" resets sessionId (eve_session_id). */
  chatSessionId?: string | null;
  phone?: string | null;
}): Promise<{ id: string; status: string } | null> {
  const supabase = createAdminClient();

  const [bySession, byChatSession, byPhone] = await Promise.all([
    opts.sessionId
      ? supabase
          .from("leads")
          .select("id, status")
          .eq("workspace_id", opts.workspaceId)
          .eq("session_id", opts.sessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
    // Catches the case sessionId misses: guest logs a lead, restarts the
    // chat (fresh eve_session_id), then logs again — same chat_session_id
    // throughout, so this still finds the original row instead of creating
    // a duplicate.
    opts.chatSessionId
      ? supabase
          .from("leads")
          .select("id, status")
          .eq("workspace_id", opts.workspaceId)
          .eq("chat_session_id", opts.chatSessionId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
    opts.phone
      ? supabase
          .from("leads")
          .select("id, status")
          .eq("workspace_id", opts.workspaceId)
          .eq("phone", opts.phone)
          .neq("status", "lost")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
  ]);

  return bySession?.data ?? byChatSession?.data ?? byPhone?.data ?? null;
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
  chatSessionId?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const existing = await findWorkspaceLead({
    workspaceId: opts.workspaceId,
    sessionId: opts.sessionId,
    chatSessionId: opts.chatSessionId,
    phone: opts.phone,
  });

  const patch = {
    full_name: opts.fullName,
    phone: opts.phone,
    email: opts.email,
    service: opts.service ?? null,
    notes: opts.notes ?? null,
    session_id: opts.sessionId ?? null,
    chat_session_id: opts.chatSessionId ?? null,
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
