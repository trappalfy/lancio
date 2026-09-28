"use client";

import {
  applySlippage,
  COPY,
  formatEth,
  formatTokens,
  maxBuyForTokens,
  priceImpactBps,
  quoteBuy as localQuoteBuy,
  quoteSell as localQuoteSell,
  TRADE_FEE_BPS,
  type CurveState,
  type TokenDetail,
} from "@lancio/shared";
import { launchpadAbi, tokenAbi } from "@lancio/shared/abi";
import { useMemo, useState } from "react";
import { zeroAddress } from "viem";
import { usePublicClient, useReadContract } from "wagmi";
import { toFriendlyError } from "@/lib/errors";
import { useTx } from "@/lib/tx";
import {
  deadlineFromNow,
  LAUNCHPAD,
  LIVE,
  parseAmount,
  REFRESH_MS,
  toInputString,
  useDebounced,
  useWallet,
  type Side,
} from "./hooks";
import { formatImpact, IMPACT_WARN_BPS, NOT_CONFIGURED } from "./format";
import { Notice, resolveAction, TradeForm, type QuoteRow } from "./TradeForm";

const FEE_LABEL = `Fee (${Number(TRADE_FEE_BPS) / 100}%)`;

type Quote = { out: bigint; fee: bigint; ethUsed?: bigint; refund?: bigint; graduates?: boolean };

