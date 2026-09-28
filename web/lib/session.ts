/** Server only: SIWE session in an encrypted iron-session cookie. */
import type { Hex } from "@lancio/shared";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  /** Pending SIWE nonce (single use). */
  nonce?: string;
  /** Signed-in wallet, lowercase. */
  address?: Hex;
};

const DEV_SECRET = "lancio-dev-only-session-secret-do-not-use-in-production";
let warned = false;

function password(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set to 32+ characters in production.");
  if (!warned) {
    warned = true;
    console.warn("[forum] SESSION_SECRET is missing or shorter than 32 characters. Using an insecure development secret.");
  }
  return DEV_SECRET;
}

const WEEK = 7 * 24 * 3600;

function options(): SessionOptions {
  return {
    cookieName: "lancio_session",
    password: password(),
    ttl: WEEK,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: WEEK },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export function isAdmin(address: string | null | undefined): boolean {
  if (!address) return false;
  const admins = (process.env.FORUM_ADMINS ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(address.toLowerCase());
}

/** The signed-in viewer (address lowercase or null) and admin flag. Read-only; safe in server components. */
export async function getViewer(): Promise<{ address: Hex | null; isAdmin: boolean }> {
  const session = await getSession();
  const address = session.address ?? null;
  return { address, isAdmin: isAdmin(address) };
}
