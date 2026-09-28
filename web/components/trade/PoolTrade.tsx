"use client";

import { applySlippage, COPY, formatEth, formatTokens, PARAMS, POOL_LP_FEE, UNISWAP_V4, type TokenDetail } from "@lancio/shared";
import { lockerAbi, permit2Abi, tokenAbi, v4QuoterAbi } from "@lancio/shared/abi";
import { useMemo, useState } from "react";
import { maxUint256, zeroAddress, type Hash } from "viem";
import { useReadContract, useSimulateContract } from "wagmi";
import { config } from "@/lib/config";
import { revertErrorName, toFriendlyError } from "@/lib/errors";
import { useTx } from "@/lib/tx";
import {
  encodeExactInSingle,
  lancioPoolKey,
  PERMIT2_EXPIRATION_SECONDS,
  POOL_FEE_PIPS,
  poolIdOf,
  poolImpactBps,
  routerAbi,
  stateViewAbi,
  type PoolKey,
} from "@/lib/uniswap";
import { deadlineFromNow, LIVE, parseAmount, REFRESH_MS, useDebounced, useWallet, type Side } from "./hooks";
import { formatImpact, IMPACT_WARN_BPS, NOT_CONFIGURED } from "./format";
import { Notice, resolveAction, TradeForm, type QuoteRow } from "./TradeForm";

const ROUTER = UNISWAP_V4.universalRouter;
const PERMIT2 = UNISWAP_V4.permit2;
const FEE_LABEL = `Pool fee (${PARAMS.poolFeePct})`;

/** Map Universal Router / Permit2 reverts to plain text before the standard toast flow sees them. */
async function withPoolErrors(send: () => Promise<Hash>): Promise<Hash> {
  try {
    return await send();
  } catch (err) {
    const name = revertErrorName(err);
    if (name === "V4TooLittleReceived" || name === "V4TooLittleReceivedPerHopSingle") throw new Error(COPY.errors.SlippageExceeded);
    if (name === "TransactionDeadlinePassed") throw new Error(COPY.errors.DeadlineExpired);
    if (name === "AllowanceExpired" || name === "InsufficientAllowance")
      throw new Error("The router allowance is missing or expired. Allow it again.");
    throw err;
  }
}