/** Buy / sell on the bonding curve via LancioLaunchpad. */
export function CurveTrade({
  token,
  side,
  state,
  slippageBps,
}: {
  token: TokenDetail;
  side: Side;
  state: CurveState;
  slippageBps: number;
}) {
  const sym = token.symbol;
  const wallet = useWallet(token.address);
  const tx = useTx();
  const publicClient = usePublicClient();
  const [input, setInput] = useState("");
  const [cappedAt, setCappedAt] = useState<bigint | null>(null);
  const typed = parseAmount(input);
  const debounced = useDebounced(typed);
  const q = debounced ?? 0n;

  // Launch window: remaining tokens this wallet may buy + blocks left (Robinhood Chain blocks).
  const capRead = useReadContract({
    address: LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "launchCapRemaining",
    args: [token.address, wallet.address ?? zeroAddress],
    query: { enabled: LIVE && side === "buy", refetchInterval: REFRESH_MS },
  });
  const blocksLeft = capRead.data ? Number(capRead.data[1]) : 0;
  const capRemaining = capRead.data?.[0];
  const capEth = useMemo(
    () => (blocksLeft > 0 && capRemaining !== undefined ? maxBuyForTokens(state, capRemaining) : null),
    [blocksLeft, capRemaining, state],
  );

  // Cap the input to what the launch window still allows for this wallet (derived-state update during render).
  if (side === "buy" && capEth !== null && typed !== null && typed > capEth) {
    setInput(capEth > 0n ? toInputString(capEth) : "");
    setCappedAt(capEth);
  }

  const onInput = (v: string) => {
    setCappedAt(null);
    setInput(v);
  };

  const buyRead = useReadContract({
    address: LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "quoteBuy",
    args: [token.address, q],
    query: { enabled: LIVE && side === "buy" && q > 0n, refetchInterval: REFRESH_MS },
  });
  const sellRead = useReadContract({
    address: LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "quoteSell",
    args: [token.address, q],
    query: { enabled: LIVE && side === "sell" && q > 0n, refetchInterval: REFRESH_MS },
  });
  const allowanceRead = useReadContract({
    address: token.address,
    abi: tokenAbi,
    functionName: "allowance",
    args: [wallet.address ?? zeroAddress, LAUNCHPAD],
    query: { enabled: LIVE && side === "sell" && !!wallet.address, refetchInterval: REFRESH_MS * 2 },
  });

  // Local curve math (identical to the contract): next state for price impact, and the quote itself without contracts.
  const local = useMemo(() => {
    if (!debounced) return null;
    try {
      return side === "buy" ? localQuoteBuy(state, debounced) : localQuoteSell(state, debounced);
    } catch {
      return null;
    }
  }, [debounced, side, state]);

  const read = side === "buy" ? buyRead : sellRead;
  let quote: Quote | null = null;
  if (LIVE) {
    if (side === "buy" && buyRead.data) {
      const [tokensOut, ethUsed, refund, fee, graduates] = buyRead.data;
      quote = { out: tokensOut, fee, ethUsed, refund, graduates };
    } else if (side === "sell" && sellRead.data) {
      const [ethOut, fee] = sellRead.data;
      quote = { out: ethOut, fee };
    }
  } else if (local) {
    quote =
      "tokensOut" in local
        ? { out: local.tokensOut, fee: local.fee, ethUsed: local.ethUsed, refund: local.refund, graduates: local.graduates }
        : { out: local.ethOut, fee: local.fee };
  }
  if (!typed) quote = null;

  const stale = typed !== debounced;
  const quoteLoading = !!typed && (stale || (LIVE && read.isLoading));
  const quoteError = LIVE && !!typed && !stale && !read.data && read.error ? toFriendlyError(read.error) : null;
  const impact = local && quote ? priceImpactBps(state, local.next) : null;
  const minOut = quote ? applySlippage(quote.out, slippageBps) : null;

  const fmtOut = (v: bigint) => (side === "buy" ? formatTokens(v, sym) : formatEth(v));
  const rows: QuoteRow[] = [
    { label: "You receive", value: quote ? fmtOut(quote.out) : "—" },
    {
      label: "Price impact",
      value: impact === null ? "—" : formatImpact(impact),
      tone: impact !== null && impact >= IMPACT_WARN_BPS ? "sell" : undefined,
    },
    { label: FEE_LABEL, value: quote ? formatEth(quote.fee) : "—" },
    { label: "Min received", value: minOut !== null ? fmtOut(minOut) : "—" },
  ];

  const needsApproval =
    side === "sell" && !!typed && allowanceRead.data !== undefined && allowanceRead.data < typed;

  const approve = async () => {
    if (!typed) return;
    const amount = typed;
    const rc = await tx.run(
      () => tx.writeContractAsync({ address: token.address, abi: tokenAbi, functionName: "approve", args: [LAUNCHPAD, amount] }),
      { success: `$${sym} approved` },
    );
    if (rc) void allowanceRead.refetch();
  };

  const execute = async () => {
    if (!typed || !quote || minOut === null || !wallet.address) return;
    const account = wallet.address;
    const value = typed;
    const deadline = deadlineFromNow();
    let rc;
    if (side === "buy") {
      const args = [token.address, minOut, deadline] as const;
      const graduates = !!quote.graduates;
      rc = await tx.run(async () => {
        let gas: bigint | undefined;
        if (graduates) {
          // The graduating buy also opens and locks the pool — give it headroom over the estimate.
          if (!publicClient) throw new Error("No RPC client for Robinhood Chain.");
          const est = await publicClient.estimateContractGas({
            address: LAUNCHPAD,
            abi: launchpadAbi,
            functionName: "buy",
            args,
            value,
            account,
          });
          gas = (est * 3n) / 2n;
        }
        return tx.writeContractAsync({ address: LAUNCHPAD, abi: launchpadAbi, functionName: "buy", args, value, gas });
      });
    } else {
      rc = await tx.run(() =>
        tx.writeContractAsync({
          address: LAUNCHPAD,
          abi: launchpadAbi,
          functionName: "sell",
          args: [token.address, value, minOut, deadline],
        }),
      );
    }
    if (rc?.status === "success") {
      setInput("");
      setCappedAt(null);
      wallet.refetchBalances();
    }
  };

  const windowFull = side === "buy" && capEth === 0n;
  const blocked = !LIVE
    ? NOT_CONFIGURED
    : windowFull
      ? "Launch window limit reached"
      : quoteError
        ? "Quote unavailable"
        : null;

  const action = resolveAction({
    wallet,
    side,
    symbol: sym,
    amount: typed,
    txStatus: tx.status,
    blocked,
    approval: needsApproval ? { label: `Approve $${sym}`, run: () => void approve() } : null,
    ready: !!quote && !quoteLoading && (side === "buy" || allowanceRead.data !== undefined),
    execute: () => void execute(),
  });

  const notices = (
    <>
      {side === "buy" && blocksLeft > 0 && <Notice tone="gold">{COPY.token.launchWindow(blocksLeft)}</Notice>}
      {side === "buy" && cappedAt !== null && (
        <Notice>
          {cappedAt > 0n
            ? `Amount capped at ${formatEth(cappedAt)}, the most this wallet can buy until the launch window closes.`
            : "This wallet has reached the launch window limit. Buying reopens when the window closes."}
        </Notice>
      )}
      {quote?.graduates && !quoteLoading && (
        <Notice tone="gold">
          {COPY.token.graduatesWarning}
          <br />
          <span className="tabular">
            Uses {formatEth(quote.ethUsed ?? 0n)} · {formatEth(quote.refund ?? 0n)} refunded
          </span>
        </Notice>
      )}
      {quoteError && <Notice tone="sell">{quoteError}</Notice>}
      {needsApproval && tx.status !== "confirm" && tx.status !== "pending" && (
        <Notice>Selling takes an approval first: it lets the Lancio launchpad move this amount of ${sym}.</Notice>
      )}
    </>
  );

  return (
    <TradeForm
      side={side}
      symbol={sym}
      input={input}
      onInput={onInput}
      wallet={wallet}
      rows={rows}
      quoteLoading={quoteLoading}
      notices={notices}
      action={action}
    />
  );
}
