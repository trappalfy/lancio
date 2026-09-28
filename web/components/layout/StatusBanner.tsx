import { config } from "@/lib/config";
import { BannerDismiss } from "./BannerDismiss";

export const BANNER_STORAGE_PREFIX = "lancio-banner-dismissed:";

/**
 * Thin dark announcement bar above the header (brief §9.2). Driven by NEXT_PUBLIC_BANNER_*; hidden when empty.
 * Dismissal is per banner id (localStorage) and applied before paint by the inline script in app/layout.tsx.
 */
export function StatusBanner() {
  const b = config.banner;
  if (!b) return null;
  return (
    <div data-theme="dark" className="status-banner relative border-b border-border bg-linear-to-r from-surface-2 via-bg to-bg text-text">
      <div className="container-page flex min-h-11 items-center justify-center gap-2.5 py-2 pr-10 text-13">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-accent" />
        <p className="text-center">
          {b.title && <span className="mr-2 font-medium text-accent-text">{b.title}</span>}
          {b.text && <span className="text-muted">{b.text}</span>}
        </p>
      </div>
      <BannerDismiss id={b.id} />
    </div>
  );
}
