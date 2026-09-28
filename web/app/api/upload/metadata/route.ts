/**
 * POST /api/upload/metadata — JSON {name, symbol, description, image, x, telegram, website}.
 * Validates with the same rules as the contract and the form, normalizes links, stores the JSON.
 * → { uri, url } — `uri` is the metadataURI passed to launchpad.create().
 */
import { TOKEN_LIMITS } from "@lancio/shared";
import { z } from "zod";
import {
  nameValid,
  normalizeTelegram,
  normalizeWebsite,
  normalizeX,
  TICKER_RE,
  type TokenMetadata,
} from "@/components/create/validate";
import { store, StorageError } from "@/lib/storage";
import { clientIp, jsonError, rateLimited } from "../_limit";

export const runtime = "nodejs";

const optionalText = z.string().max(512).nullish();

const Body = z.object({
  name: z.string().refine(nameValid),
  symbol: z.string().regex(TICKER_RE),
  description: z.string().max(TOKEN_LIMITS.descriptionMax).nullish(),
  image: z
    .string()
    .max(2048)
    .regex(/^(ipfs:\/\/|https?:\/\/)\S+$/)
    .nullish(),
  x: optionalText,
  telegram: optionalText,
  website: optionalText,
});

export async function POST(req: Request) {
  if (rateLimited(`meta:${clientIp(req)}`, 30)) return jsonError("Too many uploads. Try again in a few minutes.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the token details and try again.", 400);
  const b = parsed.data;

  const x = normalizeX(b.x ?? "");
  const telegram = normalizeTelegram(b.telegram ?? "");
  const website = normalizeWebsite(b.website ?? "");
  if (x === undefined || telegram === undefined || website === undefined) {
    return jsonError("Check the links and try again.", 400);
  }

  const meta: TokenMetadata = {
    name: b.name.trim(),
    symbol: b.symbol,
    description: b.description?.trim() || null,
    image: b.image ?? null,
    x,
    telegram,
    website,
  };

  try {
    return Response.json(await store(new TextEncoder().encode(JSON.stringify(meta)), "json"));
  } catch (err) {
    if (!(err instanceof StorageError)) console.error("[upload] metadata", err);
    return jsonError(err instanceof StorageError ? err.message : "Upload failed. Try again.", 502);
  }
}
