import { getDashboardUser } from "@/lib/dashboard-user";
import { loadConversationDetail } from "@/lib/conversations-dashboard";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const detail = await loadConversationDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
