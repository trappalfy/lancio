"use client";

import { explorerTx, formatEth, formatTokens, type TokenDetail } from "@lancio/shared";
import { ArrowUpRight } from "lucide-react";
import { AddressLink, TimeAgo } from "@/components/common";
import { Skeleton } from "@/components/ui";
import { useTrades } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sameAddress } from "./links";

export function TradesTab({ token }: { token: TokenDetail }) {
  const { data, isPending, isError } = useTrades(token.address, 50);

  if (isPending) return <RowsSkeleton />;
  if (isError && !data) return <p className="py-10 text-center text-sm text-muted">Trades are unavailable right now.</p>;
  if (!data.items.length) return <p className="py-10 text-center text-sm text-muted">No trades yet.</p>;

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-13">
        <thead className="text-muted">
          <tr>
            <th className="px-2 pb-3 font-normal">Time</th>
            <th className="px-2 pb-3 font-normal">Side</th>
            <th className="px-2 pb-3 font-normal">Account</th>
            <th className="px-2 pb-3 text-right font-normal">ETH</th>
            <th className="px-2 pb-3 text-right font-normal">{token.symbol}</th>
            <th className="w-8 px-2 pb-3 font-normal">
              <span className="sr-only">Transaction</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((t) => (
            <tr key={t.id} className="border-t border-border/60">
              <td className="px-2 py-2.5">
                <TimeAgo ts={t.timestamp} />
              </td>
              <td className={cn("px-2 py-2.5 font-medium", t.side === "buy" ? "text-buy" : "text-sell")}>{t.side === "buy" ? "Buy" : "Sell"}</td>
              <td className="px-2 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <AddressLink address={t.trader} href={`/profile/${t.trader}`} />
                  {sameAddress(t.trader, token.creator) && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text">Creator</span>}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right text-text tabular">{formatEth(t.ethAmount, { unit: false })}</td>
              <td className="px-2 py-2.5 text-right text-text tabular">{formatTokens(t.tokenAmount)}</td>
              <td className="px-2 py-2.5">
                <a
                  href={explorerTx(t.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View transaction in explorer"
                  className="grid size-6 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <ArrowUpRight size={14} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}
