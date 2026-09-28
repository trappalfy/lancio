"use client";

import { COPY } from "@lancio/shared";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Button, Card, CardHeader, CountPill, EmptyState, Pagination, PillTabs } from "@/components/ui";
import { useStats, useTokens } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GRID } from "./GraduatedPanel";
import { EXPLORE_PANEL_ANCHOR, exploreHref, PAGE_SIZE, SORTS, WINDOWS, type ExploreState } from "./query";
import { TokenCard, TokenCardSkeleton } from "./TokenCard";

export function ExplorePanel({ state }: { state: ExploreState }) {
  const { sort, window, status, page } = state;
  const { data, isPending, isError, isPlaceholderData, dataUpdatedAt } = useTokens({ status, sort, window, page, pageSize: PAGE_SIZE });
  const launched = useStats("all").data?.launches;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const graduatedOnly = status === "graduated";
  const now = Math.floor(dataUpdatedAt / 1000); // "New" badge reference time, refreshed with every poll

  // Page links keep the scroll position; bring the top of the list back into view when the page changes.
  const prevPage = useRef(page);
  useEffect(() => {
    if (prevPage.current === page) return;
    prevPage.current = page;
    const el = document.getElementById(EXPLORE_PANEL_ANCHOR);
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [page]);

  const tabs = (
    <>
      <div className="-mx-5 max-w-[calc(100%+2.5rem)] overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:max-w-none lg:px-0">
        <PillTabs
          aria-label="Sort"
          size="sm"
          items={SORTS.map((s) => ({ href: exploreHref({ ...state, sort: s.value, page: 1 }), label: s.label, active: s.value === sort }))}
        />
      </div>
      <PillTabs
        aria-label="Time window"
        size="sm"
        items={WINDOWS.map((w) => ({ href: exploreHref({ ...state, window: w.value, page: 1 }), label: w.label, active: w.value === window }))}
      />
    </>
  );

  return (
    <Card id={EXPLORE_PANEL_ANCHOR} as="section" aria-labelledby="explore-title" className="scroll-mt-[calc(var(--header-h)+16px)]">
      <CardHeader
        title={<span id="explore-title">{COPY.explore.title}</span>}
        count={launched != null ? <CountPill>{launched.toLocaleString("en-US")} launched</CountPill> : undefined}
        subtitle={graduatedOnly ? COPY.graduated.subtitle : COPY.explore.subtitle}
        actions={tabs}
      />

      {graduatedOnly && (
        <div className="mt-5">
          <Link
            href={exploreHref({ ...state, status: "curve", page: 1 })}
            scroll={false}
            aria-label="Remove filter: Graduated only"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft pr-2.5 pl-3.5 text-13 font-medium text-accent-text transition-colors hover:bg-accent/25"
          >
            Graduated only
            <X size={14} aria-hidden />
          </Link>
        </div>
      )}

      <div className="mt-6 md:mt-8">
        {isPending ? (
          <div className={GRID} aria-busy="true">
            {Array.from({ length: 10 }, (_, i) => (
              <TokenCardSkeleton key={i} />
            ))}
          </div>
        ) : isError && !data ? (
          <p className="py-12 text-center text-sm text-muted">Tokens could not be loaded. Retrying.</p>
        ) : !data || data.items.length === 0 ? (
          page > 1 && data && data.total > 0 ? (
            <EmptyState
              title="This page is past the end of the list."
              action={
                <Button href={exploreHref({ ...state, page: 1 })} variant="outline">
                  Back to page 1
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={
                graduatedOnly
                  ? COPY.graduated.empty
                  : !launched
                    ? COPY.explore.empty
                    : window !== "all"
                      ? "Nothing on the ramp in this window."
                      : "Every token launched so far has graduated. The ramp is clear."
              }
              action={
                <Button href="/launchpad/create">
                  <Plus size={16} aria-hidden />
                  Create
                </Button>
              }
            />
          )
        ) : (
          <ul className={cn(GRID, "transition-opacity", isPlaceholderData && "opacity-60")} aria-busy={isPlaceholderData || undefined}>
            {data.items.map((t) => (
              <li key={t.address} className="flex flex-col [&>article]:flex-1">
                <TokenCard token={t} now={now} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {data && totalPages > 1 && (
        <Pagination className="mt-8" page={Math.min(page, totalPages)} totalPages={totalPages} hrefFor={(p) => exploreHref({ ...state, page: p })} />
      )}
    </Card>
  );
}
