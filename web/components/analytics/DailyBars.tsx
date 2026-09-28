"use client";

import { COPY } from "@lancio/shared";
import type { ReactNode } from "react";
import { Card, Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

export type BarPoint = { day: string; value: number; label: string };

/** "2026-09-26" → "Sep 26" (UTC). */
export const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Placeholder silhouette for the empty state (fractions of the plot height).
const PLACEHOLDER = [0.35, 0.5, 0.42, 0.62, 0.48, 0.7, 0.55, 0.4, 0.58, 0.66, 0.45, 0.52, 0.6, 0.38];

/**
 * 14-day bar chart card. The latest completed day (last point) is saturated gold, earlier days muted gold.
 * `headline` sits right of the title (value of the latest day).
 */
export function DailyBars({
  title,
  headline,
  points,
  loading,
}: {
  title: string;
  headline: ReactNode;
  points: BarPoint[] | undefined;
  loading?: boolean;
}) {
  const empty = !loading && (!points || points.length === 0);
  const max = points?.reduce((m, p) => Math.max(m, p.value), 0) ?? 0;
  const first = points?.[0];
  const mid = points?.[Math.floor(((points?.length ?? 1) - 1) / 2)];
  const last = points?.at(-1);

  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-heading text-xl text-text md:text-28">{title}</h2>
        <div className="text-xl font-medium text-text tabular">{loading ? <Skeleton className="h-6 w-20" /> : empty ? "—" : headline}</div>
      </div>
      <p className="mt-2 text-sm text-muted">{COPY.analytics.chartSubtitle}</p>

      <div className="mt-6 rounded-card bg-surface-2 px-4 pt-5 pb-3 md:px-5">
        <div className="relative h-48 md:h-56">
          {loading ? (
            <Skeleton className="h-full w-full bg-border/40" />
          ) : empty ? (
            <>
              <div aria-hidden className="flex h-full items-end gap-1.5 border-b border-border md:gap-2">
                {PLACEHOLDER.map((h, i) => (
                  <div key={i} className="flex-1 rounded-t-md bg-border/60" style={{ height: `${h * 100}%` }} />
                ))}
              </div>
              <div className="absolute inset-0 grid place-items-center px-6">
                <p className="max-w-xs rounded-xl bg-surface-2/90 px-4 py-3 text-center text-sm text-muted">{COPY.analytics.emptyChart}</p>
              </div>
            </>
          ) : (
            <div
              role="img"
              aria-label={`${title}, last ${points!.length} UTC days. ${points!.map((p) => `${dayLabel(p.day)}: ${p.label}`).join(", ")}.`}
              className="flex h-full items-end gap-1.5 border-b border-border md:gap-2"
            >
              {points!.map((p, i) => {
                const latest = i === points!.length - 1;
                const h = max > 0 ? (p.value / max) * 100 : 0;
                return (
                  <div
                    key={p.day}
                    title={`${dayLabel(p.day)} · ${p.label}`}
                    className={cn("flex-1 rounded-t-md transition-[height] duration-500", latest ? "bg-accent" : "bg-accent/40")}
                    style={{ height: p.value > 0 ? `max(${h}%, 3px)` : "2px" }}
                  />
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-2 flex justify-between text-xs text-muted tabular">
          {first && mid && last && !empty ? (
            <>
              <span>{dayLabel(first.day)}</span>
              <span>{dayLabel(mid.day)}</span>
              <span>{dayLabel(last.day)}</span>
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
      </div>
    </Card>
  );
}
