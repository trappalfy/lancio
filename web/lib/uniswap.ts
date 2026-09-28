/**
 * Uniswap v4 swap encoding for graduated Lancio pools (native ETH / TOKEN, 1%, tickSpacing 200, Lancio hook).
 *
 * Target: UniversalRouter 2.1.1 on Robinhood Chain (UNISWAP_V4.universalRouter, recorded as UniversalRouterV2_1_1 in
 * Uniswap/universal-router deploy-addresses/robinhood.json). Tag 2.1.1 pins v4-periphery 3231810e, whose
 * IV4Router.ExactInputSingleParams is:
 *   { PoolKey poolKey; bool zeroForOne; uint128 amountIn; uint128 amountOutMinimum; uint256 minHopPriceX36; bytes hookData }
 * (minHopPriceX36 was added to single swaps in v4-periphery #516; routers older than 2.1.1 lack it.)
 */
import { POOL_LP_FEE, POOL_TICK_SPACING, UNISWAP_V4 } from "@lancio/shared";
import { universalRouterAbi } from "@lancio/shared/abi";
import { encodeAbiParameters, encodePacked, keccak256, parseAbi, zeroAddress, type Address, type Hex } from "viem";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

/** Universal Router command. */
export const V4_SWAP = 0x10;
/** v4-periphery Actions. */
export const ACTIONS = {
  SWAP_EXACT_IN_SINGLE: 0x06,
  SETTLE_ALL: 0x0c,
  TAKE_ALL: 0x0f,
} as const;

export const NATIVE_ETH = zeroAddress;
/** Pool fee in pips (1e6 = 100%). */
export const POOL_FEE_PIPS = 1_000_000n;

/** PoolKey of a Lancio pool: currency0 is always native ETH (address 0 sorts first). */
export function lancioPoolKey(token: Address, hook: Address): PoolKey {
  return { currency0: NATIVE_ETH, currency1: token, fee: POOL_LP_FEE, tickSpacing: POOL_TICK_SPACING, hooks: hook };
}

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** PoolId = keccak256(abi.encode(PoolKey)). */
export function poolIdOf(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([{ type: "tuple", components: POOL_KEY_COMPONENTS }], [key]));
}

const EXACT_INPUT_SINGLE_PARAMS = [
  {
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: POOL_KEY_COMPONENTS },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

/**
 * Universal Router `execute` args for an exact-input single-pool swap.
 * Buy (ETH → token): zeroForOne = true, send `amountIn` as msg.value (SETTLE_ALL pays native ETH from the router).
 * Sell (token → ETH): zeroForOne = false, the router pulls the token through Permit2.
 */
export function encodeExactInSingle({
  key,
  zeroForOne,
  amountIn,
  minAmountOut,
  deadline,
}: {
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
}): readonly [Hex, Hex[], bigint] {
  const currencyIn = zeroForOne ? key.currency0 : key.currency1;
  const currencyOut = zeroForOne ? key.currency1 : key.currency0;

  const actions = encodePacked(
    ["uint8", "uint8", "uint8"],
    [ACTIONS.SWAP_EXACT_IN_SINGLE, ACTIONS.SETTLE_ALL, ACTIONS.TAKE_ALL],
  );
  const params: Hex[] = [
    encodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, [
      { poolKey: key, zeroForOne, amountIn, amountOutMinimum: minAmountOut, minHopPriceX36: 0n, hookData: "0x" },
    ]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyIn, amountIn]),
    encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [currencyOut, minAmountOut]),
  ];
  const input = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], [actions, params]);
  const commands = encodePacked(["uint8"], [V4_SWAP]);
  return [commands, [input], deadline] as const;
}

/** Universal Router ABI plus the errors a v4 swap can revert with (so viem decodes them). */
export const routerAbi = [
  ...universalRouterAbi,
  ...parseAbi([
    "error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)",
    "error V4TooLittleReceivedPerHopSingle(uint256 minHopPriceX36, uint256 priceX36)",
    "error V4TooMuchRequested(uint256 maxAmountInRequested, uint256 amountRequested)",
    "error TransactionDeadlinePassed()",
    "error ExecutionFailed(uint256 commandIndex, bytes message)",
    "error AllowanceExpired(uint256 deadline)",
    "error InsufficientAllowance(uint256 amount)",
  ]),
] as const;

/** StateView (read-only pool state). */
export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
]);

export const MAX_UINT160 = (1n << 160n) - 1n;
/** Permit2 allowance lifetime for a sell (the amount is exact, so it is spent by the sell itself). */
export const PERMIT2_EXPIRATION_SECONDS = 30 * 60;

export const UNISWAP = UNISWAP_V4;

const Q192 = 1n << 192n;

/**
 * Price impact of an exact-input swap in bps: shortfall of `amountOut` against the spot price after the pool fee.
 * sqrtPriceX96 is token (currency1) per ETH (currency0).
 */
export function poolImpactBps({
  sqrtPriceX96,
  zeroForOne,
  amountIn,
  amountOut,
  feePips = BigInt(POOL_LP_FEE),
}: {
  sqrtPriceX96: bigint;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOut: bigint;
  feePips?: bigint;
}): number {
  if (sqrtPriceX96 === 0n || amountIn === 0n) return 0;
  const net = (amountIn * (POOL_FEE_PIPS - feePips)) / POOL_FEE_PIPS;
  const p2 = sqrtPriceX96 * sqrtPriceX96;
  const expected = zeroForOne ? (net * p2) / Q192 : (net * Q192) / p2;
  if (expected === 0n || amountOut >= expected) return 0;
  return Number(((expected - amountOut) * 10_000n) / expected);
}
