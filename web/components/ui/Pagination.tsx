import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Page list like ‹ 1 2 … 20 ›: first, last, current ±1, ellipses. */
export function pageList(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  if (page <= 3) [2, 3].forEach((p) => set.add(p));
  if (page >= totalPages - 2) [totalPages - 1, totalPages - 2].forEach((p) => set.add(p));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  totalPages,
  hrefFor,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const arrow = "grid size-10 place-items-center rounded-full text-muted hover:text-text";
  const disabled = "pointer-events-none opacity-30";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-2", className)}>
      <Link href={hrefFor(Math.max(1, page - 1))} scroll={false} aria-label="Previous page" aria-disabled={page <= 1} className={cn(arrow, page <= 1 && disabled)}>
        <ChevronLeft size={18} />
      </Link>
      <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
        {pageList(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="grid h-9 min-w-9 place-items-center text-sm text-muted">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={hrefFor(p)}
              scroll={false}
              aria-current={p === page ? "page" : undefined}
              className={cn(
                "grid h-9 min-w-9 place-items-center rounded-full px-2 text-sm tabular transition-colors",
                p === page ? "bg-accent text-on-accent font-semibold" : "text-muted hover:text-text",
              )}
            >
              {p}
            </Link>
          ),
        )}
      </div>
      <Link
        href={hrefFor(Math.min(totalPages, page + 1))}
        scroll={false}
        aria-label="Next page"
        aria-disabled={page >= totalPages}
        className={cn(arrow, page >= totalPages && disabled)}
      >
        <ChevronRight size={18} />
      </Link>
    </nav>
  );
}
