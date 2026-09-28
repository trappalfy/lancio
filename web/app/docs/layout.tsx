import type { ReactNode } from "react";
import { DocsNav } from "@/components/docs/DocsNav";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container-page pt-6 md:pt-10">
      <div className="grid gap-6 lg:grid-cols-[248px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <DocsNav />
        {children}
      </div>
    </div>
  );
}
