import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceBookingPage } from "@/app/_components/workspace-booking-page";
import { StripManageLinkParam } from "@/components/strip-manage-link-param";
import { consumeManageLink } from "@/lib/manage-link";
import { createClient } from "@/lib/supabase/server";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import { getPublicBookingWorkspace } from "@/lib/workspace";
import { ANALYTICS_EVENT } from "@/lib/analytics-events";
import { trackServer } from "@/lib/analytics-server";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mt?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicBookingWorkspace(slug);
  if (!workspace?.bookingLive) {
    return { title: "Book an appointment" };
  }
  return {
    title: `${workspace.name} — Book an appointment`,
    description:
      workspace.tagline?.trim() ||
      `Book an appointment with ${workspace.name}`,
  };
}

export default async function PublicBookingSlugPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { mt } = await searchParams;
  const workspace = await getPublicBookingWorkspace(slug);

  if (!workspace) notFound();

  if (!workspace.bookingLive) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-serif text-3xl tracking-tight">{workspace.name}</h1>
        <p className="text-muted-foreground max-w-md text-pretty">
          Booking page isn&apos;t ready yet. The workspace owner is finishing setup.
        </p>
        <Link className="text-sm underline underline-offset-4" href="/">
          Back to Eve
        </Link>
      </div>
    );
  }

  const locale = await readGuestLocale();
  let preferChatSessionId: string | null = null;
  let manageLinkNotice: string | null = null;
  const mtToken = mt?.trim() || "";

  if (mtToken) {
    const result = await consumeManageLink({
      workspaceId: workspace.id,
      token: mtToken,
    });
    if (result.ok) {
      preferChatSessionId = result.chatSessionId;
      manageLinkNotice =
        locale === "vi"
          ? "Đã xác minh lịch hẹn. Bạn có thể nói «đổi lịch» hoặc «hủy lịch»."
          : "Appointment verified. You can ask to reschedule or cancel.";
      await trackServer(ANALYTICS_EVENT.REMINDER_LINK_OPENED, workspace.id, {
        workspaceId: workspace.id,
      });
    } else if (result.reason === "consumed" || result.reason === "expired") {
      manageLinkNotice =
        locale === "vi"
          ? "Liên kết quản lý đã hết hạn hoặc đã dùng. Hãy xác minh lại trong chat."
          : "This manage link has expired or already been used. Verify again in chat.";
    } else {
      manageLinkNotice =
        locale === "vi"
          ? "Liên kết quản lý không hợp lệ."
          : "This manage link is invalid.";
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
    : { data: null };

  const chatUser = user
    ? {
        name: profile?.full_name || user.email?.split("@")[0] || "Account",
        email: profile?.email || user.email || "",
        avatar: "",
      }
    : null;

  return (
    <>
      <StripManageLinkParam enabled={Boolean(mtToken)} />
      <WorkspaceBookingPage
        initialLocale={locale}
        manageLinkNotice={manageLinkNotice}
        preferChatSessionId={preferChatSessionId}
        user={chatUser}
        workspace={workspace}
      />
    </>
  );
}
