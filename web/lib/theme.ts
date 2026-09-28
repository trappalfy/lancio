"use client";

/** Resolved value of a CSS variable, e.g. cssVar("--accent") → "#c9a058". For canvases/charts. The site has one (dark) theme. */
export function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
