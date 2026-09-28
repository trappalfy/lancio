import { formatEth } from "@lancio/shared";
import { cn } from "@/lib/utils";

/** "0.02594 ETH" (≤4 significant digits). */
export function EthAmount({ wei, unit = true, digits, className }: { wei: bigint | string; unit?: boolean; digits?: number; className?: string }) {
  return <span className={cn("tabular", className)}>{formatEth(wei, { unit, digits })}</span>;
}
