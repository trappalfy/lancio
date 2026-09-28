"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DOCS, docHref } from "./registry";

/** Docs navigation: sticky sidebar card on lg+, horizontal pill row below that. */
export function DocsNav() {
  const pathname = usePathname();
  const isActive = (slug: string) => pathname === docHref(slug);

  return (
    <>
      {/* Mobile / tablet: scrollable pills */}
      <nav aria-label="Docs" className="-mx-4 overflow-x-auto px-4 lg:hidden">
        <ul className="flex w-max gap-1 rounded-full bg-surface-2 p-1">
          {DOCS.map((d) => (
            <li key={d.slug}>
              <Link
                href={docHref(d.slug)}
                aria-current={isActive(d.slug) ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-full px-4 py-2 text-sm transition-colors",
                  isActive(d.slug) ? "bg-pill-active text-text shadow-section" : "text-muted hover:text-text",
                )}
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: sticky sidebar */}
      <nav
        aria-label="Docs"
        className="sticky top-[calc(var(--header-h)+16px)] hidden self-start rounded-section border border-border/60 bg-surface p-6 shadow-section lg:block"
      >
        <p className="font-heading text-xl text-text">Docs</p>
        <ul className="mt-5 space-y-1">
          {DOCS.map((d, i) => (
            <li key={d.slug}>
              <Link
                href={docHref(d.slug)}
                aria-current={isActive(d.slug) ? "page" : undefined}
                className={cn(
                  "flex items-baseline gap-3 rounded-full px-3 py-2 text-sm transition-colors",
                  isActive(d.slug) ? "bg-accent-soft text-accent-text" : "text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <span className="w-5 shrink-0 text-xs tabular">{String(i + 1).padStart(2, "0")}</span>
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
