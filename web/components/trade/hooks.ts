"use client";

import { type CurveState, type TokenDetail } from "@lancio/shared";
import { launchpadAbi, tokenAbi } from "@lancio/shared/abi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain } from "wagmi";
import { config } from "@/lib/config";
import { isUserRejection, toFriendlyError } from "@/lib/errors";
import { appChain } from "@/lib/wagmi";

export type Side = "buy" | "sell";

/** Onchain reads only make sense with deployed contracts and real token addresses (not mocks). */
export const LIVE = !config.useMocks && config.deployment.launchpad !== zeroAddress;
/** Quote / state refresh — Robinhood Chain blocks are ~0.1 s, the RPC is polled every ~2 s. */
export const REFRESH_MS = 2_000;
export const LAUNCHPAD = config.deployment.launchpad;
export const DEADLINE_SECONDS = 300;

export const deadlineFromNow = () => BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** Keep digits and one dot, at most 18 decimals. */
export function sanitizeAmount(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 18);
  if (s.startsWith(".")) s = `0${s}`;
  return s;
}

/** Positive wei amount or null. */
export function parseAmount(s: string): bigint | null {
  if (!s || s === "." || s === "0.") return null;
  try {
    const v = parseUnits(s, 18);
    return v > 0n ? v : null;
  } catch {
    return null;
  }
}

/** Wei → input string, rounded down to `decimals` places, trailing zeros trimmed. */
export function toInputString(wei: bigint, decimals = 6): string {
  const unit = 10n ** BigInt(18 - decimals);
  const floored = wei - (wei % unit);
  const whole = floored / 10n ** 18n;
  const frac = (floored % 10n ** 18n).toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Live curve state from `getCurve(token)` (refreshed every ~2 s), falling back to the indexer's token fields
 * until the read lands (or when contracts are not configured).
 */
export function useLiveCurve(token: TokenDetail) {
  const { data, refetch } = useReadContract({
    address: LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "getCurve",
    args: [token.address],
    query: { enabled: LIVE, refetchInterval: REFRESH_MS },
  });
  const known = !!data && data.creator !== zeroAddress;
  const vEth = known ? data.vEth : BigInt(token.vEth);
  const vTok = known ? data.vTok : BigInt(token.vTok);
  const state: CurveState = useMemo(() => ({ vEth, vTok }), [vEth, vTok]);
  return {
    state,
    graduated: known ? data.graduated : token.status === "graduated",
    creator: (known ? data.creator : token.creator) as Address,
    /** Unclaimed creator ETH held by the launchpad (curve fees + collected pool ETH fees). Undefined until read. */
    creatorFees: known ? data.creatorFees : undefined,
    live: known,
    refetch,
  };
}

/** Connected wallet, chain check and balances for the trade panel. */
export function useWallet(token: Address) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = isConnected && chainId !== appChain.id;

  const eth = useBalance({
    address,
    chainId: appChain.id,
    query: { enabled: !!address, refetchInterval: REFRESH_MS * 2 },
  });
  const tok = useReadContract({
    address: token,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    query: { enabled: LIVE && !!address, refetchInterval: REFRESH_MS * 2 },
  });

  return {
    address,
    connected: isConnected && !!address,
    wrongChain,
    connect: () => openConnectModal?.(),
    switchChain: () =>
      switchChain(
        { chainId: appChain.id },
        { onError: (e) => (isUserRejection(e) ? undefined : toast.error(toFriendlyError(e))) },
      ),
    switching,
    ethBalance: eth.data?.value,
    tokenBalance: tok.data,
    refetchBalances: () => {
      void eth.refetch();
      void tok.refetch();
    },
  };
}

export type Wallet = ReturnType<typeof useWallet>;
