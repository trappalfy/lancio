"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { LancioMark } from "@/components/brand/LancioMark";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/utils";
import { useHeaderState } from "./HeroHeaderContext";
import { WalletButton } from "./WalletButton";

export const NAV = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" || p.startsWith("/launchpad") },
  { href: "/forum", label: "Forum", match: (p: string) => p.startsWith("/forum") },
  { href: "/analytics", label: "Analytics", match: (p: string) => p.startsWith("/analytics") },
] as const;

export function Header() {
  const pathname = usePathname() ?? "/";
  const ref = useRef<HTMLElement>(null);
  const { overHero, scrolled } = useHeaderState(ref);
  const [menuOpen, setMenuOpen] = useState(false);
  const cream = overHero;
  const tone = cream ? "cream" : "default";

  return (
    <header
      ref={ref}
      className={cn(
        "sticky top-0 z-40 h-(--header-h) transition-[background-color,border-color,backdrop-filter] duration-200",
        cream
          ? "border-b border-transparent bg-transparent text-cream"
          : scrolled
            ? "border-b border-border/70 bg-surface/80 text-text backdrop-blur-md backdrop-saturate-150"
            : "border-b border-transparent bg-transparent text-text",
      )}
    >
      <div className="container-page flex h-full items-center gap-3">
        <Link
          href="/"
          aria-label="Lancio — home"
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[14px] border transition-colors",
            cream ? "border-cream/40 bg-cream/5" : "border-accent/50 bg-surface",
          )}
        >
          <LancioMark className="w-7" />
        </Link>

        <nav
          aria-label="Main"
          className={cn(
            "hidden items-center gap-0.5 rounded-full p-1 md:flex",
            cream ? "bg-cream/10 backdrop-blur-sm" : "bg-surface-2",
          )}
        >
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
                  cream
                    ? active
                      ? "bg-cream/20 text-cream"
                      : "text-cream/80 hover:text-cream"
                    : active
                      ? "bg-pill-active text-text shadow-sm"
                      : "text-muted hover:text-text",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <WalletButton tone={tone} className="hidden md:inline-flex" />
          <Sheet
            side="right"
            title="Menu"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <button
                type="button"
                aria-label="Open menu"
                className={cn(
                  "grid size-10 place-items-center rounded-full border md:hidden",
                  cream ? "border-cream/35 text-cream" : "border-border text-text",
                )}
              >
                <Menu size={18} />
              </button>
            }
          >
            <nav aria-label="Main" className="flex flex-col gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={n.match(pathname) ? "page" : undefined}
                  className={cn(
                    "rounded-2xl px-4 py-3 text-base font-medium",
                    n.match(pathname) ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                  )}
                >
                  {n.label}
                </Link>
              ))}
              <Link href="/launchpad/create" onClick={() => setMenuOpen(false)} className="rounded-2xl px-4 py-3 text-base font-medium text-muted hover:text-text">
                Launch a token
              </Link>
            </nav>
            <div className="mt-auto flex items-center gap-3 border-t border-border pt-5">
              <WalletButton className="flex-1" />
            </div>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
