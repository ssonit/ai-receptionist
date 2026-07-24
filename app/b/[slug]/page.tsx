import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceBookingPage } from "@/app/_components/workspace-booking-page";
import { createClient } from "@/lib/supabase/server";
import { readGuestLocale } from "@/lib/read-locale-cookie";
import { getPublicBookingWorkspace } from "@/lib/workspace";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicBookingWorkspace(slug);
  if (!workspace?.setupCompletedAt) {
    return { title: "Book an appointment" };
  }
  return {
    title: `${workspace.name} — Book an appointment`,
    description:
      workspace.tagline?.trim() ||
      `Book an appointment with ${workspace.name}`,
  };
}

export default async function PublicBookingSlugPage({ params }: PageProps) {
  const { slug } = await params;
  const workspace = await getPublicBookingWorkspace(slug);

  if (!workspace) notFound();

  if (!workspace.setupCompletedAt) {
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
    <WorkspaceBookingPage
      initialLocale={await readGuestLocale()}
      user={chatUser}
      workspace={workspace}
    />
  );
}
