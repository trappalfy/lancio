/**
 * Server-only storage for token images and metadata JSON (owned by the create area).
 * PINATA_JWT set → Pinata (IPFS, v3 files API), returns ipfs://CID + gateway URL.
 * PINATA_JWT empty → local dev: web/.uploads/<sha256>.<ext>, served by GET /api/uploads/[id].
 * Local files are content-addressed, so the same bytes always get the same id.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

export type Stored = {
  /** What goes into metadata / onchain: ipfs://CID (Pinata) or the local URL. */
  uri: string;
  /** Browser-loadable URL (gateway or local route). */
  url: string;
};

export const STORED_TYPES = { webp: "image/webp", gif: "image/gif", json: "application/json" } as const;
export type StoredExt = keyof typeof STORED_TYPES;

export class StorageError extends Error {}

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";
const LOCAL_DIR = path.join(process.cwd(), ".uploads");
const LOCAL_ID_RE = /^[a-f0-9]{64}\.(webp|gif|json)$/;

const gatewayUrl = (cid: string) => `${config.ipfsGateway.replace(/\/*$/, "/")}${cid}`;

/** Local URLs end up in onchain metadataURI, so only allow them when the site itself is local. */
function localAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const host = new URL(config.siteUrl).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function store(bytes: Uint8Array, ext: StoredExt): Promise<Stored> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const jwt = process.env.PINATA_JWT;
  if (jwt) return pinata(jwt, bytes, ext, `lancio-${hash.slice(0, 16)}.${ext}`);
  if (!localAllowed()) throw new StorageError("Image storage is not configured.");
  const id = `${hash}.${ext}`;
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, id), bytes);
  const url = `${config.siteUrl}/api/uploads/${id}`;
  return { uri: url, url };
}

async function pinata(jwt: string, bytes: Uint8Array, ext: StoredExt, name: string): Promise<Stored> {
  const form = new FormData();
  form.append("network", "public");
  form.append("name", name);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: STORED_TYPES[ext] }), name);
  let res: Response;
  try {
    res = await fetch(PINATA_UPLOAD_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new StorageError("Storage did not respond. Try again.");
  }
  if (!res.ok) {
    console.error("[storage] Pinata upload failed", res.status, await res.text().catch(() => ""));
    throw new StorageError("Storage rejected the upload. Try again.");
  }
  const json = (await res.json().catch(() => null)) as { data?: { cid?: string } } | null;
  const cid = json?.data?.cid;
  if (!cid) throw new StorageError("Storage returned no content id.");
  return { uri: `ipfs://${cid}`, url: gatewayUrl(cid) };
}

/** Local dev file by id ("<sha256>.<ext>"), or null. The id is validated — no path traversal. */
export async function readLocal(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const m = LOCAL_ID_RE.exec(id);
  if (!m) return null;
  try {
    const bytes = await readFile(path.join(LOCAL_DIR, id));
    return { bytes, type: STORED_TYPES[m[1] as StoredExt] };
  } catch {
    return null;
  }
}
