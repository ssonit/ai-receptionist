import { containsLikePattern } from "@/lib/sql-like";
import { getDashboardUser } from "@/lib/dashboard-user";
import { createClient } from "@/lib/supabase/server";
import { getSessionWorkspaceId } from "@/lib/workspace-session";
import { NextResponse } from "next/server";

/**
 * Collapse whitespace only. Wildcards are escaped at pattern-build time, so
 * `john_doe@x.com` still matches its literal underscore instead of being
 * blanked out.
 */
function normalizeQuery(q: string) {
  return q.replace(/\s+/g, " ").trim();
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export async function GET(request: Request) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = normalizeQuery(searchParams.get("q") ?? "");
  if (q.length < 2) {
    return NextResponse.json({ leads: [], bookings: [] });
  }

  const supabase = await createClient();
  const workspaceId = await getSessionWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ leads: [], bookings: [] });
  }
  const pattern = containsLikePattern(q);

  const leadSelect = "id, full_name, phone, email, status" as const;
  const bookingSelect =
    "id, guest_name, guest_phone, guest_email, start_time, status" as const;

  const [leadName, leadPhone, leadEmail, bookName, bookPhone, bookEmail] =
    await Promise.all([
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("workspace_id", workspaceId)
        .ilike("full_name", pattern)
        .limit(8),
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("workspace_id", workspaceId)
        .ilike("phone", pattern)
        .limit(8),
      supabase
        .from("leads")
        .select(leadSelect)
        .eq("workspace_id", workspaceId)
        .ilike("email", pattern)
        .limit(8),
      supabase
        .from("bookings")
        .select(bookingSelect)
        .eq("workspace_id", workspaceId)
        .ilike("guest_name", pattern)
        .limit(8),
      supabase
        .from("bookings")
        .select(bookingSelect)
        .eq("workspace_id", workspaceId)
        .ilike("guest_phone", pattern)
        .limit(8),
      supabase
        .from("bookings")
        .select(bookingSelect)
        .eq("workspace_id", workspaceId)
        .ilike("guest_email", pattern)
        .limit(8),
    ]);

  const leads = uniqueById([
    ...(leadName.data ?? []),
    ...(leadPhone.data ?? []),
    ...(leadEmail.data ?? []),
  ]).slice(0, 8);

  const bookings = uniqueById([
    ...(bookName.data ?? []),
    ...(bookPhone.data ?? []),
    ...(bookEmail.data ?? []),
  ]).slice(0, 8);

  return NextResponse.json({ leads, bookings });
}
