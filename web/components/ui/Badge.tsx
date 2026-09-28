import type { HTMLAttributes } from "react";
import { LancioMark } from "@/components/brand/LancioMark";
import { cn } from "@/lib/utils";

export type BadgeVariant = "graduated" | "new" | "curve" | "neutral" | "crimson";

const VARIANTS: Record<BadgeVariant, string> = {
  // Opaque backgrounds so badges stay legible on top of token images.
  graduated: "bg-bg text-accent-text ring-1 ring-accent/45",
  new: "bg-accent text-on-accent",
  curve: "bg-bg text-muted ring-1 ring-border",
  neutral: "bg-surface-2 text-text",
  crimson: "bg-crimson text-on-crimson",
};

/** Small pill label. `graduated` carries the tiny gold mark; children default to "Graduated". */
export function Badge({ variant = "neutral", className, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap", VARIANTS[variant], className)}
      {...rest}
    >
      {variant === "graduated" && <LancioMark className="h-2.5 w-auto text-accent" />}
      {children ?? (variant === "graduated" ? "Graduated" : null)}
    </span>
  );
}

/** Count next to a section title: "927", "4,228,127 launched". */
export function CountPill({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex h-7 items-center rounded-full bg-surface-2 px-3 text-13 text-muted tabular", className)} {...rest} />;
}
