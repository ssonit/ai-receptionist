import Link from "next/link";
import { WarningCircleIcon } from "@phosphor-icons/react/ssr";

/** Shown when workspace can use the dashboard but public booking is not live yet. */
export function BookingLiveBanner() {
  return (
    <div className="border-b border-amber-500/25 bg-amber-500/10 px-4 py-3 lg:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <WarningCircleIcon
            className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
            weight="fill"
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-amber-950 dark:text-amber-50">
              Your booking page is not live yet
            </p>
            <p className="text-amber-900/80 dark:text-amber-100/75">
              Connect Cal.com and pick a meeting type so guests can book on{" "}
              <span className="font-medium">/b/…</span>
            </p>
          </div>
        </div>
        <Link
          className="inline-flex h-9 shrink-0 items-center rounded-full bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
          href="/dashboard/setup"
        >
          Connect Cal.com
        </Link>
      </div>
    </div>
  );
}
