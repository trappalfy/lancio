import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { robinhood } from "@lancio/shared";
import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { config } from "./config";

/** Robinhood Chain with the RPC from env (local anvil fork keeps chainId 4663). */
export const appChain = defineChain({
  ...robinhood,
  id: config.chainId,
  rpcUrls: { default: { http: [config.rpcUrl] } },
});

const transports = { [appChain.id]: http(config.rpcUrl) };

/**
 * With NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID → RainbowKit defaults (injected + WalletConnect wallets).
 * Without it → injected browser wallets only (EIP-6963 discovery still lists every installed wallet).
 */
export const wagmiConfig = config.walletConnectProjectId
  ? getDefaultConfig({
      appName: "Lancio",
      appUrl: config.siteUrl,
      projectId: config.walletConnectProjectId,
      chains: [appChain],
      transports,
      ssr: true,
    })
  : createConfig({
      chains: [appChain],
      transports,
      ssr: true,
      connectors: connectorsForWallets([{ groupName: "Browser wallet", wallets: [injectedWallet] }], {
        appName: "Lancio",
        projectId: "lancio-injected-only",
      }),
    });

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
