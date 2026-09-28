import type { Address } from "viem";

/** Official Uniswap v4 deployment on Robinhood Chain (developers.uniswap.org, verified onchain 2026-09-27). */
export const UNISWAP_V4 = {
  poolManager: "0x8366a39cc670b4001a1121b8f6a443a643e40951",
  positionManager: "0x58daec3116aae6d93017baaea7749052e8a04fa7",
  quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94",
  stateView: "0xf3334192d15450cdd385c8b70e03f9a6bd9e673b",
  universalRouter: "0x8876789976decbfcbbbe364623c63652db8c0904",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
} as const satisfies Record<string, Address>;

export type LancioDeployment = {
  launchpad: Address;
  locker: Address;
  hook: Address;
  /** Block the launchpad was deployed at (indexer start block). */
  startBlock: number;
};

/**
 * Lancio contract addresses per environment.
 * `local` is filled by contracts/script/DeployLocal (anvil fork); `mainnet` after the owner-approved deploy.
 * Env overrides (NEXT_PUBLIC_LAUNCHPAD etc.) take precedence — see getDeployment().
 */
export const DEPLOYMENTS: Record<"local" | "mainnet", LancioDeployment | null> = {
  local: null,
  mainnet: null,
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export function getDeployment(env: Record<string, string | undefined> = {}): LancioDeployment {
  const fromEnv =
    env.NEXT_PUBLIC_LAUNCHPAD || env.LAUNCHPAD_ADDRESS
      ? {
          launchpad: (env.NEXT_PUBLIC_LAUNCHPAD || env.LAUNCHPAD_ADDRESS) as Address,
          locker: (env.NEXT_PUBLIC_LOCKER || env.LOCKER_ADDRESS || ZERO) as Address,
          hook: (env.NEXT_PUBLIC_HOOK || env.HOOK_ADDRESS || ZERO) as Address,
          startBlock: Number(env.NEXT_PUBLIC_START_BLOCK || env.START_BLOCK || 0),
        }
      : null;
  return fromEnv ?? DEPLOYMENTS.mainnet ?? DEPLOYMENTS.local ?? { launchpad: ZERO, locker: ZERO, hook: ZERO, startBlock: 0 };
}
