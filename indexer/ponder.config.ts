import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";
import { getDeployment, UNISWAP_V4 } from "@lancio/shared";
import { launchpadAbi, lockerAbi, poolManagerAbi, tokenAbi } from "@lancio/shared/abi";

/**
 * Addresses + start block come from env (LAUNCHPAD_ADDRESS, LOCKER_ADDRESS, HOOK_ADDRESS, START_BLOCK),
 * see indexer/.env.local.example. Robinhood Chain mainnet = 4663; the local anvil fork keeps 4663.
 */
const deployment = getDeployment(process.env);
const startBlock = deployment.startBlock;

if (/^0x0{40}$/i.test(deployment.launchpad)) {
  console.warn("[lancio-indexer] LAUNCHPAD_ADDRESS is not set — nothing will be indexed.");
}

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite" },
  chains: {
    robinhood: {
      id: 4663,
      rpc: process.env.PONDER_RPC_URL_4663 ?? "http://127.0.0.1:8545",
    },
  },
  contracts: {
    LancioLaunchpad: {
      chain: "robinhood",
      abi: launchpadAbi,
      address: deployment.launchpad,
      startBlock,
    },
    LancioLocker: {
      chain: "robinhood",
      abi: lockerAbi,
      address: deployment.locker,
      startBlock,
    },
    LancioToken: {
      chain: "robinhood",
      abi: tokenAbi,
      address: factory({
        address: deployment.launchpad,
        event: getAbiItem({ abi: launchpadAbi, name: "TokenCreated" }),
        parameter: "token",
      }),
      startBlock,
    },
    // All v4 swaps from START_BLOCK; handlers keep only graduated Lancio pools.
    PoolManager: {
      chain: "robinhood",
      abi: poolManagerAbi,
      address: UNISWAP_V4.poolManager,
      startBlock,
    },
  },
});
