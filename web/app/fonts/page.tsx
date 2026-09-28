import { COPY } from "@lancio/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { buttonClass } from "@/components/ui";
import { CURRENT, HEADING_FONTS, PAIRINGS, UI_FONTS, fontPairStyle } from "@/lib/font-options";

export const metadata: Metadata = { title: "Fonts", robots: { index: false } };

/** TEMPORARY, local dev only: every suggested font pair side by side (lib/font-options.ts). */
export default function FontsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const pairs = [{ id: "current", name: "Сейчас", heading: CURRENT.heading, ui: CURRENT.ui }, ...PAIRINGS];

  return (
    <div className="container-page py-10 md:py-14">
      <p className="text-sm text-muted">
        Шрифты · только локально. Любую пару (или свою комбинацию) можно включить на всём сайте кнопкой «Шрифты» в правом нижнем углу.
      </p>
      <div className="mt-8 grid gap-6">
        {pairs.map((p, i) => {
          const h = HEADING_FONTS.find((f) => f.id === p.heading)!;
          const ui = UI_FONTS.find((f) => f.id === p.ui)!;
          return (
            <section
              key={p.id}
              style={fontPairStyle(p.heading, p.ui) as CSSProperties}
              className="rounded-section border border-border bg-surface p-6 font-sans md:p-10"
            >
              <p className="text-13 text-muted" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
                {i === 0 ? "Сейчас" : `${i}. ${p.name}`} · заголовки <b className="text-text">{h.name}</b> ({h.note.toLowerCase()}) · текст{" "}
                <b className="text-text">{ui.name}</b> ({ui.note.toLowerCase()})
              </p>

              <div className="mt-8 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <p className="text-xs font-medium tracking-[0.14em] text-accent uppercase md:text-13">{COPY.hero.eyebrow}</p>
                  <h2 className="mt-4 max-w-[17ch] font-heading text-[40px] leading-[1.08] tracking-[var(--heading-caps-tracking)]! text-balance text-cream md:text-56">
                    {COPY.hero.title}
                  </h2>
                  <p className="mt-4 max-w-[44ch] text-lg leading-relaxed text-cream/80">{COPY.hero.subline}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <span className={buttonClass("accent", "lg")}>{COPY.hero.ctaLaunch}</span>
                    <span className={buttonClass("cream-outline", "lg")}>{COPY.hero.ctaExplore}</span>
                  </div>
                  <ul className="mt-6 flex flex-wrap gap-y-2 text-sm text-cream/80">
                    {COPY.hero.facts.map((f, j) => (
                      <li key={f} className={j ? "border-l border-cream/25 pr-5 pl-5" : "pr-5"}>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-card border border-border bg-bg p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading text-28 text-text">{COPY.graduated.title}</h3>
                    <span className={buttonClass("accent", "sm")}>Connect</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{COPY.graduated.subtitle}</p>
                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-13 text-muted">Market cap</p>
                      <p className="text-xl font-semibold text-text">$12,480.55</p>
                    </div>
                    <div>
                      <p className="text-13 text-muted">Price</p>
                      <p className="text-xl font-semibold text-text">0.0000421 ETH</p>
                    </div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-border">
                    <div className="h-full w-[64%] rounded-full bg-accent" />
                  </div>
                  <div className="mt-2 flex justify-between text-13 text-muted">
                    <span>Graduates at 8 ETH</span>
                    <span className="font-semibold text-text">64.20%</span>
                  </div>
                  <div className="mt-5 flex gap-2">
                    <span className={buttonClass("buy", "md", "flex-1")}>Buy</span>
                    <span className={buttonClass("outline", "md", "flex-1")}>Sell</span>
                  </div>
                  <h3 className="mt-6 font-heading text-xl text-text">{COPY.explore.title}</h3>
                  <p className="mt-1 text-sm text-muted">1,000,000,000 · 0123456789 · $4,096.00</p>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
