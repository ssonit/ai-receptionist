"use client";

import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";

type LenisProviderProps = {
  readonly children: ReactNode;
};

/**
 * Smooth scroll for the landing page.
 * Uses Lenis `autoRaf` — do NOT multiply rAF time by 1000 (that is only for
 * GSAP's ticker, which reports seconds; native rAF already passes ms).
 */
export function LenisProvider({ children }: LenisProviderProps) {
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;

    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.1,
      smoothWheel: true,
      orientation: "vertical",
    });

    return () => {
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
