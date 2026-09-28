"use client";

import { COPY } from "@lancio/shared";
import { ArrowRight } from "lucide-react";
import { Button, CardHeader, CountPill, EmptyState } from "@/components/ui";
import { useTokens } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DEFAULT_EXPLORE, EXPLORE_PANEL_ANCHOR, exploreHref } from "./query";
import { GraduatedCard, TokenCardSkeleton } from "./TokenCard";

/** Two rows at every grid width (1 → xs:2 → md:3 → lg:4 → xl:5 columns): 10 cards fetched, the rest hidden by breakpoint. */
const MAX_CARDS = 10;
const rowLimit = (i: number) =>
  i < 2 ? "" : i < 4 ? "hidden xs:flex" : i < 6 ? "hidden md:flex" : i < 8 ? "hidden lg:flex" : "hidden xl:flex";

export const GRID = "grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5";

export function GraduatedPanel() {
  const { data, isPending, isError } = useTokens({ status: "graduated", sort: "marketCap", page: 1, pageSize: MAX_CARDS });
  const total = data?.total ?? 0;
  const showAll = exploreHref({ ...DEFAULT_EXPLORE, status: "graduated" }, EXPLORE_PANEL_ANCHOR);

  return (
    <section aria-labelledby="graduated-title" className="canvas-texture graduated-panel rounded-section p-5 shadow-section md:p-8">
      <CardHeader
        title={<span id="graduated-title">{COPY.graduated.title}</span>}
        count={data && total > 0 ? <CountPill>{total.toLocaleString("en-US")}</CountPill> : undefined}
        subtitle={COPY.graduated.subtitle}
        actions={
          total > 0 ? (
            <Button href={showAll} variant="outline" size="sm" className="bg-surface/60">
              {COPY.graduated.showAll}
              <ArrowRight size={14} />
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 md:mt-8">
        {isPending ? (
          <div className={GRID}>
            {Array.from({ length: 5 }, (_, i) => (
              <TokenCardSkeleton key={i} progress={false} className={rowLimit(i)} />
            ))}
          </div>
        ) : isError && !data ? (
          <p className="py-10 text-center text-sm text-muted">Graduated tokens could not be loaded. Retrying.</p>
        ) : !data || data.items.length === 0 ? (
          <EmptyState image="/brand/painting-forge-full.png" title={COPY.graduated.empty} className="py-6" />
        ) : (
          <ul className={GRID}>
            {data.items.slice(0, MAX_CARDS).map((t, i) => (
              <li key={t.address} className={cn("flex flex-col [&>article]:flex-1", rowLimit(i))}>
                <GraduatedCard token={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
