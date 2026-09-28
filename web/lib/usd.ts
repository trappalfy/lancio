"use client";

import { formatEth, formatUsd, weiToUsd } from "@lancio/shared";
import { useCallback } from "react";
import { useEthUsd } from "./api";

/** (wei) => "$22k", or "7.1 ETH" while/if the ETH price is unavailable. */
export function useFormatUsd() {
  const { data } = useEthUsd();
  const usd = data?.usd ?? null;
  return useCallback((wei: bigint | string) => (usd == null ? formatEth(wei) : formatUsd(weiToUsd(wei, usd))), [usd]);
}

/** (wei) => USD number | null. */
export function useWeiToUsd() {
  const { data } = useEthUsd();
  const usd = data?.usd ?? null;
  return useCallback((wei: bigint | string) => weiToUsd(wei, usd), [usd]);
}
