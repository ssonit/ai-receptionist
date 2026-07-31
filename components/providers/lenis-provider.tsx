"use client";

import Lenis from "lenis";
import { useEffect, type ReactNode, useRef } from "react";

type LenisProviderProps = {
  readonly children: ReactNode;
};

export function LenisProvider({ children }: LenisProviderProps) {
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) return;

    const lenis = new Lenis({
      lerp: 0.1,
      smoothWheel: true,
      orientation: "vertical",
    });

    const raf = (time: number) => {
      lenis.raf(time * 1000);
      rafRef.current = requestAnimationFrame(raf);
    };
    rafRef.current = requestAnimationFrame(raf);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
