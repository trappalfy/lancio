"use client";

import { explorerAddress, formatPct, formatTokens, type Holder, type TokenDetail } from "@lancio/shared";
import { ArrowUpRight } from "lucide-react";
import { AddressLink } from "@/components/common";
import { useHolders } from "@/lib/api";
import { RowsSkeleton } from "./TradesTab";

const LABEL: Record<Exclude<Holder["label"], null | "creator">, string> = {
  curve: "Bonding curve",
  pool: "Uniswap v4 pool",
};

export function HoldersTab({ token }: { token: TokenDetail }) {
  const { data, isPending, isError } = useHolders(token.address, 20);

  if (isPending) return <RowsSkeleton />;
  if (isError && !data) return <p className="py-10 text-center text-sm text-muted">Holders are unavailable right now.</p>;
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No holders yet.</p>;

  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-13">
        <thead className="text-muted">
          <tr>
            <th className="w-10 px-2 pb-3 font-normal">#</th>
            <th className="px-2 pb-3 font-normal">Holder</th>
            <th className="px-2 pb-3 font-normal">Share</th>
            <th className="px-2 pb-3 text-right font-normal">Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.map((h, i) => (
            <tr key={h.account} className="border-t border-border/60">
              <td className="px-2 py-2.5 text-muted tabular">{i + 1}</td>
              <td className="px-2 py-2.5">
                {h.label === "curve" || h.label === "pool" ? (
                  <a
                    href={explorerAddress(h.account)}
                    target="_blank"
                    rel="noreferrer"
                    title={h.account}
                    className="inline-flex items-center gap-1 font-medium text-text hover:text-accent-text"
                  >
                    {LABEL[h.label]}
                    <ArrowUpRight size={13} className="text-muted" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <AddressLink address={h.account} href={`/profile/${h.account}`} />
                    {h.label === "creator" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-text">Creator</span>}
                  </span>
                )}
              </td>
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-14 text-text tabular">{formatPct(h.shareBps / 100)}</span>
                  <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-border sm:block" aria-hidden>
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, h.shareBps / 100)}%` }} />
                  </span>
                </div>
              </td>
              <td className="px-2 py-2.5 text-right text-text tabular">{formatTokens(h.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
