import { ok, serverError } from "@/db/http";
import type { MeResponse } from "@/db/types";
import { getViewer } from "@/lib/session";

/** GET /api/auth/me → the signed-in address (or null) and admin flag. */
export async function GET() {
  try {
    return ok<MeResponse>(await getViewer());
  } catch (err) {
    return serverError(err);
  }
}
