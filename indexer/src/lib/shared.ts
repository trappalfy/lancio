/**
 * Helpers shared by indexing handlers and API routes. No ponder:* imports here, so both sides can use it.
 */
import { getDeployment, TOTAL_SUPPLY, UNISWAP_V4, WAD } from "@lancio/shared";
import type { Interval } from "@lancio/shared/api-types";

export type Hex = `0x${string}`;

export const lc = (a: string) => a.toLowerCase() as Hex;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Hex;
export const LAUNCHPAD = lc(getDeployment(process.env).launchpad);
export const POOL_MANAGER = lc(UNISWAP_V4.poolManager);

/** Addresses excluded from holdersCount. */
export const isCountedHolder = (a: string) => {
  const x = a.toLowerCase();
  return x !== ZERO_ADDRESS && x !== LAUNCHPAD && x !== POOL_MANAGER;
};

export const INTERVALS: ReadonlyArray<readonly [Interval, number]> = [
  ["1m", 60],
  ["5m", 300],
  ["15m", 900],
  ["1h", 3_600],
  ["4h", 14_400],
  ["1d", 86_400],
];

export const DAY = 86_400;
export const dayStartOf = (ts: number) => ts - (((ts % DAY) + DAY) % DAY);
export const dayKey = (dayStart: number) => new Date(dayStart * 1000).toISOString().slice(0, 10);

const Q192 = 1n << 192n;
/** v4 pool (currency0 = ETH, currency1 = token): wei per whole token = 1e18 · 2^192 / sqrtPriceX96². */
export const poolPriceWei = (sqrtPriceX96: bigint) =>
  sqrtPriceX96 === 0n ? 0n : (WAD * Q192) / (sqrtPriceX96 * sqrtPriceX96);

/** Market cap in wei from a per-token price (price × 1B tokens). */
export const mcapFromPrice = (priceWei: bigint) => (priceWei * TOTAL_SUPPLY) / WAD;
