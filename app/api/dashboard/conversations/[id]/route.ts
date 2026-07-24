import { getDashboardUser } from "@/lib/dashboard-user";
import { loadConversationDetail } from "@/lib/conversations-dashboard";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const detail = await loadConversationDetail(id, {
    before,
    limit: Number.isFinite(limit) && limit && limit > 0 ? limit : undefined,
  });
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
