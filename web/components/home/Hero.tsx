"use client";

import { COPY } from "@lancio/shared";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useRef } from "react";
import { preload } from "react-dom";
import { useRegisterHero } from "@/components/layout/HeroHeaderContext";

const HeroParticles = dynamic(() => import("./HeroParticles"), { ssr: false });

/** The painting (first frame, no-WebGL fallback, home OG image) and its level-adjusted copy sampled into particles. */
const PAINTING = "/brand/painting-shipwright.png";
const PARTICLES_SRC = "/brand/hero-particles.jpg";

/**
 * Home hero (brief §11.1 + HERO_PARTICLES.md): the shipwright painting rebuilt from particles that the pointer
 * scatters and that settle back home. The static painting underneath is framed exactly like the particle field
 * (FRAMING in particles.ts: 62% below 700px, 85% above) so the cross-fade does not shift. The only text is the
 * slogan; it ignores the pointer, so the whole section drives the particles.
 */
export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useRegisterHero(ref);
  preload(PARTICLES_SRC, { as: "image" });

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="under-header relative isolate flex h-[min(78svh,640px)] min-h-[540px] flex-col overflow-hidden [touch-action:pan-y_pinch-zoom] md:h-[min(86svh,820px)] md:min-h-[600px]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-bg">
        <Image src={PAINTING} alt="" fill priority sizes="100vw" className="object-cover object-[62%_50%] min-[700px]:object-[85%_50%]" />
        {/* lifts the painting's pure black to --bg (as the particle frame does), so the static fallback has no seam */}
        <div className="absolute inset-0 bg-bg mix-blend-lighten" />
        <HeroParticles target={ref} src={PARTICLES_SRC} />
        {/* keeps the transparent header legible over the hair and the flag */}
        <div className="absolute inset-x-0 top-0 h-[calc(var(--header-h)+48px)] bg-linear-to-b from-bg/60 to-transparent" />
        <div className="absolute inset-0 hidden bg-linear-to-t from-bg to-transparent to-25% md:block" />
        {/* mobile: the slogan sits over the lower part of the figure, so the bottom scrim reaches a little higher */}
        <div className="absolute inset-0 bg-linear-to-t from-bg via-bg/60 via-20% to-transparent to-50% md:hidden" />
      </div>

      <div className="container-page pointer-events-none mt-auto pb-16 text-cream md:pb-20">
        <div className="relative isolate w-fit max-w-3xl">
          <div aria-hidden className="absolute -inset-x-12 -inset-y-12 -z-10 rounded-[96px] bg-bg/70 blur-2xl" />
          <h1
            id="hero-title"
            className="max-w-[17ch] font-heading text-[36px] leading-[1.1] tracking-[var(--heading-caps-tracking,0.04em)]! text-balance text-cream uppercase [text-shadow:0_1px_2px_var(--bg),0_0_28px_var(--bg)] xs:text-[40px] md:text-56 md:leading-[1.08] lg:text-[64px] xl:text-[72px]"
          >
            {COPY.hero.title}
          </h1>
        </div>
      </div>
    </section>
  );
}
