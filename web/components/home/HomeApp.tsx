"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { ExplorePanel } from "./ExplorePanel";
import { GraduatedPanel } from "./GraduatedPanel";
import { EXPLORE_ANCHOR, parseExplore } from "./query";
import { SearchPalette, SearchTrigger, useSearchHotkey } from "./SearchPalette";

/** The app under the hero (anchor #explore): search + Create, Graduated, Explore. */
export function HomeApp() {
  const state = parseExplore(useSearchParams());
  const [searchOpen, setSearchOpen] = useState(false);
  useSearchHotkey(setSearchOpen);

  return (
    <div
      id={EXPLORE_ANCHOR}
      tabIndex={-1}
      className="container-page flex scroll-mt-[calc(var(--header-h)+16px)] flex-col gap-5 pt-2 pb-16 outline-none md:gap-6 md:pb-24"
    >
      <div className="flex items-center gap-2.5 md:gap-3">
        <SearchTrigger onOpen={() => setSearchOpen(true)} />
        <Button href="/launchpad/create" variant="outline" size="lg" className="h-12 bg-surface px-5 shadow-section" aria-label="Create a token">
          <Plus size={18} aria-hidden />
          <span className="hidden xs:inline">Create</span>
        </Button>
      </div>
      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <GraduatedPanel />
      <ExplorePanel state={state} />
    </div>
  );
}

/** Suspense fallback while search params resolve (static shell). */
export function HomeAppFallback() {
  return (
    <div className="container-page flex flex-col gap-5 pt-2 pb-16 md:gap-6">
      <div className="h-12 rounded-full border border-border bg-surface" />
      <div className="h-80 rounded-section border border-border/60 bg-surface" />
    </div>
  );
}
