import { getDeployment, robinhood } from "@lancio/shared";

/**
 * Runtime config. Every NEXT_PUBLIC_* var is read literally (process.env.NEXT_PUBLIC_X) —
 * Next.js only inlines literal accesses into the client bundle. Do not refactor into a loop.
 */
const bannerId = process.env.NEXT_PUBLIC_BANNER_ID || "";
const bannerTitle = process.env.NEXT_PUBLIC_BANNER_TITLE || "";
const bannerText = process.env.NEXT_PUBLIC_BANNER_TEXT || "";
const useMocks = process.env.NEXT_PUBLIC_USE_MOCKS === "true";
const deployment = getDeployment({
  NEXT_PUBLIC_LAUNCHPAD: process.env.NEXT_PUBLIC_LAUNCHPAD,
  NEXT_PUBLIC_LOCKER: process.env.NEXT_PUBLIC_LOCKER,
  NEXT_PUBLIC_HOOK: process.env.NEXT_PUBLIC_HOOK,
  NEXT_PUBLIC_START_BLOCK: process.env.NEXT_PUBLIC_START_BLOCK,
});

export const config = {
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || robinhood.id),
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || robinhood.rpcUrls.default.http[0],
  indexerUrl: (process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:42069").replace(/\/+$/, ""),
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  /** X handle without "@", "" when not configured. */
  xHandle: (process.env.NEXT_PUBLIC_X_HANDLE || "").replace(/^@/, ""),
  useMocks,
  /**
   * Contracts not deployed yet (no launchpad address) and no mocks: nothing can exist onchain, so the data layer
   * answers locally with empty lists and zero stats instead of calling an indexer that is not running (lib/prelaunch.ts).
   */
  prelaunch: !useMocks && /^0x0{40}$/.test(deployment.launchpad),
  heroLiveStats: process.env.NEXT_PUBLIC_HERO_LIVE_STATS === "true",
  /** null when the banner is off (no title and no text). */
  banner: bannerTitle || bannerText ? { id: bannerId || `${bannerTitle}|${bannerText}`, title: bannerTitle, text: bannerText } : null,
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
  ipfsGateway: process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
  deployment,
} as const;

export type AppConfig = typeof config;
