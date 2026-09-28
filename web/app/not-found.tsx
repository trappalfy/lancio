import { COPY } from "@lancio/shared";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

/** 404: the gate painting at dusk. Overlay uses the fixed dark ink so cream text reads in both themes. */
export default function NotFound() {
  return (
    <div className="container-page pt-6 md:pt-10">
      <section className="relative isolate flex min-h-[min(640px,72dvh)] flex-col items-center justify-center overflow-hidden rounded-section border border-border/60 px-6 py-20 text-center shadow-section">
        <Image
          src="/brand/painting-gate.png"
          alt=""
          fill
          loading="eager"
          sizes="(min-width: 1232px) 1200px, 100vw"
          className="-z-20 object-cover object-[70%_center]"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-accent-ink/70" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-accent-ink via-accent-ink/40 to-accent-ink/20" />

        <p className="text-13 font-medium uppercase tracking-[0.2em] text-cream/80">Error 404</p>
        <h1 className="mt-4 max-w-2xl font-heading text-28 text-cream xs:text-40 md:text-56">{COPY.notFound}</h1>
        <Button href="/#explore" variant="cream-outline" size="lg" className="mt-10">
          Back to Explore
        </Button>
      </section>
    </div>
  );
}
