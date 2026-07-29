import Image from "next/image";
import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export const EVE_LOGO_SRC = "/logo.png";

const SIZE_PX = {
  xs: 20,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56,
} as const;

type EveLogoSize = keyof typeof SIZE_PX;

type EveLogoProps = {
  size?: EveLogoSize;
  className?: string;
  imageClassName?: string;
  label?: string;
  showLabel?: boolean;
  labelClassName?: string;
  href?: string;
  linkClassName?: string;
  priority?: boolean;
};

function EveLogoContent({
  size = "sm",
  className,
  imageClassName,
  label = "Eve",
  showLabel = false,
  labelClassName,
  priority,
}: Omit<EveLogoProps, "href" | "linkClassName">) {
  const px = SIZE_PX[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Image
        alt=""
        aria-hidden
        className={cn("shrink-0 rounded-md object-cover", imageClassName)}
        height={px}
        priority={priority}
        src={EVE_LOGO_SRC}
        width={px}
      />
      {showLabel ? (
        <span className={cn("font-semibold tracking-tight", labelClassName)}>
          {label}
        </span>
      ) : null}
    </span>
  );
}

export function EveLogo({
  href,
  linkClassName,
  ...props
}: EveLogoProps) {
  if (href) {
    return (
      <Link
        aria-label={props.showLabel ? undefined : props.label ?? "Eve"}
        className={cn("inline-flex", linkClassName)}
        href={href}
      >
        <EveLogoContent {...props} />
      </Link>
    );
  }

  return <EveLogoContent {...props} />;
}

export function EveLogoMark({
  size = "sm",
  className,
  priority,
  ...rest
}: Omit<ComponentPropsWithoutRef<typeof Image>, "alt" | "src"> & {
  size?: EveLogoSize;
}) {
  const px = SIZE_PX[size];
  return (
    <Image
      alt=""
      aria-hidden
      className={cn("shrink-0 rounded-md object-cover", className)}
      height={px}
      priority={priority}
      src={EVE_LOGO_SRC}
      width={px}
      {...rest}
    />
  );
}
