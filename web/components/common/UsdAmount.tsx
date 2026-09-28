"use client";

import { formatEth, formatUsd, weiToUsd } from "@lancio/shared";
import { useEthUsd } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "$22k" from wei; falls back to the ETH amount while/if the ETH price is unavailable. */
export function UsdAmount({ wei, className }: { wei: bigint | string; className?: string }) {
  const { data } = useEthUsd();
  const usd = data?.usd ?? null;
  return <span className={cn("tabular", className)}>{usd == null ? formatEth(wei) : formatUsd(weiToUsd(wei, usd))}</span>;
}
