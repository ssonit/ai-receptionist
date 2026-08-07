import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDashboardUser } from "@/lib/dashboard-user";
import { redirect } from "next/navigation";

export default async function HelpPage() {
  const dashboard = await getDashboardUser();
  if (!dashboard) {
    redirect("/login?next=/dashboard/help");
  }

  const bookingHref = dashboard.bookingPagePath || "/b/eve-pilot";

  const steps = [
    {
      title: "1. Configure workspace",
      body: "Settings: name, timezone, contact, and booking link.",
      href: "/dashboard/settings",
      label: "Settings",
    },
    {
      title: "2. AI Agent",
      body: "Greeting, persona, and the meeting type used for AI booking.",
      href: "/dashboard/agent",
      label: "AI Agent",
    },
    {
      title: "3. Meeting types & FAQ",
      body: "Sync / create meeting types on Cal.com; add Q&A so chat answers correctly.",
      href: "/dashboard/meeting-types",
      label: "Meeting types",
    },
    {
      title: "4. Public booking page",
      body: "Add /b/{slug} to your website or bio. Customer chats → Conversations / Leads / Bookings.",
      href: bookingHref,
      label: "Booking page",
    },
    {
      title: "5. Operations",
      body: "Use Leads & Bookings for follow-up; Analytics / Conversations to evaluate the AI.",
      href: "/dashboard/leads",
      label: "Leads",
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-4 md:gap-8 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="max-w-2xl text-sm text-muted-foreground">
            Quick guide for staff. Use <kbd className="rounded border px-1 text-xs">⌘K</kbd> /{" "}
            <kbd className="rounded border px-1 text-xs">Ctrl+K</kbd> to find pages or leads/bookings.
          </p>
          <div className="mt-4">
            <Button asChild>
              <Link href={bookingHref}>Open booking page</Link>
            </Button>
          </div>
        </div>

        <ul className="mx-auto grid w-full max-w-2xl gap-4 px-4 lg:px-6">
          {steps.map((step) => (
            <li
              key={step.title}
              className="rounded-xl border px-4 py-4"
            >
              <h2 className="text-sm font-semibold tracking-tight">
                {step.title}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">{step.body}</p>
              <Link
                className="mt-3 inline-block text-sm underline underline-offset-4"
                href={step.href}
              >
                {step.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="text-muted-foreground px-4 text-xs lg:px-6">
          <p>
            More:{" "}
            <Link className="underline underline-offset-4" href="/dashboard/faq">
              FAQ
            </Link>
            {" · "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/bookings"
            >
              Bookings
            </Link>
            {" · "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/conversations"
            >
              Conversations
            </Link>
            {" · "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/analytics"
            >
              Analytics
            </Link>
            {" · "}
            <Link
              className="underline underline-offset-4"
              href="/dashboard/account"
            >
              Account
            </Link>
          </p>
        </div>
      </div>
  );
}
