/**
 * TEMPORARY (dev only): font candidates for the owner to choose from. Replaces Cinzel (headings) and Inter (UI).
 * Loaders live in app/font-candidates.ts; the switcher is components/dev/FontPreview.tsx; side-by-side view at /fonts.
 * Once a pair is chosen: load only that pair in app/layout.tsx, set --font-display/--font-sans in globals.css,
 * update the OG fonts (components/docs/og.tsx) and delete this file, the loaders, the switcher and /fonts.
 */

export type HeadingFont = {
  id: string;
  name: string;
  /** CSS variable set by the next/font loader. */
  cssVar: string;
  fallback: string;
  weight: number;
  /** letter-spacing for section titles (mixed case). */
  tracking: string;
  /** letter-spacing for the all-caps hero slogan. */
  capsTracking: string;
  variation?: string;
  note: string;
};

export type UiFont = { id: string; name: string; cssVar: string; note: string };

export const HEADING_FONTS: HeadingFont[] = [
  {
    id: "cinzel",
    name: "Cinzel (сейчас)",
    cssVar: "--font-cinzel",
    fallback: "serif",
    weight: 600,
    tracking: "0.06em",
    capsTracking: "0.04em",
    note: "Сейчас. Римские капитель-надписи.",
  },
  {
    id: "bodoni",
    name: "Bodoni Moda",
    cssVar: "--font-bodoni",
    fallback: "serif",
    weight: 600,
    tracking: "-0.01em",
    capsTracking: "0.02em",
    variation: '"opsz" 11',
    note: "Итальянский (Парма, 1790-е). Контрастный, как обложка журнала.",
  },
  {
    id: "fraunces",
    name: "Fraunces",
    cssVar: "--font-fraunces",
    fallback: "serif",
    weight: 600,
    tracking: "-0.01em",
    capsTracking: "0.01em",
    variation: '"SOFT" 50',
    note: "Мягкая старая антиква. Тёплый, «ручной».",
  },
  {
    id: "fell",
    name: "IM Fell English SC",
    cssVar: "--font-fell",
    fallback: "serif",
    weight: 400,
    tracking: "0.02em",
    capsTracking: "0.03em",
    note: "Шрифты Фелла, XVII век. Неровный, с оттиском краски, как старая печать.",
  },
  {
    id: "alegreya",
    name: "Alegreya SC",
    cssVar: "--font-alegreya-sc",
    fallback: "serif",
    weight: 500,
    tracking: "0.03em",
    capsTracking: "0.04em",
    note: "Каллиграфия Возрождения, капитель. Живой ритм.",
  },
  {
    id: "young",
    name: "Young Serif",
    cssVar: "--font-young",
    fallback: "serif",
    weight: 400,
    tracking: "-0.01em",
    capsTracking: "0.02em",
    note: "Плотная антиква начала 1900-х. Уверенный, с характером.",
  },
  {
    id: "bricolage",
    name: "Bricolage Grotesque",
    cssVar: "--font-bricolage",
    fallback: "sans-serif",
    weight: 700,
    tracking: "-0.02em",
    capsTracking: "0em",
    variation: '"wdth" 80',
    note: "Узкий гротеск с причудами. Плакат, без засечек.",
  },
];

export const UI_FONTS: UiFont[] = [
  { id: "inter", name: "Inter (сейчас)", cssVar: "--font-inter", note: "Сейчас." },
  { id: "archivo", name: "Archivo", cssVar: "--font-archivo", note: "Крепкий гротеск в духе старых газет. Ровный, без украшений." },
  { id: "instrument", name: "Instrument Sans", cssVar: "--font-instrument", note: "Аккуратный, чуть узкий, точный." },
  { id: "plex", name: "IBM Plex Sans", cssVar: "--font-plex", note: "Инженерный, но живой. Узнаваемые a, g, t." },
  { id: "alegreya-sans", name: "Alegreya Sans", cssVar: "--font-alegreya-sans", note: "Гуманистический, каллиграфический. Пара к Alegreya SC." },
  { id: "hanken", name: "Hanken Grotesk", cssVar: "--font-hanken", note: "Простой и тёплый. Не отвлекает." },
  { id: "bricolage", name: "Bricolage Grotesque", cssVar: "--font-bricolage", note: "Причудливый в крупном размере, спокойный в мелком." },
];

/** Suggested pairs (heading + UI). Any combination can be tried in the switcher. */
export const PAIRINGS = [
  { id: "parma", name: "Parma", heading: "bodoni", ui: "archivo" },
  { id: "workshop", name: "Workshop", heading: "fraunces", ui: "instrument" },
  { id: "broadsheet", name: "Broadsheet", heading: "fell", ui: "plex" },
  { id: "renaissance", name: "Renaissance", heading: "alegreya", ui: "alegreya-sans" },
  { id: "foundry", name: "Foundry", heading: "young", ui: "hanken" },
  { id: "poster", name: "Poster", heading: "bricolage", ui: "bricolage" },
] as const;

export const CURRENT = { heading: "cinzel", ui: "inter" } as const;

const headingVars = (f: HeadingFont) =>
  `--font-display:var(${f.cssVar}),${f.fallback};--heading-weight:${f.weight};--heading-tracking:${f.tracking};--heading-caps-tracking:${f.capsTracking};--heading-variation:${f.variation ?? "normal"};`;
const uiVars = (f: UiFont) => `--font-sans:var(${f.cssVar}),ui-sans-serif,system-ui,sans-serif;`;

/** Unlayered CSS: html[data-font-h] / html[data-font-ui] override the theme font variables site-wide. */
export function fontPreviewCss() {
  return (
    HEADING_FONTS.map((f) => `html[data-font-h="${f.id}"]{${headingVars(f)}}`).join("") +
    UI_FONTS.map((f) => `html[data-font-ui="${f.id}"]{${uiVars(f)}}`).join("")
  );
}

/** Same variables as an inline style, for a scoped specimen (the element also needs `font-sans`). */
export function fontPairStyle(headingId: string, uiId: string): Record<string, string> {
  const h = HEADING_FONTS.find((f) => f.id === headingId) ?? HEADING_FONTS[0];
  const u = UI_FONTS.find((f) => f.id === uiId) ?? UI_FONTS[0];
  const style: Record<string, string> = {};
  for (const decl of (headingVars(h) + uiVars(u)).split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) style[decl.slice(0, i)] = decl.slice(i + 1);
  }
  return style;
}

export const FONT_STORAGE_KEY = "lancio-font-preview";
