/**
 * Bonding-curve math. Mirrors LancioLaunchpad.sol to the wei — change both together.
 * State: vEth, vTok (virtual reserves). Invariant vEth * vTok >= K (rounding favours the curve).
 * Derived: realEth = vEth - VIRTUAL_ETH_0, sold = VIRTUAL_TOKEN_0 - vTok.
 */
import {
  BPS,
  CREATOR_FEE_SHARE,
  CURVE_SUPPLY,
  GRADUATION_ETH,
  K,
  LAUNCH_CAP,
  TOTAL_SUPPLY,
  TRADE_FEE_BPS,
  VIRTUAL_ETH_0,
  VIRTUAL_ETH_END,
  VIRTUAL_TOKEN_0,
  VIRTUAL_TOKEN_END,
  WAD,
} from "./constants";

export type CurveState = { vEth: bigint; vTok: bigint };

export const INITIAL_CURVE: CurveState = { vEth: VIRTUAL_ETH_0, vTok: VIRTUAL_TOKEN_0 };

export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export type BuyQuote = {
  tokensOut: bigint;
  /** ETH actually taken (gross, incl. fee). < ethIn only when the buy completes the curve. */
  ethUsed: bigint;
  refund: bigint;
  fee: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  /** True when this buy sells out the curve and triggers graduation in the same tx. */
  graduates: boolean;
  next: CurveState;
};

export function splitFee(fee: bigint) {
  const creatorFee = (fee * CREATOR_FEE_SHARE) / 100n;
  return { creatorFee, protocolFee: fee - creatorFee };
}

export function quoteBuy(s: CurveState, ethIn: bigint): BuyQuote {
  const fee = (ethIn * TRADE_FEE_BPS) / BPS;
  const net = ethIn - fee;
  const newVTok = ceilDiv(K, s.vEth + net);
  if (newVTok > VIRTUAL_TOKEN_END) {
    return {
      tokensOut: s.vTok - newVTok,
      ethUsed: ethIn,
      refund: 0n,
      fee,
      ...splitFee(fee),
      graduates: false,
      next: { vEth: s.vEth + net, vTok: newVTok },
    };
  }
  // Completes the curve: take only what is needed, refund the rest.
  const netNeeded = VIRTUAL_ETH_END - s.vEth;
  let gross = ceilDiv(netNeeded * 100n, 99n);
  if (gross > ethIn) gross = ethIn;
  const partialFee = gross - netNeeded;
  return {
    tokensOut: s.vTok - VIRTUAL_TOKEN_END,
    ethUsed: gross,
    refund: ethIn - gross,
    fee: partialFee,
    ...splitFee(partialFee),
    graduates: true,
    next: { vEth: VIRTUAL_ETH_END, vTok: VIRTUAL_TOKEN_END },
  };
}

export type SellQuote = {
  ethOut: bigint;
  grossOut: bigint;
  fee: bigint;
  creatorFee: bigint;
  protocolFee: bigint;
  next: CurveState;
};

export function quoteSell(s: CurveState, tokensIn: bigint): SellQuote {
  if (tokensIn > soldOf(s)) throw new Error("tokensIn exceeds tokens sold from the curve");
  const newVTok = s.vTok + tokensIn;
  const newVEth = ceilDiv(K, newVTok);
  const grossOut = s.vEth - newVEth;
  const fee = (grossOut * TRADE_FEE_BPS) / BPS;
  return { ethOut: grossOut - fee, grossOut, fee, ...splitFee(fee), next: { vEth: newVEth, vTok: newVTok } };
}

export const realEthOf = (s: CurveState) => s.vEth - VIRTUAL_ETH_0;
export const soldOf = (s: CurveState) => VIRTUAL_TOKEN_0 - s.vTok;
export const tokensLeftOf = (s: CurveState) => CURVE_SUPPLY - soldOf(s);
/** Spot price in wei per 1 whole token (1e18 units). */
export const priceWeiOf = (s: CurveState) => (s.vEth * WAD) / s.vTok;
/** Market cap in wei (price × 1B). */
export const mcapWeiOf = (s: CurveState) => (s.vEth * TOTAL_SUPPLY) / s.vTok;
/** Progress to graduation in basis points (0..10000), from real ETH raised. */
export const progressBpsOf = (s: CurveState) => Number((realEthOf(s) * 10_000n) / GRADUATION_ETH);

/** Largest gross ETH whose buy returns at most `maxTokens` (e.g. the launch cap). */
export function maxBuyForTokens(s: CurveState, maxTokens: bigint = LAUNCH_CAP): bigint {
  let lo = 0n;
  let hi = 20n * WAD;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    const q = quoteBuy(s, mid);
    if (!q.graduates && q.tokensOut <= maxTokens) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/** Price impact of a buy/sell in bps: (execution vs spot). */
export function priceImpactBps(s: CurveState, next: CurveState): number {
  const p0 = priceWeiOf(s);
  const p1 = priceWeiOf(next);
  if (p0 === 0n) return 0;
  const d = p1 > p0 ? p1 - p0 : p0 - p1;
  return Number((d * 10_000n) / p0);
}

export const applySlippage = (amount: bigint, slippageBps: number) =>
  (amount * (BPS - BigInt(slippageBps))) / BPS;
