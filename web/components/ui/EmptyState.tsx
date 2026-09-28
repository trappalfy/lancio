import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Empty state with a muted brand painting (paintings only here, hero, docs, 404, OG).
 * image: a /brand/*.png path, e.g. "/brand/painting-gate.png". Omit for text only.
 */
export function EmptyState({
  image,
  title,
  description,
  action,
  className,
}: {
  image?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center", className)}>
      {image && (
        <div className="relative mb-6 aspect-[4/3] w-full max-w-72 overflow-hidden rounded-image border border-border">
          <Image src={image} alt="" fill sizes="288px" className="object-cover painting-muted" />
          <div className="absolute inset-0 bg-linear-to-t from-surface/70 to-transparent" />
        </div>
      )}
      <p className="max-w-md text-base text-text">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
