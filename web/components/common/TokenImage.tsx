"use client";

import Image from "next/image";
import { useState } from "react";
import { identiconSvg, svgDataUri } from "@/lib/identicon";
import { cn } from "@/lib/utils";

/**
 * Square rounded token image with an identicon fallback (no image / failed load).
 * size: px, or "fill" to fill a positioned parent (e.g. aspect-square card cover) — pass `sizes` then.
 */
export function TokenImage({
  src,
  alt,
  size = 48,
  seed,
  sizes,
  priority,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  size?: number | "fill";
  /** Fallback identicon seed — pass the token address. Defaults to alt. */
  seed?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const fill = size === "fill";
  const radius = fill || size >= 64 ? "rounded-image" : size >= 32 ? "rounded-xl" : "rounded-lg";
  const url = !src || failed ? svgDataUri(identiconSvg(seed ?? alt, 96)) : src;
  const box = cn("relative inline-block shrink-0 overflow-hidden bg-surface-2 align-middle", radius, fill && "absolute inset-0 block", className);
  return (
    <span className={box} style={fill ? undefined : { width: size, height: size }}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes ?? (fill ? "(min-width: 1280px) 240px, (min-width: 768px) 33vw, 50vw" : `${size}px`)}
        priority={priority}
        unoptimized={url.startsWith("data:")}
        onError={() => setFailed(true)}
        className="object-cover"
      />
    </span>
  );
}
