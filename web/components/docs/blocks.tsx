/**
 * Building blocks for docs MDX (content/docs/*.mdx). Server components only.
 * Protocol numbers come from @lancio/shared — never typed in by hand here.
 */
import {
  BPS,
  CURVE_SUPPLY,
  EXPLORER_URL,
  GRADUATION_ETH,
  INITIAL_CURVE,
  K,
  PARAMS,
  TRADE_FEE_BPS,
  UNISWAP_V4,
  VIRTUAL_ETH_END,
  VIRTUAL_TOKEN_0,
  VIRTUAL_TOKEN_END,
  WAD,
  ceilDiv,
  explorerAddress,
  formatEth,
  formatTokens,
  mcapWeiOf,
  priceWeiOf,
  quoteBuy,
  realEthOf,
  splitFee,
  type CurveState,
} from "@lancio/shared";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { zeroAddress } from "viem";
import { CopyButton } from "@/components/common/CopyButton";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { pctOfBps } from "./registry";

/* ------------------------------------------------------------------ layout blocks */

/** Highlighted note. Markdown inside works when separated by blank lines. */
export function Callout({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <aside className="my-8 rounded-card border border-border bg-surface-2 px-5 py-4 md:px-6 md:py-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
      {title && <p className="text-sm font-semibold text-accent-text">{title}</p>}
      <div className="text-base leading-7 text-text/90">{children}</div>
    </aside>
  );
}

/** Diagram / image with caption (unfiltered — for charts, not paintings). */
export function Figure({ src, alt, width, height, caption }: { src: string; alt: string; width: number; height: number; caption?: ReactNode }) {
  return (
    <figure className="my-8">
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 1024px) 768px, 100vw"
        className="h-auto w-full rounded-card border border-border"
      />
      {caption && <figcaption className="mt-3 text-sm leading-6 text-muted">{caption}</figcaption>}
    </figure>
  );
}

