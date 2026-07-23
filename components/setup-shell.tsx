"use client";

import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

/** Full-bleed dark onboarding chrome — progress lives in SetupWizard. */
export function SetupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-svh overflow-hidden bg-[#0a0a0a] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(251,146,60,0.14),transparent_45%),radial-gradient(ellipse_at_80%_20%,rgba(255,255,255,0.04),transparent_40%)]"
      />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link
          className="text-sm font-semibold tracking-tight text-white"
          href="/"
        >
          Eve
        </Link>
        <Button
          className="text-zinc-400 hover:bg-white/5 hover:text-white"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => {
            void signOut();
          }}
        >
          Đăng xuất
        </Button>
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-col px-5 pb-10 pt-2 sm:px-8">
        {children}
      </main>
    </div>
  );
}
