/** Pure helpers shared by the create form and the upload API (no React, no server imports). */
import { TOKEN_LIMITS } from "@lancio/shared";

/** Metadata JSON stored off-chain; its URI goes into launchpad.create(). Read by the indexer. */
export type TokenMetadata = {
  name: string;
  symbol: string;
  description: string | null;
  image: string | null;
  x: string | null;
  telegram: string | null;
  website: string | null;
};

/** The contract checks name length in UTF-8 bytes (1–32). */
export const utf8Length = (s: string) => new TextEncoder().encode(s).length;

export const TICKER_RE = new RegExp(`^[A-Z0-9]{1,${TOKEN_LIMITS.symbolMax}}$`);

/** Ticker as typed → uppercase A–Z 0–9, max length. */
export const cleanTicker = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, TOKEN_LIMITS.symbolMax);

export const nameValid = (name: string) => {
  const n = utf8Length(name.trim());
  return n >= 1 && n <= TOKEN_LIMITS.nameMax;
};

const stripScheme = (s: string) =>
  s.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

/**
 * Link normalizers: "" → null (not set), valid → canonical https URL, invalid → undefined.
 * Idempotent, so the server can re-run them on what the client sent.
 */
export function normalizeX(v: string): string | null | undefined {
  if (!v.trim()) return null;
  const m = /^(?:(?:x|twitter)\.com\/)?@?([A-Za-z0-9_]{1,15})$/i.exec(stripScheme(v));
  return m ? `https://x.com/${m[1]}` : undefined;
}

export function normalizeTelegram(v: string): string | null | undefined {
  if (!v.trim()) return null;
  const m = /^(?:(?:t|telegram)\.me\/)?(@?[A-Za-z0-9_]{5,32}|\+[A-Za-z0-9_-]{6,64})$/i.exec(stripScheme(v));
  return m ? `https://t.me/${m[1].replace(/^@/, "")}` : undefined;
}

export function normalizeWebsite(v: string): string | null | undefined {
  const s = v.trim();
  if (!s) return null;
  if (s.length > 200) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    if (!url.hostname.includes(".") || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
