/**
 * UI copy in Lancio's voice: calm, exact, short. No emoji, no hype, no "safe"/"guaranteed".
 * All strings are written in Lancio's own voice (owner decision 2026-09-27).
 */
import { PARAMS } from "./constants";

export const COPY = {
  hero: {
    eyebrow: "TOKEN LAUNCHPAD · ROBINHOOD CHAIN",
    title: "EVERY LEGEND WAS LAUNCHED",
    subline: "One supply, one curve, the same rules for every token. Liquidity locked forever.",
    ctaLaunch: "Launch a token",
    ctaExplore: "Explore tokens",
    facts: ["1,000,000,000 supply", "No allocations", `Graduates at ${PARAMS.graduationEth} ETH`, "Liquidity locked forever"],
  },
  graduated: {
    title: "Graduated",
    subtitle: `Raised ${PARAMS.graduationEth} ETH on the curve. Now trading in a locked pool.`,
    empty: "No legend has graduated yet. The first one is still on the ramp.",
    badgeTooltip: "This token cleared the curve. Its liquidity is locked forever.",
    showAll: "Show all",
  },
  explore: {
    title: "Explore",
    subtitle: `Still on the ramp. Each token graduates when its curve raises ${PARAMS.graduationEth} ETH.`,
    empty: "No tokens yet. Be the first to launch.",
    searchPlaceholder: "Search tokens",
  },
  create: {
    title: "Launch token",
    pairedHelper: `The curve closes at ${PARAMS.graduationEth} ETH and the pool opens in the same transaction.`,
    devBuyHelper: (balance: string) => `${balance} in wallet. Filled at the curve price as part of the launch.`,
    devBuyCapHint: `Launch window: max ${PARAMS.launchCapPct} of supply per wallet.`,
    summary: (fee: string) => `ETH pair · ${fee} ETH launch fee + gas`,
    needDetails: "Add a name and ticker",
    success: "Launched. Your token is live.",
    previewEmptyName: "Your token",
    previewEmptyTicker: "ticker",
  },
  forum: {
    title: "Forum",
    subtitle: "A room for every launch. The liveliest threads rise first.",
    sidebarTitle: "Largest by market cap",
    sidebarSearch: "Ticker, name or address",
    sidebarLink: "Open Explore",
  },
  analytics: {
    title: "Protocol analytics",
    subtitle: "Every Lancio market on Robinhood Chain, read from onchain events.",
    footnote: "Figures come from Lancio's indexer of onchain events. The 24h view covers the last full UTC day.",
    chartSubtitle: "Last 14 UTC days. The most recent full day is in gold.",
    emptyChart: "The first day of data appears after the first UTC day closes.",
    empty: "No launches yet. The figures fill in with the first token.",
  },
  token: {
    waitingFirstTrade: "Waiting for the first trade.",
    graduatesWarning: "This buy completes the curve and graduates the token.",
    launchWindow: (blocksLeft: number) =>
      `Launch window: max ${PARAMS.launchCapPct} of supply per wallet for ${blocksLeft} more ${blocksLeft === 1 ? "block" : "blocks"}.`,
    graduatedPlate: "Graduated · liquidity locked forever",
  },
  profile: {
    empty: "Nothing launched yet.",
  },
  notFound: "This page was never launched.",
  footer: {
    description:
      "A token launchpad on Robinhood Chain. Every token follows the same rules: one supply, one curve, liquidity locked for good. You sign every transaction, and no admin key can move your funds.",
    riskTitle: "Risk notice",
    risk:
      "You sign every transaction yourself, and a confirmed transaction cannot be undone. Tokens here are launched by their users, not by Lancio, and can lose all of their value. Nothing on this site is custody, a guarantee, or financial advice.",
  },
  errors: {
    SlippageExceeded: "Price moved. Try again or raise slippage.",
    LaunchCapExceeded: `Launch window: max ${PARAMS.launchCapPct} of supply per wallet.`,
    CurveClosed: "This token has graduated. Trading moved to the pool.",
    InsufficientEth: "Not enough ETH (including gas).",
    DeadlineExpired: "The transaction waited too long. Try again.",
    CreationPaused: "New launches are paused for now.",
    UserRejected: "Signature declined in wallet.",
  },
  og: ["EVERY LEGEND WAS LAUNCHED", "THE RULES CAME FIRST"],
  audit: "The contracts are open source and verified, but have not been externally audited.",
} as const;
