"use client";

import { WAD, formatEth, formatProgress, formatTokens, formatUsd, type Holding } from "@lancio/shared";
import Link from "next/link";
import { TokenImage } from "@/components/common";
import { Badge } from "@/components/ui";
import { useWeiToUsd } from "@/lib/usd";

/** Value at the current spot price, wei. */
const valueWei = (h: Holding) => (BigInt(h.balance) * BigInt(h.token.priceEth)) / WAD;

export function HoldingsList({ holdings }: { holdings: Holding[] }) {
  const toUsd = useWeiToUsd();
  if (holdings.length === 0) return <p className="py-10 text-center text-sm text-muted">No Lancio token balances at this address.</p>;

  const rows = holdings.map((h) => ({ h, value: valueWei(h) })).sort((a, b) => (b.value > a.value ? 1 : b.value < a.value ? -1 : 0));
  const total = rows.reduce((s, r) => s + r.value, 0n);
  const totalUsd = toUsd(total);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-13 text-muted">Value at current prices</span>
        <span className="text-xl font-medium text-text tabular">{totalUsd == null ? formatEth(total) : formatUsd(totalUsd)}</span>
        {totalUsd != null && <span className="text-13 text-muted tabular">{formatEth(total)}</span>}
      </div>

      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-3 pb-2 text-xs text-muted md:grid">
        <span>Token</span>
        <span className="text-right">Balance</span>
        <span className="text-right">Value</span>
      </div>
      <ul className="divide-y divide-border/70 border-t border-border/70">
        {rows.map(({ h, value }) => {
          const usd = toUsd(value);
          const graduated = h.token.status === "graduated";
          return (
            <li key={h.token.address}>
              <Link
                href={`/launchpad/${h.token.address}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TokenImage src={h.token.meta.image} alt={h.token.name} seed={h.token.address} size={40} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-text">{h.token.name}</span>
                      {graduated && <Badge variant="graduated" className="hidden sm:inline-flex" />}
                    </div>
                    <div className="truncate text-13 text-muted">
                      {h.token.symbol}
                      {!graduated && <> · {formatProgress(h.token.progressBps)} to graduation</>}
                    </div>
                  </div>
                </div>
                <div className="hidden text-right text-sm text-text tabular md:block">{formatTokens(h.balance)}</div>
                <div className="text-right">
                  <div className="text-sm text-text tabular">{usd == null ? formatEth(value) : formatUsd(usd)}</div>
                  <div className="text-xs text-muted tabular">
                    <span className="md:hidden">{formatTokens(h.balance, h.token.symbol)}</span>
                    {usd != null && (
                      <>
                        <span className="md:hidden"> · </span>
                        {formatEth(value)}
                      </>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
