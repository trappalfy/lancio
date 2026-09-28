/**
 * Social links from token metadata are user input: only ever emit http(s) URLs.
 * Handles ("@name", "name") become x.com / t.me links; anything else unparseable is dropped.
 */
type Kind = "x" | "telegram" | "website";

const HANDLE: Record<Exclude<Kind, "website">, { re: RegExp; base: string }> = {
  x: { re: /^[A-Za-z0-9_]{1,15}$/, base: "https://x.com/" },
  telegram: { re: /^[A-Za-z0-9_]{4,32}$/, base: "https://t.me/" },
};

function httpUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".") ? u.href : null;
  } catch {
    return null;
  }
}

export function socialUrl(value: string | null | undefined, kind: Kind): string | null {
  const s = value?.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return httpUrl(s);
  if (kind !== "website") {
    const h = s.replace(/^@/, "");
    if (HANDLE[kind].re.test(h)) return HANDLE[kind].base + h;
  }
  // "example.com", "x.com/name", "t.me/name" without a scheme.
  if (/^[^\s:/]+\.[^\s:/]+(\/\S*)?$/.test(s)) return httpUrl(`https://${s}`);
  return null;
}

export const isZeroAddress = (a: string | null | undefined) => !a || /^0x0{40}$/i.test(a);
export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
