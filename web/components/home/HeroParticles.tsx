"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { createParticleField, type ParticleField } from "./particles";

/** Squared speed (px/frame)² under which a particle counts as still. */
const STILL_V2 = 1e-4;
/** Consecutive still frames before the loop sleeps until the next pointer move (saves the CPU on an idle page). */
const SLEEP_AFTER = 20;
const RESIZE_DEBOUNCE_MS = 150;

/**
 * The hero painting as a particle field (HERO_PARTICLES.md). Client-only: load with next/dynamic, ssr: false.
 * Draws nothing until WebGL and `src` are ready, then fades in over the static painting underneath, which stays
 * as the fallback when there is no WebGL. Pointer input is read from `target` (the whole hero section), so the
 * text on top never blocks it. Runs only while the hero is on screen; reduced motion gets one still frame.
 */
export default function HeroParticles({ target, src }: { target: RefObject<HTMLElement | null>; src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const section = target.current;
    if (!canvas || !section) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let field: ParticleField | null = null;
    let disposed = false;
    let raf = 0;
    let visible = false;
    let still = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const frame = () => {
      raf = 0;
      if (!field) return;
      still = field.step() < STILL_V2 ? still + 1 : 0;
      const asleep = still >= SLEEP_AFTER;
      // at rest with no pointer: snap the last sub-pixel residue so the frame left on screen is exact
      if (asleep && !field.pointerActive) field.settle();
      field.draw();
      if (visible && !asleep) raf = requestAnimationFrame(frame);
    };
    const wake = () => {
      still = 0;
      if (!raf && visible && field && !reduce) raf = requestAnimationFrame(frame);
    };
    const pause = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!field) return;
      const r = canvas.getBoundingClientRect();
      field.pointerMove(e.clientX - r.left, e.clientY - r.top);
      wake();
    };
    const onRelease = (e: PointerEvent) => {
      // touch has no hover: lifting the finger lets the picture settle
      if (e.type === "pointerup" && e.pointerType === "mouse") return;
      field?.pointerRelease();
      wake();
    };

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
      else pause();
    });
    const ro = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!field || field.fits()) return;
        field.build(false);
        field.draw();
      }, RESIZE_DEBOUNCE_MS);
    });
    const onContextLost = () => {
      // back to the static painting
      pause();
      field = null;
      setLive(false);
    };

    const img = new Image();
    img.decoding = "async";
    img.src = src;
    img.decode().then(
      () => {
        if (disposed) return;
        field = createParticleField(canvas, img);
        if (!field) return; // no hardware WebGL: the static painting stays
        field.build(!reduce);
        field.draw();
        setLive(true);
        canvas.addEventListener("webglcontextlost", onContextLost);
        io.observe(section);
        ro.observe(canvas);
        if (!reduce) {
          section.addEventListener("pointermove", onMove, { passive: true });
          section.addEventListener("pointerdown", onMove, { passive: true });
          section.addEventListener("pointerup", onRelease, { passive: true });
          section.addEventListener("pointercancel", onRelease, { passive: true });
          section.addEventListener("pointerleave", onRelease, { passive: true });
        }
      },
      () => {}, // image failed: the static painting stays
    );

    return () => {
      disposed = true;
      pause();
      clearTimeout(resizeTimer);
      io.disconnect();
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerdown", onMove);
      section.removeEventListener("pointerup", onRelease);
      section.removeEventListener("pointercancel", onRelease);
      section.removeEventListener("pointerleave", onRelease);
      field?.destroy();
      field = null;
    };
  }, [target, src]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "absolute inset-0 size-full opacity-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none",
        live && "opacity-100",
      )}
    />
  );
}
