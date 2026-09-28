/** Display formatters (brief §12). Inputs in wei are bigint or decimal strings. */
import { formatUnits } from "viem";

const toBig = (v: bigint | string | number) => (typeof v === "bigint" ? v : BigInt(v));
const SUB = "₀₁₂₃₄₅₆₇₈₉";

/** Plain number with up to `sig` significant digits, no exponent. */
export function sig(n: number, digits = 4): string {
  if (!isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1) {
    const intDigits = Math.floor(Math.log10(abs)) + 1;
    const decimals = Math.max(0, digits - intDigits);
    return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
  }
  return Number(n.toPrecision(digits)).toString();
}

/** ETH amount with ≤4 significant digits: "0.02594 ETH", "8 ETH", "1,234 ETH". */
export function formatEth(wei: bigint | string, opts: { unit?: boolean; digits?: number } = {}): string {
  const n = Number(formatUnits(toBig(wei), 18));
  const s = n !== 0 && Math.abs(n) < 0.0001 ? formatTiny(n) : sig(n, opts.digits ?? 4);
  return opts.unit === false ? s : `${s} ETH`;
}

/** Tiny values with subscript zero count: 0.00000003930 → "0.0₇393". */
export function formatTiny(n: number, digits = 4): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 0.0001) return sig(n, digits);
  const exp = Math.floor(Math.log10(abs));
  const zeros = -exp - 1;
  const mant = Math.round(abs / 10 ** (exp - digits + 1)).toString().replace(/0+$/, "") || "0";
  const sub = String(zeros).split("").map((d) => SUB[Number(d)]).join("");
  return `${n < 0 ? "-" : ""}0.0${sub}${mant}`;
}

/** Per-token price in ETH (wei per whole token). */
export const formatPriceEth = (weiPerToken: bigint | string) =>
  `${formatTiny(Number(formatUnits(toBig(weiPerToken), 18)))} ETH`;

/** Compact USD: $22k, $15.1k, $402.52M, $1.34, $0.00003. */
export function formatUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${trim(abs / 1e9, 2)}B`;
  if (abs >= 1e6) return `${sign}$${trim(abs / 1e6, 2)}M`;
  if (abs >= 1e4) return `${sign}$${trim(abs / 1e3, 1)}k`;
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3, 2)}k`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs === 0) return "$0";
  return `${sign}$${formatTiny(abs, 3)}`;
}
const trim = (n: number, d: number) => n.toFixed(d).replace(/\.?0+$/, "");

/** Compact count: 6.1K, 405.9K, 1.2M. */
export function formatCount(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${trim(n / 1e9, 1)}B`;
  if (abs >= 1e6) return `${trim(n / 1e6, 1)}M`;
  if (abs >= 1e4) return `${trim(n / 1e3, 1)}K`;
  return n.toLocaleString("en-US");
}

/** Token amount (18 decimals) compact: 285.56M, 10M, 1,234.5 */
export function formatTokens(units: bigint | string, symbol?: string): string {
  const n = Number(formatUnits(toBig(units), 18));
  const abs = Math.abs(n);
  let s: string;
  if (abs >= 1e9) s = `${trim(n / 1e9, 2)}B`;
  else if (abs >= 1e6) s = `${trim(n / 1e6, 2)}M`;
  else if (abs >= 1e4) s = `${trim(n / 1e3, 2)}K`;
  else s = sig(n, 5);
  return symbol ? `${s} ${symbol}` : s;
}

/** Percent with two decimals. Progress never shows 100.00% before graduation. */
export function formatPct(n: number, opts: { sign?: boolean } = {}): string {
  const s = `${n.toFixed(2)}%`;
  return opts.sign && n > 0 ? `+${s}` : s;
}
export function formatProgress(bps: number, graduated = false): string {
  if (graduated) return "100%";
  const capped = Math.min(bps, 9999);
  return `${(capped / 100).toFixed(2)}%`;
}

/** 0x9dDd…932e */
export const shortAddress = (a: string, head = 6, tail = 4) =>
  a && a.length > head + tail ? `${a.slice(0, head)}…${a.slice(-tail)}` : a;

/** "now", "8s ago", "1m ago", "3h ago", "26d ago", "2y ago" — ts in unix seconds. */
export function timeAgo(ts: number, nowSec = Math.floor(Date.now() / 1000)): string {
  const d = Math.max(0, nowSec - ts);
  if (d < 3) return "now";
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 365) return `${Math.floor(d / 86400)}d ago`;
  return `${Math.floor(d / (86400 * 365))}y ago`;
}

export const weiToEthNumber = (wei: bigint | string) => Number(formatUnits(toBig(wei), 18));
export const weiToUsd = (wei: bigint | string, ethUsd: number | null | undefined) =>
  ethUsd == null ? null : weiToEthNumber(wei) * ethUsd;
