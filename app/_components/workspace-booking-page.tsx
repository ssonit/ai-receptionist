import Link from "next/link";
import { AgentChat } from "@/app/_components/agent-chat";
import type { PublicBookingWorkspace } from "@/lib/workspace";

type ChatUser = {
  name: string;
  email: string;
  avatar: string;
};

export function WorkspaceBookingPage({
  workspace,
  user,
}: {
  workspace: PublicBookingWorkspace;
  user?: ChatUser | null;
}) {
  const hoursLines = (workspace.businessHours ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="booking-page text-foreground relative flex min-h-dvh flex-col lg:flex-row">
      <aside className="border-border/60 relative flex w-full flex-col justify-between gap-8 overflow-hidden border-b px-6 py-8 lg:w-[min(420px,38vw)] lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(196,149,90,0.18),transparent_55%),radial-gradient(ellipse_at_80%_100%,rgba(45,90,78,0.14),transparent_50%)]"
        />
        <div className="relative z-10 space-y-6">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
            Đặt lịch
          </p>
          <div className="space-y-3">
            <h1 className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">
              {workspace.name}
            </h1>
            {workspace.tagline ? (
              <p className="text-muted-foreground text-base text-pretty sm:text-lg">
                {workspace.tagline}
              </p>
            ) : (
              <p className="text-muted-foreground text-base text-pretty sm:text-lg">
                Chat với trợ lý để hỏi FAQ và đặt lịch ngay.
              </p>
            )}
          </div>

          {workspace.about ? (
            <p className="text-muted-foreground/90 max-w-prose text-sm leading-relaxed text-pretty">
              {workspace.about}
            </p>
          ) : null}

          <div className="space-y-3 text-sm">
            {hoursLines.length > 0 ? (
              <div>
                <p className="text-foreground/80 mb-1 font-medium">Giờ mở cửa</p>
                <ul className="text-muted-foreground space-y-0.5">
                  {hoursLines.map((line) => (
                    <li key={line}>{line.replace(/^-+\s*/, "")}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {workspace.phone ? (
              <p className="text-muted-foreground">
                <span className="text-foreground/80 font-medium">ĐT: </span>
                <a className="underline-offset-2 hover:underline" href={`tel:${workspace.phone}`}>
                  {workspace.phone}
                </a>
              </p>
            ) : null}
            {workspace.address ? (
              <p className="text-muted-foreground text-pretty">
                <span className="text-foreground/80 font-medium">Địa chỉ: </span>
                {workspace.address}
              </p>
            ) : null}
          </div>

          {workspace.faqItems.length > 0 ? (
            <div className="space-y-3">
              <p className="text-foreground/80 text-sm font-medium">Câu hỏi thường gặp</p>
              <ul className="space-y-3">
                {workspace.faqItems.slice(0, 3).map((item) => (
                  <li key={item.question} className="border-border/50 border-l-2 pl-3">
                    <p className="text-sm font-medium">{item.question}</p>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-relaxed">
                      {item.answer.replace(/^-\s*/gm, "").trim()}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <a
            className="bg-foreground text-background inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold transition hover:opacity-90 lg:hidden"
            href="#booking-chat"
          >
            Chat đặt lịch
          </a>
        </div>

        <p className="text-muted-foreground relative z-10 text-xs">
          Trợ lý đặt lịch ·{" "}
          <Link className="underline-offset-2 hover:underline" href="/">
            Eve
          </Link>
        </p>
      </aside>

      <main
        className="relative min-h-[70dvh] flex-1 lg:min-h-dvh"
        id="booking-chat"
      >
        <AgentChat
          embedded
          user={user}
          workspaceName={workspace.name}
          workspaceSlug={workspace.slug}
        />
      </main>
    </div>
  );
}
