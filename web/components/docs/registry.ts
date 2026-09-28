import { PARAMS, TRADE_FEE_BPS } from "@lancio/shared";
import type { MDXContent } from "mdx/types";

/** "1%" from basis points. */
export const pctOfBps = (bps: bigint | number) => `${Number(bps) / 100}%`;

export type DocImage = { src: string; alt: string };

export type DocEntry = {
  /** "" is the docs index (/docs). */
  slug: string;
  title: string;
  /** One line under the title; also the page's meta description. */
  summary: string;
  /** Painting shown under the title (docs are one of the few places paintings appear). */
  image?: DocImage;
  load: () => Promise<{ default: MDXContent }>;
};

/** Docs in sidebar order. Text source of truth: lancio-brand/article/article-every-legend-was-launched.txt. */
export const DOCS: DocEntry[] = [
  {
    slug: "",
    title: "How Lancio works",
    summary: "One supply, one curve, the same rules for every token. Written into the contracts before the first one shipped.",
    image: { src: "/brand/painting-arsenale-launch-full.png", alt: "A galley sliding down the slipway of the Venetian Arsenale into the lagoon" },
    load: () => import("@/content/docs/how-lancio-works.mdx"),
  },
  {
    slug: "the-curve",
    title: "The curve",
    summary: "Price follows a constant-product curve. Every buy moves it up, every sell moves it down, and there is no order book to game.",
    load: () => import("@/content/docs/the-curve.mdx"),
  },
  {
    slug: "launch-window",
    title: "Launch window",
    summary: `For the ${PARAMS.launchWindow} after a token is created, no wallet can buy more than ${PARAMS.launchCapPct} of the supply.`,
    image: { src: "/brand/painting-gate.png", alt: "A crowd waiting at a closed city gate while three men pass through a side door" },
    load: () => import("@/content/docs/launch-window.mdx"),
  },
  {
    slug: "graduation",
    title: "Graduation",
    summary: `When the curve has raised ${PARAMS.graduationEth} ETH, it closes. In the same transaction, all ${PARAMS.graduationEth} ETH and the ${PARAMS.poolReserve} reserved tokens go into a pool.`,
    load: () => import("@/content/docs/graduation.mdx"),
  },
  {
    slug: "liquidity-lock",
    title: "Liquidity lock",
    summary: "The pool position sits in a contract that can do one thing: collect trading fees. It has no withdraw function and cannot be upgraded.",
    image: { src: "/brand/painting-key.png", alt: "A hand dropping a key into the lagoon above a locked chest" },
    load: () => import("@/content/docs/liquidity-lock.mdx"),
  },
  {
    slug: "fees",
    title: "Fees",
    summary: `Every trade on the curve pays ${pctOfBps(TRADE_FEE_BPS)}. After graduation, the locked position keeps earning the pool's fees, split ${PARAMS.poolSplit}.`,
    image: { src: "/brand/painting-colleganza.png", alt: "Two merchants signing a contract by candlelight" },
    load: () => import("@/content/docs/fees.mdx"),
  },
  {
    slug: "contracts",
    title: "Contracts",
    summary: "Addresses, verified source, and the exact powers of the owner.",
    load: () => import("@/content/docs/contracts.mdx"),
  },
  {
    slug: "risks",
    title: "Risks",
    summary: "What the rules protect, and what they do not.",
    load: () => import("@/content/docs/risks.mdx"),
  },
  {
    slug: "faq",
    title: "FAQ",
    summary: "Short answers to the questions people ask first.",
    load: () => import("@/content/docs/faq.mdx"),
  },
];

export const docHref = (slug: string) => (slug ? `/docs/${slug}` : "/docs");

export function getDoc(slug: string) {
  const i = DOCS.findIndex((d) => d.slug === slug);
  if (i === -1) return null;
  return { doc: DOCS[i], index: i, prev: DOCS[i - 1] ?? null, next: DOCS[i + 1] ?? null };
}
