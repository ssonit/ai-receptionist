import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ensureVisitorId } from "@/lib/visitor";
import { resolvePublicWorkspaceId } from "@/lib/workspace";

export async function getChatActor() {
  const visitorId = await ensureVisitorId();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { visitorId, userId: user?.id ?? null };
}

/** Resolve tenant for public chat from ?w= or eve_w cookie. */
export async function getChatWorkspaceId(request?: Request): Promise<string> {
  let slug: string | null = null;
  if (request) {
    try {
      slug = new URL(request.url).searchParams.get("w");
    } catch {
      // ignore
    }
  }
  if (!slug) {
    const jar = await cookies();
    slug = jar.get("eve_w")?.value ?? null;
  }
  return resolvePublicWorkspaceId(slug);
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
