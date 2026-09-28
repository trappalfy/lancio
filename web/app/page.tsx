import type { Metadata } from "next";
import { Suspense } from "react";
import { Hero } from "@/components/home/Hero";
import { HomeApp, HomeAppFallback } from "@/components/home/HomeApp";

export const metadata: Metadata = {
  title: { absolute: "Lancio · Token launchpad on Robinhood Chain" },
};

/** Home (brief §11.1): hero, then the app — search → Graduated → Explore → pagination. */
export default function Page() {
  return (
    <>
      <Hero />
      <Suspense fallback={<HomeAppFallback />}>
        <HomeApp />
      </Suspense>
    </>
  );
}
