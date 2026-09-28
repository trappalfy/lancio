/**
 * Off-chain token metadata (JSON written by the web create flow):
 *   {"name","symbol","description","image","x","telegram","website"}
 * Fetched once per TokenCreated with a 5 s timeout and a 256 KB cap. Any failure → all nulls.
 * Only ipfs:// (via gateway) and public https:// URLs are fetched — the URI is user-supplied, so no
 * plain http, no localhost / IP-literal hosts (keeps the indexer from being pointed at internal services).
 */
import type { TokenMeta } from "@lancio/shared";

const GATEWAY = (process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/*$/, "/");
const TIMEOUT_MS = 5_000;
const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

export const EMPTY_META: TokenMeta = { description: null, image: null, x: null, telegram: null, website: null };

const CID_RE = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})(\/.*)?$/;

/** ipfs://CID/path, ipfs://ipfs/CID, bare CID → gateway URL; http(s) passes through; anything else → null. */
export function resolveUri(uri: string): string | null {
  const u = uri.trim();
  if (!u) return null;
  if (/^ipfs:\/\//i.test(u)) {
    const path = u.slice(7).replace(/^ipfs\//i, "");
    return path ? GATEWAY + path : null;
  }
  if (CID_RE.test(u)) return GATEWAY + u;
  if (/^https?:\/\//i.test(u)) return u;
  return null;
}

/** Local dev only: lets the indexer read metadata served by the web app's local upload store. */
const ALLOW_LOCAL_METADATA = process.env.ALLOW_LOCAL_METADATA === "true";

function isFetchable(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (ALLOW_LOCAL_METADATA && ["localhost", "127.0.0.1"].includes(url.hostname)) return true;
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith("[") || host.includes(":")) return false;
  return true;
}

async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES || !res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

async function fetchJson(uri: string): Promise<unknown> {
  let url = resolveUri(uri);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS && url; hop++) {
    if (!isFetchable(url)) return null;
    const res = await fetch(url, { signal, redirect: "manual", headers: { accept: "application/json" } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      url = loc ? new URL(loc, url).toString() : null;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }
    const text = await readCapped(res);
    return text == null ? null : JSON.parse(text);
  }
  return null;
}

const str = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
};

/** http(s) URL (scheme optional, "example.com" → https://example.com/), else null. */
function toWebUrl(v: unknown): string | null {
  const s = str(v, 512);
  if (!s) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function toSocial(v: unknown, handleRe: RegExp, base: string): string | null {
  const s = str(v, 512);
  if (!s) return null;
  if (handleRe.test(s)) return base + s.replace(/^@/, "");
  return toWebUrl(s);
}

function toImage(v: unknown): string | null {
  const s = str(v, 2048);
  if (!s) return null;
  const url = resolveUri(s);
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function parseMeta(json: unknown): TokenMeta {
  if (!json || typeof json !== "object" || Array.isArray(json)) return EMPTY_META;
  const j = json as Record<string, unknown>;
  const description = typeof j.description === "string" ? j.description.trim().slice(0, 1000) || null : null;
  return {
    description,
    image: toImage(j.image),
    x: toSocial(j.x ?? j.twitter, /^@?[A-Za-z0-9_]{1,15}$/, "https://x.com/"),
    telegram: toSocial(j.telegram, /^@?[A-Za-z0-9_]{5,32}$/, "https://t.me/"),
    website: toWebUrl(j.website),
  };
}

// Metadata is content-addressed in practice; cache per process so dev reloads/reorgs don't refetch.
const cache = new Map<string, TokenMeta>();

export async function fetchMetadata(uri: string): Promise<TokenMeta> {
  const hit = cache.get(uri);
  if (hit) return hit;
  try {
    const json = await fetchJson(uri);
    if (json == null) return EMPTY_META;
    const meta = parseMeta(json);
    if (cache.size > 5_000) cache.clear();
    cache.set(uri, meta);
    return meta;
  } catch {
    return EMPTY_META; // timeout, network, oversize, bad JSON — store nulls and move on
  }
}
