/** Browser calls to the upload API (app/api/upload). */
import type { Area } from "react-easy-crop";
import type { TokenMetadata } from "./validate";

export type UploadResult = { uri: string; url: string };

async function post(path: string, init: RequestInit): Promise<UploadResult> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", ...init });
  } catch {
    throw new Error("Upload failed. Check your connection and try again.");
  }
  const body = (await res.json().catch(() => null)) as (UploadResult & { error?: string }) | null;
  if (!res.ok || !body?.uri) throw new Error(body?.error ?? "Upload failed. Try again.");
  return { uri: body.uri, url: body.url };
}

export function uploadImage(file: File, crop: Area | null, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file);
  if (crop) form.append("crop", JSON.stringify(crop));
  return post("/api/upload", { body: form, signal });
}

export function uploadMetadata(meta: TokenMetadata) {
  return post("/api/upload/metadata", { body: JSON.stringify(meta), headers: { "content-type": "application/json" } });
}
