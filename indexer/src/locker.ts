import { ponder } from "ponder:registry";
import { token } from "ponder:schema";
import { lc } from "./lib/shared";

/**
 * Locker fee collection. The ETH part is also reported by the launchpad's PoolFeesDeposited
 * (that is where it is credited), so only the token-side payout is recorded here.
 */
ponder.on("LancioLocker:PoolFeesCollected", async ({ event, context }) => {
  const { tokenToCreator, tokenToProtocol } = event.args;
  if (tokenToCreator === 0n && tokenToProtocol === 0n) return;
  await context.db.update(token, { address: lc(event.args.token) }).set((row) => ({
    poolTokenFeesCreator: row.poolTokenFeesCreator + tokenToCreator,
    poolTokenFeesProtocol: row.poolTokenFeesProtocol + tokenToProtocol,
  }));
});
