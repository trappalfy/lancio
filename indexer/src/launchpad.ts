import { ponder } from "ponder:registry";
import { account, holder, pool, token, trade } from "ponder:schema";
import {
  INITIAL_CURVE,
  mcapWeiOf,
  POOL_SQRT_PRICE_X96,
  priceWeiOf,
  progressBpsOf,
  splitFee,
} from "@lancio/shared";
import { fetchMetadata } from "./lib/metadata";
import { isCountedHolder, lc, mcapFromPrice, poolPriceWei } from "./lib/shared";
import { bumpAccount, bumpDaily, rememberPool, upsertCandles } from "./lib/writes";

ponder.on("LancioLaunchpad:TokenCreated", async ({ event, context }) => {
  const { db } = context;
  const address = lc(event.args.token);
  const creator = lc(event.args.creator);
  const ts = Number(event.block.timestamp);

  const meta = await fetchMetadata(event.args.metadataURI);

  // The token's constructor mint (and, depending on emit order, the dev buy) is indexed before this
  // event. The only non-excluded address that can already hold tokens here is the creator.
  const creatorHolding = await db.find(holder, { token: address, account: creator });
  const holdersCount = creatorHolding && creatorHolding.balance > 0n && isCountedHolder(creator) ? 1 : 0;

  await db.insert(token).values({
    address,
    name: event.args.name,
    symbol: event.args.symbol,
    creator,
    createdAt: ts,
    createdBlock: Number(event.args.createdBlock),
    createdTx: event.transaction.hash,
    status: "curve",
    metadataUri: event.args.metadataURI,
    ...meta,
    vEth: INITIAL_CURVE.vEth,
    vTok: INITIAL_CURVE.vTok,
    realEth: 0n,
    progressBps: 0,
    priceEth: priceWeiOf(INITIAL_CURVE),
    mcapEth: mcapWeiOf(INITIAL_CURVE),
    volumeEthAll: 0n,
    tradesCount: 0,
    holdersCount,
    lastBuyAt: null,
    lastTradeAt: null,
    graduatedAt: null,
    poolId: null,
    creatorFeesAccruedEth: 0n,
    creatorFeesClaimedEth: 0n,
    poolTokenFeesCreator: 0n,
    poolTokenFeesProtocol: 0n,
  });

  const prev = await db.find(account, { address: creator });
  await bumpAccount(db, creator, { createdCount: 1 });
  await bumpDaily(db, ts, { launches: 1, newCreators: prev && prev.createdCount > 0 ? 0 : 1 });
});

ponder.on("LancioLaunchpad:Trade", async ({ event, context }) => {
  const { db } = context;
  const address = lc(event.args.token);
  const t = await db.find(token, { address });
  if (!t) {
    // Curve trades always follow TokenCreated (contract emits TokenCreated before the dev buy).
    throw new Error(`Trade for unknown token ${address} in tx ${event.transaction.hash}`);
  }

  const { isBuy, ethAmount, tokenAmount, fee, vEth, vTok, realEth } = event.args;
  const ts = Number(event.block.timestamp);
  const trader = lc(event.args.trader);
  const state = { vEth, vTok };
  const price = priceWeiOf(state);
  const { creatorFee, protocolFee } = splitFee(fee);

  await db.insert(trade).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    token: address,
    trader,
    side: isBuy ? "buy" : "sell",
    ethAmount,
    tokenAmount,
    feeEth: fee,
    priceEth: price,
    source: "curve",
    txHash: event.transaction.hash,
    blockNumber: Number(event.block.number),
    logIndex: event.log.logIndex,
    timestamp: ts,
  });

  await db.update(token, { address }).set((row) => ({
    vEth,
    vTok,
    realEth,
    progressBps: Math.min(10_000, Math.max(0, progressBpsOf(state))),
    priceEth: price,
    mcapEth: mcapWeiOf(state),
    volumeEthAll: row.volumeEthAll + ethAmount,
    tradesCount: row.tradesCount + 1,
    lastTradeAt: ts,
    lastBuyAt: isBuy ? ts : row.lastBuyAt,
    creatorFeesAccruedEth: row.creatorFeesAccruedEth + creatorFee,
  }));

  if (creatorFee > 0n) await bumpAccount(db, t.creator, { creatorFeesAccruedEth: creatorFee });
  await bumpAccount(db, trader, { tradesCount: 1 });
  await bumpDaily(db, ts, {
    volumeEth: ethAmount,
    curveVolumeEth: ethAmount,
    trades: 1,
    curveCreatorsEth: creatorFee,
    curveProtocolEth: protocolFee,
  });
  await upsertCandles(db, address, ts, t.priceEth, price, ethAmount);
});

ponder.on("LancioLaunchpad:Graduated", async ({ event, context }) => {
  const { db } = context;
  const address = lc(event.args.token);
  const poolId = lc(event.args.poolId);
  const ts = Number(event.block.timestamp);
  // The pool opens at a fixed price (POOL_SQRT_PRICE_X96 = 4e-8 ETH/token); swaps move it from there.
  const price = poolPriceWei(POOL_SQRT_PRICE_X96);

  await db
    .insert(pool)
    .values({
      poolId,
      token: address,
      liquidity: event.args.liquidity,
      ethIn: event.args.ethIn,
      tokensIn: event.args.tokensIn,
      createdAt: ts,
    })
    .onConflictDoNothing();
  rememberPool(poolId);

  await db.update(token, { address }).set({
    status: "graduated",
    graduatedAt: ts,
    poolId,
    progressBps: 10_000,
    priceEth: price,
    mcapEth: mcapFromPrice(price),
  });

  await bumpDaily(db, ts, { graduations: 1, lockedLiquidityEth: event.args.ethIn });
});

ponder.on("LancioLaunchpad:CreatorFeesClaimed", async ({ event, context }) => {
  const { db } = context;
  const { amount } = event.args;
  await db
    .update(token, { address: lc(event.args.token) })
    .set((row) => ({ creatorFeesClaimedEth: row.creatorFeesClaimedEth + amount }));
  await bumpAccount(db, lc(event.args.creator), { creatorFeesClaimedEth: amount });
});

ponder.on("LancioLaunchpad:CreatorTransferred", async ({ event, context }) => {
  await context.db.update(token, { address: lc(event.args.token) }).set({ creator: lc(event.args.to) });
});

/** ETH side of pool fees, credited to pull balances 50/50 (the locker calls depositPoolFees). */
ponder.on("LancioLaunchpad:PoolFeesDeposited", async ({ event, context }) => {
  const { db } = context;
  const { creatorEth, protocolEth } = event.args;
  const t = await db
    .update(token, { address: lc(event.args.token) })
    .set((row) => ({ creatorFeesAccruedEth: row.creatorFeesAccruedEth + creatorEth }));
  if (creatorEth > 0n) await bumpAccount(db, t.creator, { creatorFeesAccruedEth: creatorEth });
  await bumpDaily(db, Number(event.block.timestamp), { poolCreatorsEth: creatorEth, poolProtocolEth: protocolEth });
});

ponder.on("LancioLaunchpad:ProtocolFeesClaimed", async ({ event, context }) => {
  await bumpDaily(context.db, Number(event.block.timestamp), { protocolClaimedEth: event.args.amount });
});
