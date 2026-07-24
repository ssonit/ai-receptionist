import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeChatLinkHref(href?: string): string | undefined {
  if (!href) return href;
  if (/^(mailto:|tel:)/i.test(href)) return href;
  if (emailPattern.test(href)) return `mailto:${href}`;
  return href;
}

function isInAppLink(href?: string): boolean {
  return Boolean(href && /^(mailto:|tel:)/i.test(href));
}

/** Streamdown links default to `text-primary` (~white) and `target=_blank` (breaks mailto). */
export const streamdownLinkClass =
  "wrap-anywhere font-medium underline decoration-teal-500/50 underline-offset-2 group-[.is-user]:!text-teal-700 group-[.is-user]:hover:!text-teal-800 group-[.is-assistant]:!text-teal-300 group-[.is-assistant]:hover:!text-teal-200";

export function MarkdownLink({
  children,
  className,
  href,
  rel,
  target,
  // hast node from streamdown / react-markdown — unused
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  const normalizedHref = normalizeChatLinkHref(href);
  const inApp = isInAppLink(normalizedHref);

  return (
    <a
      className={cn(streamdownLinkClass, className)}
      href={normalizedHref}
      {...(inApp ? {} : { rel: rel ?? "noreferrer noopener", target: target ?? "_blank" })}
      {...props}
    >
      {children}
    </a>
  );
}
