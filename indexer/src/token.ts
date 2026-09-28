import { ponder } from "ponder:registry";
import { holder, token } from "ponder:schema";
import { isCountedHolder, lc, ZERO_ADDRESS, type Hex } from "./lib/shared";

/** Holder balances for every Lancio token (factory children of the launchpad). */
ponder.on("LancioToken:Transfer", async ({ event, context }) => {
  const { db } = context;
  const { value } = event.args;
  if (value === 0n) return;
  const tokenAddr = lc(event.log.address);
  const from = lc(event.args.from);
  const to = lc(event.args.to);
  let delta = 0;

  const apply = async (account: Hex, change: bigint) => {
    const prev = (await db.find(holder, { token: tokenAddr, account }))?.balance ?? 0n;
    const next = prev + change;
    await db.insert(holder).values({ token: tokenAddr, account, balance: next }).onConflictDoUpdate({ balance: next });
    if (isCountedHolder(account)) {
      if (prev <= 0n && next > 0n) delta++;
      else if (prev > 0n && next <= 0n) delta--;
    }
  };

  if (from !== ZERO_ADDRESS) await apply(from, -value);
  if (to !== ZERO_ADDRESS) await apply(to, value);

  // The constructor mint is seen before TokenCreated (row missing); it only moves launchpad/zero, never counted.
  if (delta !== 0 && (await db.find(token, { address: tokenAddr }))) {
    await db.update(token, { address: tokenAddr }).set((row) => ({ holdersCount: row.holdersCount + delta }));
  }
});
