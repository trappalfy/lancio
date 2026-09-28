"use client";

import { formatEth, formatTokens, shortAddress, type Trade } from "@lancio/shared";
import Link from "next/link";
import { useState } from "react";
import { AddressLink, TimeAgo } from "@/components/common";
import { Button, Skeleton } from "@/components/ui";
import { api, useAccountTrades } from "@/lib/api";
import { cn } from "@/lib/utils";

const PAGE = 50;

export function TradesList({ address }: { address: string }) {
  const { data, isLoading, isError } = useAccountTrades(address, PAGE);
  const [older, setOlder] = useState<Trade[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (isError && !data) return <p className="py-10 text-center text-sm text-muted">Trades are unavailable right now. Retrying.</p>;

  const first = data?.items ?? [];
  const seen = new Set(first.map((t) => t.id));
  const items = [...first, ...older.filter((t) => !seen.has(t.id))];
  const next = cursor === undefined ? (data?.nextCursor ?? null) : cursor;

  if (items.length === 0) return <p className="py-10 text-center text-sm text-muted">No trades from this address yet.</p>;

  const loadMore = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await api.accountTrades(address, { limit: PAGE, before: next });
      setOlder((o) => [...o, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      // Keep the button; the next click retries.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <div className="hidden grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_7rem] gap-4 px-3 pb-2 text-xs text-muted md:grid">
        <span>Side</span>
        <span>Token</span>
        <span className="text-right">Amount</span>
        <span className="text-right">ETH</span>
        <span className="text-right">Time</span>
        <span className="text-right">Tx</span>
      </div>
      <ul className="divide-y divide-border/70 border-t border-border/70">
        {items.map((t) => {
          const buy = t.side === "buy";
          const label = t.symbol ?? shortAddress(t.token);
          return (
            <li
              key={t.id}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-3 text-sm md:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_6rem_7rem] md:gap-4"
            >
              <span className={cn("font-medium", buy ? "text-buy" : "text-sell")}>{buy ? "Buy" : "Sell"}</span>
              <span className="min-w-0 truncate">
                <Link href={`/launchpad/${t.token}`} className="text-text hover:text-accent-text">
                  {label}
                </Link>
                {t.source === "pool" && <span className="ml-2 text-xs text-muted">pool</span>}
                <span className="block text-xs text-muted tabular md:hidden">
                  {formatTokens(t.tokenAmount)} · <TimeAgo ts={t.timestamp} className="text-xs" />
                </span>
              </span>
              <span className="hidden text-right text-text tabular md:block">{formatTokens(t.tokenAmount)}</span>
              <span className="text-right text-text tabular">{formatEth(t.ethAmount)}</span>
              <span className="hidden text-right md:block">
                <TimeAgo ts={t.timestamp} />
              </span>
              <span className="hidden justify-end md:flex">
                <AddressLink address={t.txHash} kind="tx" />
              </span>
            </li>
          );
        })}
      </ul>
      {next && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" loading={loadingMore} onClick={loadMore}>
            Load older trades
          </Button>
        </div>
      )}
    </div>
  );
}