/** Label / value rows in a framed list. */
export function Facts({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("my-6 divide-y divide-border rounded-card border border-border", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 md:px-5">
          <dt className="text-sm text-muted">{k}</dt>
          <dd className="text-sm font-medium text-text sm:text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Simple table (MDX has no GFM tables here). */
export function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn("whitespace-nowrap border-b border-border px-4 py-3 font-medium text-muted", i === 0 ? "text-left" : "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn("px-4 py-3", j === 0 ? "text-left text-text" : "whitespace-nowrap text-right font-medium text-text")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** FAQ entry: native <details>, no client JS. */
export function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group border-b border-border last:border-0 [&_p]:my-2 [&_p]:text-sm [&_p]:leading-6 [&_p]:text-muted">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-medium text-text [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pb-4 text-sm leading-6 text-muted">{children}</div>
    </details>
  );
}

export function QuestionList({ children }: { children: ReactNode }) {
  return <div className="my-6 rounded-card border border-border px-4 md:px-5">{children}</div>;
}

/* ------------------------------------------------------------------ protocol numbers */

const tokens = (units: bigint) => `${formatTokens(units)} tokens`;

/** Every rule on one card (docs index). */
export function RulesTable() {
  return (
    <Facts
      rows={[
        ["Supply per token", `${PARAMS.supply}, minted once`],
        ["Sold on the curve", PARAMS.curveSupply],
        ["Held for the pool", PARAMS.poolReserve],
        ["Presale, team share, allocations", "None"],
        ["Curve", `x · y = k from virtual ${PARAMS.virtualReserves}`],
        ["Launch window", `Max ${PARAMS.launchCapPct} of supply per wallet, ${PARAMS.launchWindow}`],
        ["Graduation", `At ${PARAMS.graduationEth} ETH raised`],
        ["Pool opens at", PARAMS.poolOpenPrice],
        ["Pool liquidity", "Locked forever"],
        ["Fee on the curve", `${pctOfBps(TRADE_FEE_BPS)} per trade: ${PARAMS.creatorFeePct} creator, ${PARAMS.protocolFeePct} Lancio`],
        ["Pool fees after graduation", `Split ${PARAMS.poolSplit} creator / Lancio`],
        ["Launch fee", `${PARAMS.launchFeeEth} ETH, gas only`],
      ]}
    />
  );
}

/** Curve state after `sold` tokens have left the curve (no fees — reserves only). */
function stateAtSold(sold: bigint): CurveState {
  const vTok = VIRTUAL_TOKEN_0 - sold;
  return { vTok, vEth: ceilDiv(K, vTok) };
}

/** The article's control numbers, computed from the shared curve math. */
export function ControlNumbers() {
  const first = 100_000_000n * WAD;
  const last = 200_000_000n * WAD;
  const full: CurveState = { vEth: VIRTUAL_ETH_END, vTok: VIRTUAL_TOKEN_END };
  const firstCost = realEthOf(stateAtSold(first));
  const lastCost = GRADUATION_ETH - realEthOf(stateAtSold(CURVE_SUPPLY - last));
  const priceRise = Number((priceWeiOf(full) * 100n) / priceWeiOf(INITIAL_CURVE)) / 100;
  return (
    <Facts
      rows={[
        [`First ${tokens(first)} cost`, `≈ ${formatEth(firstCost)}`],
        [`Last ${tokens(last)} cost`, `≈ ${formatEth(lastCost)}`],
        ["Market cap at the first trade", `≈ ${formatEth(mcapWeiOf(INITIAL_CURVE))}`],
        ["Market cap when the curve is full", `≈ ${formatEth(mcapWeiOf(full))}`],
        ["Last curve price vs first", `≈ ${priceRise.toFixed(1)}×`],
        ["ETH raised when the curve is full", formatEth(realEthOf(full))],
      ]}
    />
  );
}

/** What the pool looks like at graduation. */
export function PoolParams() {
  return (
    <Facts
      rows={[
        ["Venue", "Uniswap v4 on Robinhood Chain"],
        ["Pair", "ETH / token"],
        ["Liquidity added", `${PARAMS.graduationEth} ETH + ${PARAMS.poolReserve} tokens`],
        ["Price range", "Full range"],
        ["Opening price", PARAMS.poolOpenPrice],
        ["Last curve price", PARAMS.lastCurvePrice],
        ["Pool fee", `${PARAMS.poolFeePct} per swap, fixed`],
        ["Who can open the pool", "Only the Lancio locker (enforced by a hook)"],
      ]}
    />
  );
}

/** Fee examples: graduating on buys alone, and the article's 40 ETH example. */
export function FeeExamples() {
  const fee = (volume: bigint) => splitFee((volume * TRADE_FEE_BPS) / BPS);
  // Smallest buy volume that completes the curve: the graduating quote from an untouched curve.
  const grad = quoteBuy(INITIAL_CURVE, GRADUATION_ETH * 2n);
  const gradSplit = splitFee(grad.fee);
  const big = 40n * WAD;
  const bigSplit = fee(big);
  return (
    <Table
      head={["Before graduation", "Volume", "Creator", "Lancio"]}
      rows={[
        ["Graduates on buys alone", `≈ ${formatEth(grad.ethUsed)}`, `≈ ${formatEth(gradSplit.creatorFee)}`, `≈ ${formatEth(gradSplit.protocolFee)}`],
        [`${formatEth(big)} of trading`, formatEth(big), formatEth(bigSplit.creatorFee), formatEth(bigSplit.protocolFee)],
      ]}
    />
  );
}

/* ------------------------------------------------------------------ contracts */

type ContractRow = { name: string; role: string; address: string };

const LANCIO_CONTRACTS: ContractRow[] = [
  { name: "LancioLaunchpad", role: "Creates tokens, runs every curve and keeps the fee balances.", address: config.deployment.launchpad },
  { name: "LancioLocker", role: "Owns every graduated pool position. It can only collect fees.", address: config.deployment.locker },
  { name: "LancioHook", role: "Uniswap v4 hook. Lets only the locker open a Lancio pool.", address: config.deployment.hook },
];

const UNISWAP_CONTRACTS: ContractRow[] = [
  { name: "PoolManager", role: "Holds every Uniswap v4 pool, including Lancio's.", address: UNISWAP_V4.poolManager },
  { name: "Universal Router", role: "Executes swaps in graduated pools.", address: UNISWAP_V4.universalRouter },
  { name: "V4 Quoter", role: "Quotes pool swaps before you sign.", address: UNISWAP_V4.quoter },
  { name: "StateView", role: "Reads pool prices and liquidity.", address: UNISWAP_V4.stateView },
  { name: "Permit2", role: "Token approvals for selling into a pool.", address: UNISWAP_V4.permit2 },
];

/** Contract addresses with Blockscout links. Lancio addresses come from config (env). */
export function ContractList({ group }: { group: "lancio" | "uniswap" }) {
  const rows = group === "lancio" ? LANCIO_CONTRACTS : UNISWAP_CONTRACTS;
  return (
    <ul className="my-6 divide-y divide-border rounded-card border border-border">
      {rows.map((c) => {
        const deployed = c.address.toLowerCase() !== zeroAddress;
        return (
          <li key={c.name} className="flex flex-col gap-2 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-base font-medium text-text">{c.name}</span>
              {deployed && (
                <a
                  href={explorerAddress(c.address)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent-text hover:underline underline-offset-4"
                >
                  Blockscout <ArrowUpRight size={14} aria-hidden />
                </a>
              )}
            </div>
            <p className="text-sm text-muted">{c.role}</p>
            {deployed ? (
              <div className="flex items-center gap-1">
                <code className="break-all font-mono text-13 text-text">{c.address}</code>
                <CopyButton value={c.address} label={`Copy ${c.name} address`} className="shrink-0" />
              </div>
            ) : (
              <p className="text-sm text-muted">Published here once the contracts are deployed.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Chain line under the contract lists. */
export function ChainInfo() {
  return (
    <Facts
      rows={[
        ["Network", "Robinhood Chain"],
        ["Chain ID", String(config.chainId)],
        [
          "Explorer",
          <a key="x" href={EXPLORER_URL} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4 hover:no-underline">
            {EXPLORER_URL.replace(/^https:\/\//, "")}
          </a>,
        ],
      ]}
    />
  );
}
