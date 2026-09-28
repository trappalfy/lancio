"use client";

import { X } from "lucide-react";

export function BannerDismiss({ id }: { id: string }) {
  return (
    <button
      type="button"
      aria-label="Dismiss announcement"
      onClick={() => {
        try {
          localStorage.setItem(`lancio-banner-dismissed:${id}`, "1");
        } catch {}
        document.documentElement.dataset.bannerDismissed = "";
      }}
      className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-text"
    >
      <X size={16} />
    </button>
  );
}