/** Buy / sell in the locked Uniswap v4 pool via the Universal Router (after graduation). */
export function PoolTrade({ token, side, slippageBps }: { token: TokenDetail; side: Side; slippageBps: number }) {
  const sym = token.symbol;
  const wallet = useWallet(token.address);
  const tx = useTx();
  const [input, setInput] = useState("");
  const typed = parseAmount(input);
  const debounced = useDebounced(typed);
  const zeroForOne = side === "buy";
  const owner = wallet.address ?? zeroAddress;

  // The locker knows the exact PoolKey; fall back to the deterministic one built from config.
  const keyRead = useReadContract({
    address: config.deployment.locker,
    abi: lockerAbi,
    functionName: "poolKeyOf",
    args: [token.address],
    query: { enabled: LIVE && config.deployment.locker !== zeroAddress, staleTime: Infinity },
  });
  const k = keyRead.data;
  const key: PoolKey = useMemo(
    () =>
      k && k.hooks !== zeroAddress
        ? { currency0: k.currency0, currency1: k.currency1, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks }
        : lancioPoolKey(token.address, config.deployment.hook),
    [k, token.address],
  );
  const poolId = useMemo(() => poolIdOf(key), [key]);

  const quoteSim = useSimulateContract({
    address: UNISWAP_V4.quoter,
    abi: v4QuoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ poolKey: key, zeroForOne, exactAmount: debounced ?? 0n, hookData: "0x" }],
    query: { enabled: LIVE && !!debounced, refetchInterval: REFRESH_MS },
  });
  const slot0 = useReadContract({
    address: UNISWAP_V4.stateView,
    abi: stateViewAbi,
    functionName: "getSlot0",
    args: [poolId],
    query: { enabled: LIVE, refetchInterval: REFRESH_MS },
  });

  // Sell path: token → Permit2 (ERC20 approve, once), then Permit2 → Universal Router (this amount).
  const sellReads = LIVE && side === "sell" && !!wallet.address;
  const erc20Allowance = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "allowance",
    args: [owner, PERMIT2],
    query: { enabled: sellReads, refetchInterval: REFRESH_MS * 2 },
  });
  const permit2Allowance = useReadContract({
    address: PERMIT2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [owner, token.address, ROUTER],
    query: { enabled: sellReads, refetchInterval: REFRESH_MS * 2 },
  });

  const out = typed && quoteSim.data ? quoteSim.data.result[0] : null;
  const stale = typed !== debounced;
  const quoteLoading = !!typed && (stale || (LIVE && quoteSim.isLoading));
  const quoteError = LIVE && !!typed && !stale && !quoteSim.data && quoteSim.error ? toFriendlyError(quoteSim.error) : null;
  const impact =
    out !== null && debounced && slot0.data
      ? poolImpactBps({ sqrtPriceX96: slot0.data[0], zeroForOne, amountIn: debounced, amountOut: out })
      : null;
  const fee = debounced ? (debounced * BigInt(POOL_LP_FEE)) / POOL_FEE_PIPS : null;
  const minOut = out !== null ? applySlippage(out, slippageBps) : null;

  const fmtOut = (v: bigint) => (side === "buy" ? formatTokens(v, sym) : formatEth(v));
  const fmtIn = (v: bigint) => (side === "buy" ? formatEth(v) : formatTokens(v, sym));
  const rows: QuoteRow[] = [
    { label: "You receive", value: out !== null ? fmtOut(out) : "—" },
    {
      label: "Price impact",
      value: impact === null ? "—" : formatImpact(impact),
      tone: impact !== null && impact >= IMPACT_WARN_BPS ? "sell" : undefined,
    },
    { label: FEE_LABEL, value: fee !== null && typed ? fmtIn(fee) : "—" },
    { label: "Min received", value: minOut !== null ? fmtOut(minOut) : "—" },
  ];

  // Approval steps (sell only).
  const nowSec = Math.floor(Date.now() / 1000);
  const needsErc20 = side === "sell" && !!typed && erc20Allowance.data !== undefined && erc20Allowance.data < typed;
  const needsPermit =
    side === "sell" &&
    !!typed &&
    !!permit2Allowance.data &&
    (permit2Allowance.data[0] < typed || permit2Allowance.data[1] <= nowSec + 60);
  const allowancesLoaded = side === "buy" || (erc20Allowance.data !== undefined && permit2Allowance.data !== undefined);

  const approveToken = async () => {
    const rc = await tx.run(
      () => tx.writeContractAsync({ address: token.address, abi: tokenAbi, functionName: "approve", args: [PERMIT2, maxUint256] }),
      { success: `$${sym} approved for Permit2` },
    );
    if (rc) void erc20Allowance.refetch();
  };
  const permitRouter = async () => {
    if (!typed) return;
    const amount = typed;
    const expiration = Math.floor(Date.now() / 1000) + PERMIT2_EXPIRATION_SECONDS;
    const rc = await tx.run(
      () =>
        tx.writeContractAsync({
          address: PERMIT2,
          abi: permit2Abi,
          functionName: "approve",
          args: [token.address, ROUTER, amount, expiration],
        }),
      { success: "Uniswap router allowed" },
    );
    if (rc) void permit2Allowance.refetch();
  };

  const execute = async () => {
    if (!typed || minOut === null) return;
    const amountIn = typed;
    const args = encodeExactInSingle({ key, zeroForOne, amountIn, minAmountOut: minOut, deadline: deadlineFromNow() });
    const rc = await tx.run(() =>
      withPoolErrors(() =>
        tx.writeContractAsync({
          address: ROUTER,
          abi: routerAbi,
          functionName: "execute",
          args,
          value: zeroForOne ? amountIn : undefined,
        }),
      ),
    );
    if (rc?.status === "success") {
      setInput("");
      wallet.refetchBalances();
    }
  };

  const approval = needsErc20
    ? { label: `Approve $${sym} · 1 of 2`, run: () => void approveToken() }
    : needsPermit
      ? { label: "Allow Uniswap router · 2 of 2", run: () => void permitRouter() }
      : null;

  const action = resolveAction({
    wallet,
    side,
    symbol: sym,
    amount: typed,
    txStatus: tx.status,
    blocked: !LIVE ? NOT_CONFIGURED : quoteError ? "Quote unavailable" : null,
    approval,
    ready: out !== null && !quoteLoading && allowancesLoaded,
    execute: () => void execute(),
  });

  const notices = (
    <>
      {quoteError && <Notice tone="sell">{quoteError}</Notice>}
      {approval && tx.status !== "confirm" && tx.status !== "pending" && (
        <Notice>
          Pool sells go through Uniswap&apos;s Permit2: approve ${sym} for Permit2 once, then allow the Uniswap router to
          spend this amount.
        </Notice>
      )}
    </>
  );

  return (
    <TradeForm
      side={side}
      symbol={sym}
      input={input}
      onInput={setInput}
      wallet={wallet}
      rows={rows}
      quoteLoading={quoteLoading}
      notices={notices}
      action={action}
    />
  );
}
