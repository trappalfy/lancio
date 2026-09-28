/**
 * Open Graph images (next/og, 1200×630). Server-only: reads fonts and paintings from disk, resizes with sharp.
 * Used by app/opengraph-image.tsx, app/docs/opengraph-image.tsx, app/launchpad/[address]/opengraph-image.tsx.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { COPY, PARAMS, TOKEN_LIMITS, formatEth, formatProgress, shortAddress, type TokenResponse } from "@lancio/shared";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import sharp from "sharp";
import { isAddress } from "viem";
import { LANCIO_MARK_PATH } from "@/components/brand/LancioMark";
import { api } from "@/lib/api";
import { config } from "@/lib/config";
import { identiconSvg } from "@/lib/identicon";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Hex mirrors of the dark-theme tokens in app/globals.css (ImageResponse cannot read CSS variables). */
const C = {
  bg: "#14100c",
  surface: "#1e1712",
  surface2: "#2a2019",
  border: "#3a2e22",
  text: "#ede2cd",
  muted: "#a89479",
  accent: "#c9a058",
  cream: "#f1eadf",
  ink: "#1a120b",
};

type OgFonts = NonNullable<NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"]>;

// Literal paths so output file tracing picks the files up.
const FONT_CINZEL = join(process.cwd(), "assets/fonts/Cinzel-SemiBold.ttf");
const FONT_INTER = join(process.cwd(), "assets/fonts/Inter-Regular.ttf");
const FONT_INTER_SEMI = join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf");
const ARSENALE = join(process.cwd(), "public/brand/painting-arsenale-launch-full.png");
const SHIPWRIGHT = join(process.cwd(), "public/brand/painting-shipwright.png");

let fontsP: Promise<OgFonts> | undefined;

function loadFonts(): Promise<OgFonts> {
  fontsP ??= Promise.all([readFile(FONT_CINZEL), readFile(FONT_INTER), readFile(FONT_INTER_SEMI)]).then(
    ([cinzel, inter, interSemi]): OgFonts => [
      { name: "Cinzel", data: cinzel, weight: 600, style: "normal" },
      { name: "Inter", data: inter, weight: 400, style: "normal" },
      { name: "Inter", data: interSemi, weight: 600, style: "normal" },
    ],
  );
  return fontsP;
}

const dataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

/** A brand painting cropped to exactly 1200×630 (JPEG data URI, cached per process). */
const paintings = new Map<string, Promise<string>>();
function painting(path: string, position: "centre" | "right" | "left" | "top") {
  const key = `${path}:${position}`;
  let p = paintings.get(key);
  if (!p) {
    p = sharp(path)
      .resize(OG_SIZE.width, OG_SIZE.height, { fit: "cover", position })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
      .then((b) => dataUri(b, "image/jpeg"));
    paintings.set(key, p);
  }
  return p;
}

function Mark({ width, color }: { width: number; color: string }) {
  return (
    <svg width={width} height={width * 0.775} viewBox="0 0 100 77.5">
      <path fillRule="evenodd" d={LANCIO_MARK_PATH} fill={color} />
    </svg>
  );
}

async function render(node: ReactElement) {
  return new ImageResponse(node, { ...OG_SIZE, fonts: await loadFonts() });
}

/* ------------------------------------------------------------------ home */

/** Home: the hero painting (the shipwright, figure on the right) + the slogan in the empty dark left. Also the fallback for token pages. */
export async function homeOgImage() {
  const bg = await painting(SHIPWRIGHT, "top");
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundImage: "linear-gradient(90deg, rgba(20,16,12,0.85) 0%, rgba(20,16,12,0.6) 38%, rgba(20,16,12,0) 58%)",
        }}
      />
      <div style={{ position: "absolute", left: 64, top: 56, display: "flex", alignItems: "center", gap: 18 }}>
        <Mark width={64} color={C.cream} />
        <span style={{ fontFamily: "Cinzel", fontSize: 34, color: C.cream, letterSpacing: 4 }}>LANCIO</span>
      </div>
      <div style={{ position: "absolute", left: 64, bottom: 60, width: 560, display: "flex", flexDirection: "column" }}>
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 17, color: C.accent, letterSpacing: 4 }}>{COPY.hero.eyebrow}</span>
        <span
          style={{
            fontFamily: "Cinzel",
            fontSize: 68,
            lineHeight: 1.08,
            color: C.cream,
            letterSpacing: 3,
            marginTop: 18,
            textShadow: "0 2px 18px rgba(20,16,12,0.8)",
          }}
        >
          {COPY.og[0]}
        </span>
      </div>
    </div>,
  );
}

/* ------------------------------------------------------------------ docs */

/** Docs: "THE RULES CAME FIRST" over the Arsenale sky, in the style of the article cover. */
export async function docsOgImage() {
  const bg = await painting(ARSENALE, "right");
  return render(
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: C.bg }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg} width={OG_SIZE.width} height={OG_SIZE.height} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
      <div style={{ position: "absolute", left: 56, top: 52, display: "flex" }}>
        <Mark width={72} color={C.cream} />
      </div>
      <div style={{ position: "absolute", right: 72, top: 64, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 18, color: C.ink, letterSpacing: 5, opacity: 0.8 }}>LANCIO DOCS</span>
        <span
          style={{
            fontFamily: "Cinzel",
            fontSize: 58,
            lineHeight: 1.1,
            color: C.ink,
            letterSpacing: 4,
            marginTop: 14,
            maxWidth: 470,
            textAlign: "right",
          }}
        >
          {COPY.og[1]}
        </span>
      </div>
    </div>,
  );
}

