import { NextResponse } from "next/server";
import type { z } from "zod";
import type { ErrorResponse } from "./types";

/** Route-handler helpers shared by app/api/forum/** and app/api/auth/**. */
export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export const fail = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json<ErrorResponse>({ error }, { status, headers: { "cache-control": "no-store", ...headers } });

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** "42" → 42; anything else (or out of int4 range) → null. */
export const parsePostId = (id: string) => (/^\d{1,9}$/.test(id) && Number(id) > 0 ? Number(id) : null);

/** Post/comment id in JSON bodies. */
export const ID_MAX = 999_999_999;

/** Parses a JSON body with a zod schema → data, or a 400 response with the first issue. */
export async function readJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.output<S>; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail(400, "Invalid JSON body.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: fail(400, parsed.error.issues[0]?.message ?? "Invalid request.") };
  return { data: parsed.data };
}

/** Any unexpected server error → 500 with a calm message; the detail goes to the server log. */
export function serverError(err: unknown) {
  console.error("[forum]", err);
  return fail(500, "The forum is unavailable right now. Try again shortly.");
}
