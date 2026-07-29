import Link from "next/link";
import type { ReactNode } from "react";
import { EveLogo } from "@/components/eve-logo";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-8">
      <EveLogo
        href="/"
        label="Back to Eve"
        linkClassName="text-zinc-500 hover:text-white"
        showLabel
        size="sm"
      />
      <h1 className="mt-6 text-3xl font-semibold text-white">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {updated}</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-400 [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </main>
  );
}
