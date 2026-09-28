import { generateSiweNonce } from "viem/siwe";
import { ok, serverError } from "@/db/http";
import { getSession } from "@/lib/session";

/** GET /api/auth/nonce → { nonce }. The nonce is kept in the session cookie and used once. */
export async function GET() {
  try {
    const session = await getSession();
    const nonce = generateSiweNonce();
    session.nonce = nonce;
    await session.save();
    return ok({ nonce });
  } catch (err) {
    return serverError(err);
  }
}
