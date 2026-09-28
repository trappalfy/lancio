/** Protocol constants — must mirror contracts/src/LancioConstants.sol exactly. */
export const DECIMALS = 18;
export const WAD = 10n ** 18n;

export const TOTAL_SUPPLY = 1_000_000_000n * WAD;
export const CURVE_SUPPLY = 800_000_000n * WAD;
export const POOL_RESERVE = 200_000_000n * WAD;

export const VIRTUAL_ETH_0 = 2_730_000_000_000_000_000n; // 2.73 ETH
export const VIRTUAL_TOKEN_0 = 1_073_000_000n * WAD;
export const K = VIRTUAL_ETH_0 * VIRTUAL_TOKEN_0;
/** vTok when the curve is sold out (1.073B − 800M = 273M). */
export const VIRTUAL_TOKEN_END = VIRTUAL_TOKEN_0 - CURVE_SUPPLY;
/** vEth when the curve is sold out: k / 273M = 10.73 ETH exactly. */
export const VIRTUAL_ETH_END = K / VIRTUAL_TOKEN_END;

export const GRADUATION_ETH = 8n * WAD;

export const BPS = 10_000n;
export const TRADE_FEE_BPS = 100n; // 1.00%
export const CREATOR_FEE_SHARE = 60n; // of 100 parts of the fee → 0.60% of trade
export const PROTOCOL_FEE_SHARE = 40n; // → 0.40% of trade
export const POOL_SPLIT_BPS = 5_000n; // 50/50 after graduation

export const LAUNCH_CAP = 10_000_000n * WAD; // 1% of supply per wallet
export const LAUNCH_WINDOW_BLOCKS = 2n; // creation block + next (Robinhood Chain blocks)
export const LAUNCH_FEE = 0n;

/** Uniswap v4 pool parameters after graduation. */
export const POOL_LP_FEE = 10_000; // 1% in pips
export const POOL_TICK_SPACING = 200;
export const POOL_SQRT_PRICE_X96 = 5000n << 96n; // 25,000,000 tokens per ETH
export const POOL_OPEN_PRICE_ETH = 0.00000004; // display only

/** Human-readable parameter table (UI, docs, OG). */
export const PARAMS = {
  supply: "1,000,000,000",
  curveSupply: "800,000,000",
  poolReserve: "200,000,000",
  graduationEth: "8",
  tradeFeePct: "1.00%",
  creatorFeePct: "0.6%",
  protocolFeePct: "0.4%",
  poolSplit: "50/50",
  poolFeePct: "1%",
  launchCapPct: "1%",
  launchWindow: "first 2 blocks",
  launchWindowBlocks: 2,
  launchFeeEth: "0",
  virtualReserves: "2.73 ETH / 1,073,000,000 tokens",
  poolOpenPrice: "0.00000004 ETH",
  lastCurvePrice: "≈ 0.0000000393 ETH",
  mcapRange: "≈ 2.5 ETH → 39.3 ETH",
} as const;

export const TOKEN_LIMITS = {
  nameMax: 32,
  symbolMax: 10,
  descriptionMax: 280,
  imageMaxBytes: 4 * 1024 * 1024,
  imageTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
} as const;
