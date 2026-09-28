"use client";

import { COPY } from "@lancio/shared";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TokenImage } from "@/components/common";
import { Card, Input, Skeleton } from "@/components/ui";
import { useSearch, useTop } from "@/lib/api";
import { useFormatUsd } from "@/lib/usd";
import { cn } from "@/lib/utils";

function useDebounced(value: string, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Largest tokens by market cap (or search results), each linking to its forum room. */
export function ForumSidebar({ className }: { className?: string }) {
  const [input, setInput] = useState("");
  const term = useDebounced(input.trim(), 250);
  const searching = term.length > 0;
  const top = useTop(10);
  const search = useSearch(term);
  const fmtUsd = useFormatUsd();
  const list = searching ? search.data : top.data;
  const loading = searching ? search.isPending : top.isPending;
  const failed = searching ? search.isError : top.isError;

  return (
    <Card as="aside" padded={false} className={cn("p-5 md:p-6", className)}>
      <h2 className="font-heading text-xl text-text">{COPY.forum.sidebarTitle}</h2>
      <Input
        className="mt-4"
        leading={<Search size={16} />}
        placeholder={COPY.forum.sidebarSearch}
        aria-label={COPY.forum.sidebarSearch}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="mt-3 min-h-24">
        {loading ? (
          <div className="space-y-2 py-1">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : failed ? (
          <p className="px-2 py-4 text-sm text-muted">Token data is unavailable right now.</p>
        ) : !list?.length ? (
          <p className="px-2 py-4 text-sm text-muted">{searching ? "No tokens match." : "No tokens yet."}</p>
        ) : (
          <ol>
            {list.map((t, i) => (
              <li key={t.address}>
                <Link href={`/forum/${t.address}`} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2">
                  {!searching && <span className="w-5 shrink-0 text-13 text-muted tabular">{i + 1}</span>}
                  <TokenImage src={t.meta.image} alt={t.name} seed={t.address} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">${t.symbol}</span>
                  <span className="shrink-0 text-13 text-muted tabular">{fmtUsd(t.mcapEth)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Link href="/#explore" className="mt-2 inline-flex items-center gap-1.5 px-2 text-sm font-medium text-accent-text hover:underline">
        {COPY.forum.sidebarLink}
        <ArrowRight size={14} />
      </Link>
    </Card>
  );
}
