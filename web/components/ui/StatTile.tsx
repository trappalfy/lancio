import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./Tooltip";

/** Big-number tile (analytics, token stats). value is pre-formatted with the shared formatters. */
export function StatTile({
  label,
  value,
  sub,
  hint,
  size = "lg",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Secondary line under the value (e.g. USD equivalent, change vs prior day). */
  sub?: ReactNode;
  /** Tooltip text next to the label. */
  hint?: ReactNode;
  size?: "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <div className={cn("rounded-card bg-surface-2 p-5", className)}>
      <div className="flex items-center gap-1.5 text-13 text-muted">
        {label}
        {hint && (
          <Tooltip content={hint}>
            <button type="button" aria-label="More info" className="text-muted hover:text-text">
              <Info size={14} />
            </button>
          </Tooltip>
        )}
      </div>
      <div
        className={cn(
          "mt-2 font-medium tracking-tight text-text tabular",
          size === "md" ? "text-xl" : size === "lg" ? "text-28 md:text-40" : "text-40 md:text-56",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-13 text-muted">{sub}</div>}
    </div>
  );
}