/* ------------------------------------------------------------------ token */

/** Latin (Cinzel) and Latin/Greek/Cyrillic (Inter) coverage; anything else is dropped so no remote font fetch happens. */
const CINZEL_OK = /^[ -ɏ‘-‟…]*$/;
const clean = (s: string) =>
  s
    .replace(/[^ -ԯ -⁯₠-⃏]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Remote token images are fetched only from IPFS gateways the app already trusts. */
const IMAGE_HOSTS = ["gateway.pinata.cloud", "ipfs.io", ".mypinata.cloud"];
function trustedImageUrl(u: string | null): URL | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    const gateway = new URL(config.ipfsGateway).hostname;
    const h = url.hostname;
    const ok = url.protocol === "https:" && (h === gateway || IMAGE_HOSTS.some((a) => (a.startsWith(".") ? h.endsWith(a) : h === a)));
    return ok ? url : null;
  } catch {
    return null;
  }
}

async function tokenImage(src: string | null, seed: string): Promise<string> {
  const url = trustedImageUrl(src);
  if (url) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000), next: { revalidate: 3600 } });
      const len = Number(res.headers.get("content-length") ?? 0);
      if (res.ok && len <= TOKEN_LIMITS.imageMaxBytes) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.byteLength <= TOKEN_LIMITS.imageMaxBytes) {
          const png = await sharp(buf, { limitInputPixels: 40_000_000 }).resize(400, 400, { fit: "cover" }).png().toBuffer();
          return dataUri(png, "image/png");
        }
      }
    } catch {
      /* fall through to the identicon */
    }
  }
  const png = await sharp(Buffer.from(identiconSvg(seed, 400))).png().toBuffer();
  return dataUri(png, "image/png");
}

async function fetchToken(address: string): Promise<TokenResponse | null> {
  if (!isAddress(address) || config.prelaunch) return null;
  if (config.useMocks) return api.token(address).catch(() => null);
  try {
    const res = await fetch(`${config.indexerUrl}/api/tokens/${address.toLowerCase()}`, {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 60 },
      headers: { accept: "application/json" },
    });
    return res.ok ? ((await res.json()) as TokenResponse) : null;
  } catch {
    return null;
  }
}

/** Token: image, name, $TICKER, market cap, progress, Lancio mark. Generic home image when data is unavailable. */
export async function tokenOgImage(address: string) {
  const t = await fetchToken(address);
  if (!t) return homeOgImage();

  const img = await tokenImage(t.meta?.image ?? null, t.address);
  const rawName = clean(t.name) || shortAddress(t.address);
  const name = clip(rawName, 28);
  const symbol = clip(clean(t.symbol).toUpperCase(), 12);
  const graduated = t.status === "graduated";
  const bps = graduated ? 10_000 : Math.max(0, Math.min(10_000, t.progressBps));
  const nameSize = name.length <= 12 ? 76 : name.length <= 20 ? 58 : 46;

  return render(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 40,
        background: C.bg,
        backgroundImage: "radial-gradient(90% 80% at 100% 0%, rgba(201,160,88,0.14) 0%, rgba(201,160,88,0) 70%)",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 52,
          padding: 48,
          borderRadius: 36,
          border: `1px solid ${graduated ? "rgba(201,160,88,0.45)" : C.border}`,
          background: `linear-gradient(160deg, ${C.surface} 40%, ${graduated ? "#2b2217" : C.surface} 100%)`,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} width={380} height={380} alt="" style={{ borderRadius: 28, border: `1px solid ${C.border}` }} />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span
            style={{
              alignSelf: "flex-start",
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: 18,
              letterSpacing: 2,
              padding: "8px 16px",
              borderRadius: 999,
              color: graduated ? C.ink : C.muted,
              background: graduated ? C.accent : C.surface2,
            }}
          >
            {graduated ? COPY.graduated.title.toUpperCase() : "ON THE CURVE"}
          </span>
          <span
            style={{
              fontFamily: CINZEL_OK.test(name) ? "Cinzel" : "Inter",
              fontWeight: 600,
              fontSize: nameSize,
              lineHeight: 1.08,
              color: C.text,
              marginTop: 22,
              letterSpacing: 1,
            }}
          >
            {name}
          </span>
          {symbol && <span style={{ fontFamily: "Inter", fontSize: 32, color: C.muted, marginTop: 10 }}>{`$${symbol}`}</span>}

          <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
            <span style={{ fontFamily: "Inter", fontSize: 20, color: C.muted }}>Market cap</span>
            <span style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 52, color: C.text, marginTop: 2 }}>{formatEth(t.mcapEth)}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
            <div style={{ display: "flex", height: 14, borderRadius: 999, background: C.border, overflow: "hidden" }}>
              <div style={{ display: "flex", width: `${bps / 100}%`, height: "100%", borderRadius: 999, background: C.accent }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontFamily: "Inter", fontSize: 20, color: C.muted }}>
              <span>{graduated ? COPY.token.graduatedPlate : `Graduates at ${PARAMS.graduationEth} ETH`}</span>
              <span style={{ color: graduated ? C.accent : C.text, fontWeight: 600 }}>{formatProgress(bps, graduated)}</span>
            </div>
          </div>
        </div>

        <div style={{ position: "absolute", right: 36, top: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <Mark width={40} color={C.accent} />
          <span style={{ fontFamily: "Cinzel", fontSize: 22, color: C.text, letterSpacing: 3 }}>LANCIO</span>
        </div>
      </div>
    </div>,
  );
}
