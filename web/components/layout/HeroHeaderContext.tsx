"use client";

import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";

type Ctx = { hero: HTMLElement | null; setHero: (el: HTMLElement | null) => void };
const HeroCtx = createContext<Ctx | null>(null);

export function HeroHeaderProvider({ children }: { children: ReactNode }) {
  const [hero, setHero] = useState<HTMLElement | null>(null);
  return <HeroCtx.Provider value={{ hero, setHero }}>{children}</HeroCtx.Provider>;
}

/**
 * Register a full-bleed hero (painting) that sits under the sticky header. While it is under the header,
 * the header is transparent with cream text/mark. Give the hero the `under-header` class so it slides
 * beneath the header:  const ref = useRef<HTMLElement>(null); useRegisterHero(ref); <section ref={ref} className="under-header …">
 */
export function useRegisterHero(ref: RefObject<HTMLElement | null>) {
  const ctx = useContext(HeroCtx);
  const setHero = ctx?.setHero;
  useEffect(() => {
    const el = ref.current;
    if (!el || !setHero) return;
    setHero(el);
    return () => setHero(null);
  }, [ref, setHero]);
}

/** Header state: overHero (a registered hero is under the header) and scrolled (page moved from the top). */
export function useHeaderState(headerRef: RefObject<HTMLElement | null>) {
  const hero = useContext(HeroCtx)?.hero ?? null;
  const [state, setState] = useState({ overHero: false, scrolled: false });
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const headerBottom = headerRef.current?.getBoundingClientRect().bottom ?? 0;
      const overHero = !!hero && hero.getBoundingClientRect().bottom > headerBottom + 1;
      const scrolled = window.scrollY > 4;
      setState((s) => (s.overHero === overHero && s.scrolled === scrolled ? s : { overHero, scrolled }));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [hero, headerRef]);
  return state;
}
