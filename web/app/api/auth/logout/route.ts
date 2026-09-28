import { ok, serverError } from "@/db/http";
import type { MeResponse } from "@/db/types";
import { getSession } from "@/lib/session";

/** POST /api/auth/logout → clears the session cookie. */
export async function POST() {
  try {
    const session = await getSession();
    session.destroy();
    return ok<MeResponse>({ address: null, isAdmin: false });
  } catch (err) {
    return serverError(err);
  }
}
