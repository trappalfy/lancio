import { cn } from "@/lib/utils";

/** Graduation progress. bps 0..10000 (use formatProgress() for the label — never 100% before graduation). */
export function ProgressBar({ bps, className, label }: { bps: number; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(10_000, bps)) / 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100) / 100}
      aria-label={label ?? "Progress to graduation"}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-border", className)}
    >
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: pct > 0 ? `max(${pct}%, 4px)` : 0 }} />
    </div>
  );
}
