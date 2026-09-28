import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article" | "aside";
  /** 32px desktop / 20px mobile padding (default true). */
  padded?: boolean;
  /** Canvas texture overlay (big panels). */
  texture?: boolean;
};

/** Section card: radius 28, --surface, soft shadow. */
export function Card({ as: Tag = "section", padded = true, texture, className, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-section bg-surface border border-border/60 shadow-section",
        padded && "p-5 md:p-8",
        texture && "canvas-texture",
        className,
      )}
      {...rest}
    />
  );
}

/** Nested card inside a section: radius 20, --surface-2. */
export function SubCard({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn("rounded-card bg-surface-2", padded && "p-4 md:p-5", className)} {...rest} />;
}

/** Card header row: Cinzel title + optional count/subtitle on the left, controls on the right. */
export function CardHeader({
  title,
  count,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-28 text-text">{title}</h2>
          {count}
        </div>
        {subtitle && <p className="mt-2 max-w-xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
