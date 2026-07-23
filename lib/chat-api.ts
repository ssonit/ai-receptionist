import { createClient } from "@/lib/supabase/server";
import { ensureVisitorId } from "@/lib/visitor";

export async function getChatActor() {
  const visitorId = await ensureVisitorId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { visitorId, userId: user?.id ?? null };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
