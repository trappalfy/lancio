"use client";

import { useSyncExternalStore } from "react";

/** Tailwind `lg` (1024px). The server snapshot assumes desktop; mobile corrects right after hydration. */
const QUERY = "(min-width: 1024px)";

function subscribe(cb: () => void) {
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function useIsDesktop() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
