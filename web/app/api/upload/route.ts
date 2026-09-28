/**
 * POST /api/upload — token image (multipart: `file`, optional `crop` = JSON {x,y,width,height} in source pixels).
 * Checks type/size, decodes with sharp (content must really be png/jpeg/webp/gif), crops to a square,
 * resizes and re-encodes (drops EXIF/metadata; GIF and animated WEBP keep their animation), then stores.
 * → { uri, url }
 */
import { TOKEN_LIMITS } from "@lancio/shared";
import sharp from "sharp";
import { store, StorageError } from "@/lib/storage";
import { clientIp, jsonError, rateLimited } from "./_limit";

export const runtime = "nodejs";

const MAX_SIDE = 1024;
const MAX_SIDE_ANIMATED = 512;
const MAX_FRAMES = 300;
const LIMIT_INPUT_PIXELS = 40_000_000;
const FORMATS = new Set(["png", "jpeg", "webp", "gif"]);
const TYPES: readonly string[] = TOKEN_LIMITS.imageTypes;

type Crop = { x: number; y: number; width: number; height: number };

function parseCrop(raw: FormDataEntryValue | null): Crop | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const c = JSON.parse(raw) as Partial<Crop>;
    const ok = [c.x, c.y, c.width, c.height].every((n) => typeof n === "number" && Number.isFinite(n));
    return ok && c.width! > 0 && c.height! > 0 ? (c as Crop) : null;
  } catch {
    return null;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export async function POST(req: Request) {
  if (rateLimited(`img:${clientIp(req)}`, 20)) return jsonError("Too many uploads. Try again in a few minutes.", 429);
  if (Number(req.headers.get("content-length") ?? 0) > TOKEN_LIMITS.imageMaxBytes + 64 * 1024) {
    return jsonError("Image must be 4 MB or smaller.", 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Send the image as multipart form data.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose an image.", 400);
  if (!TYPES.includes(file.type)) return jsonError("Use a PNG, JPG, WEBP or GIF image.", 415);
  if (file.size > TOKEN_LIMITS.imageMaxBytes) return jsonError("Image must be 4 MB or smaller.", 413);

  const input = Buffer.from(await file.arrayBuffer());
  const opts = { animated: true, limitInputPixels: LIMIT_INPUT_PIXELS } as const;

  let out: Buffer;
  let ext: "webp" | "gif";
  try {
    const meta = await sharp(input, opts).metadata();
    if (!meta.format || !FORMATS.has(meta.format)) return jsonError("Use a PNG, JPG, WEBP or GIF image.", 415);
    const frames = meta.pages ?? 1;
    if (frames > MAX_FRAMES) return jsonError("The animation has too many frames.", 413);
    const animated = frames > 1;
    // Displayed (EXIF-oriented) size of one frame — crop coordinates from the browser refer to it.
    const swap = !animated && (meta.orientation ?? 1) >= 5;
    const w0 = meta.width ?? 0;
    const h0 = meta.pageHeight ?? meta.height ?? 0;
    const W = swap ? h0 : w0;
    const H = swap ? w0 : h0;
    if (!W || !H) return jsonError("This file is not a readable image.", 415);

    const crop = parseCrop(form.get("crop"));
    let side = Math.min(W, H);
    let left = Math.floor((W - side) / 2);
    let top = Math.floor((H - side) / 2);
    if (crop) {
      side = clamp(Math.round(Math.min(crop.width, crop.height)), 1, Math.min(W, H));
      left = clamp(Math.round(crop.x), 0, W - side);
      top = clamp(Math.round(crop.y), 0, H - side);
    }
    const target = Math.min(side, animated ? MAX_SIDE_ANIMATED : MAX_SIDE);

    let img = sharp(input, opts);
    if (!animated) img = img.rotate(); // apply EXIF orientation before cropping
    img = img.extract({ left, top, width: side, height: side }).resize(target, target);
    // sharp drops EXIF/ICC/XMP unless asked to keep them.
    if (meta.format === "gif") {
      out = await img.gif().toBuffer();
      ext = "gif";
    } else {
      out = await img.webp({ quality: 90 }).toBuffer();
      ext = "webp";
    }
  } catch {
    return jsonError("This file is not a readable image.", 415);
  }

  try {
    return Response.json(await store(out, ext));
  } catch (err) {
    if (!(err instanceof StorageError)) console.error("[upload] image", err);
    return jsonError(err instanceof StorageError ? err.message : "Upload failed. Try again.", 502);
  }
}
