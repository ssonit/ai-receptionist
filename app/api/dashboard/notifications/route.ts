import { ensureDigestNotifications } from "@/lib/notification-digests";
import {
  countUnreadNotifications,
  listNotifications,
  parseNotificationTypeGroup,
  type NotificationCursor,
} from "@/lib/notifications";
import { getDashboardUser } from "@/lib/dashboard-user";
import { NextResponse } from "next/server";

function parseCursor(raw: string | null): NotificationCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationCursor>;
    if (
      typeof parsed.created_at === "string" &&
      typeof parsed.id === "string" &&
      parsed.created_at &&
      parsed.id
    ) {
      return { created_at: parsed.created_at, id: parsed.id };
    }
  } catch {
    // ignore bad cursor
  }
  return null;
}

export async function GET(request: Request) {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread") === "1";
  const countOnly = searchParams.get("count") === "1";
  const unreadFirst = searchParams.get("unreadFirst") !== "0";
  const group = parseNotificationTypeGroup(searchParams.get("group"));
  const cursor = parseCursor(searchParams.get("cursor"));
  const limit = Math.min(
    Number(searchParams.get("limit") ?? (unreadOnly ? 30 : 10)) || 30,
    100,
  );

  try {
    // Refresh digests + purge read > 30d (debounced writes inside helpers).
    await ensureDigestNotifications();

    if (countOnly) {
      const unread = await countUnreadNotifications();
      return NextResponse.json({ unread });
    }

    const [page, unread] = await Promise.all([
      listNotifications({
        unreadOnly,
        unreadFirst: unreadOnly ? false : unreadFirst,
        limit,
        cursor,
        group,
      }),
      countUnreadNotifications(),
    ]);

    return NextResponse.json({
      items: page.items,
      nextCursor: page.nextCursor,
      unread,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load",
      },
      { status: 500 },
    );
  }
}
