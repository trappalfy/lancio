import { ponder } from "ponder:registry";
import { pool, token, trade } from "ponder:schema";
import { lc, mcapFromPrice, poolPriceWei } from "./lib/shared";
import { bumpAccount, bumpDaily, maybeLancioPool, upsertCandles } from "./lib/writes";

const PIPS = 1_000_000n;
const abs = (x: bigint) => (x < 0n ? -x : x);

/**
 * Uniswap v4 swaps in graduated Lancio pools (currency0 = native ETH, currency1 = token).
 * Amounts are the swapper's deltas: negative = paid by the swapper, so a token buy has amount0 < 0.
 *
 * ethAmount = |amount0| — ETH paid on a buy (gross, fee included) or ETH received on a sell.
 * feeEth: buy  → ethAmount · fee / 1e6 (the LP fee is taken from the ETH input);
 *         sell → the fee is charged in tokens; its ETH value is approximated from the output as
 *                ethOut · fee / (1e6 − fee), i.e. valued at this swap's average execution price.
 * trader = transaction.from (the router is the PoolManager-level sender).
 */
ponder.on("PoolManager:Swap", async ({ event, context }) => {
  const { db } = context;
  const poolId = lc(event.args.id);
  if (!(await maybeLancioPool(db, poolId))) return;
  const p = await db.find(pool, { poolId });
  if (!p) return;
  const t = await db.find(token, { address: p.token });
  if (!t) return;

  const { amount0, amount1, sqrtPriceX96, fee } = event.args;
  const ethAmount = abs(amount0);
  const tokenAmount = abs(amount1);
  if (ethAmount === 0n && tokenAmount === 0n) return;

  const isBuy = amount0 < 0n;
  const feePips = BigInt(fee);
  const feeEth = isBuy
    ? (ethAmount * feePips) / PIPS
    : feePips < PIPS
      ? (ethAmount * feePips) / (PIPS - feePips)
      : 0n;
  const price = sqrtPriceX96 > 0n ? poolPriceWei(sqrtPriceX96) : t.priceEth;
  const ts = Number(event.block.timestamp);
  const trader = lc(event.transaction.from);

  await db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: t.address,
    trader,
    side: isBuy ? "buy" : "sell",
    ethAmount,
    tokenAmount,
    feeEth,
    priceEth: price,
    source: "pool",
    txHash: event.transaction.hash,
    blockNumber: Number(event.block.number),
    logIndex: event.log.logIndex,
    timestamp: ts,
  });

  await db.update(token, { address: t.address }).set((row) => ({
    priceEth: price,
    mcapEth: mcapFromPrice(price),
    volumeEthAll: row.volumeEthAll + ethAmount,
    tradesCount: row.tradesCount + 1,
    lastTradeAt: ts,
    lastBuyAt: isBuy ? ts : row.lastBuyAt,
  }));

  await bumpAccount(db, trader, { tradesCount: 1 });
  await bumpDaily(db, ts, { volumeEth: ethAmount, poolVolumeEth: ethAmount, trades: 1 });
  await upsertCandles(db, t.address, ts, t.priceEth, price, ethAmount);
});
