import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-[#070707] text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-size-[64px_64px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export function Container({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-8", className)}>
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto mb-12 max-w-2xl text-center", className)}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-5xl sm:leading-[1.08]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-pretty text-base text-zinc-400 sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

export function PrimaryButton({
  className,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-black transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-zinc-200 active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function GhostButton({
  className,
  children,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-medium text-white transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/10 active:scale-[0.98]",
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export function ProductFrame({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[1.25rem] border border-white/10 bg-[#0c0c0c] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_80px_-40px_rgba(0,0,0,0.8)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        {label ? (
          <span className="ml-3 truncate text-xs text-zinc-500">{label}</span>
        ) : null}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
