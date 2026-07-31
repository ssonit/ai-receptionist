"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface BlurFadeProps {
  children: ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  offset?: number;
  direction?: "up" | "down" | "left" | "right";
  inView?: boolean;
  inViewMargin?: string;
  blur?: string;
  style?: CSSProperties;
}

export function BlurFade({
  children,
  className,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = "down",
  inView = false,
  inViewMargin = "-50px",
  blur = "6px",
  style,
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(!inView);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: inViewMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, inViewMargin]);

  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const distance =
    direction === "right" || direction === "down" ? -offset : offset;
  const transitionDelay = 0.04 + delay;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        filter: visible ? "blur(0px)" : `blur(${blur})`,
        transform: visible
          ? "translate(0, 0)"
          : axis === "x"
            ? `translateX(${distance}px)`
            : `translateY(${distance}px)`,
        transition: [
          `opacity ${duration}s ease-out ${transitionDelay}s`,
          `filter ${duration}s ease-out ${transitionDelay}s`,
          `transform ${duration}s ease-out ${transitionDelay}s`,
        ].join(", "),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
