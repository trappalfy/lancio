import type { Hex } from "@lancio/shared";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { z } from "zod";
import { chainClient } from "@/db/enrich";
import { fail, ok, readJson, serverError } from "@/db/http";
import type { MeResponse } from "@/db/types";
import { config } from "@/lib/config";
import { getSession, isAdmin } from "@/lib/session";

const Body = z.object({
  message: z.string().min(1).max(4_000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Invalid signature."),
});

/**
 * Hosts a SIWE message may be bound to. Production: only NEXT_PUBLIC_SITE_URL's host — request headers are
 * client-controlled, so trusting them would let a phishing site relay signatures. Dev: also the request host.
 */
function allowedDomains(req: Request): string[] {
  const hosts = [new URL(config.siteUrl).host];
  if (process.env.NODE_ENV !== "production") hosts.push(req.headers.get("host") ?? new URL(req.url).host);
  return hosts;
}

/** POST /api/auth/verify { message, signature } → MeResponse, sets the session cookie. */
export async function POST(req: Request) {
  const { data, error } = await readJson(req, Body);
  if (error) return error;
  try {
    const session = await getSession();
    const nonce = session.nonce;
    if (!nonce) return fail(400, "Sign-in expired. Try again.");
    // Single use, whatever the outcome.
    delete session.nonce;
    await session.save();

    const fields = parseSiweMessage(data.message);
    if (!fields.address) return fail(400, "The message has no address.");
    if (fields.chainId !== config.chainId) return fail(400, "Sign in for Robinhood Chain.");
    const domain = fields.domain ?? "";
    if (!allowedDomains(req).includes(domain)) return fail(400, "The message was made for another site.");
    let uriHost = "";
    try {
      uriHost = new URL(fields.uri ?? "").host;
    } catch {}
    if (uriHost !== domain) return fail(400, "The message was made for another site.");

    const valid = await verifySiweMessage(chainClient, {
      message: data.message,
      signature: data.signature as Hex,
      domain,
      nonce,
    }).catch(() => false);
    if (!valid) return fail(401, "The signature could not be verified. Try again.");

    const address = fields.address.toLowerCase() as Hex;
    session.address = address;
    await session.save();
    return ok<MeResponse>({ address, isAdmin: isAdmin(address) });
  } catch (err) {
    return serverError(err);
  }
}
