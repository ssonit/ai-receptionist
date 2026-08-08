"use client";

import { useTranslations } from "next-intl";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/lib/utils";

/** Typing-style bubble while the guest waits for a staff poll/reply. */
export function StaffReplyPending({ className }: { className?: string }) {
  const t = useTranslations("chat");

  return (
    <div
      aria-live="polite"
      className={cn(
        "mx-auto flex w-full max-w-3xl items-start gap-2 px-4 sm:px-6",
        className,
      )}
      role="status"
    >
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1" aria-hidden>
            <StaffTypingDot delayMs={0} />
            <StaffTypingDot delayMs={160} />
            <StaffTypingDot delayMs={320} />
          </span>
          <Shimmer
            className="text-xs text-zinc-400 [--color-background:theme(colors.zinc.200)]"
            duration={2.4}
          >
            {t("staffPending")}
          </Shimmer>
        </div>
      </div>
    </div>
  );
}

function StaffTypingDot({ delayMs }: { delayMs: number }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-teal-300/80"
      style={{ animationDelay: `${delayMs}ms`, animationDuration: "900ms" }}
    />
  );
}
