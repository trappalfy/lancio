// ТРЕБУЕТ ЮРИСТА — legal pages are a placeholder structure only. Nothing here is final legal text.
// Final wording (and whether a MiCA whitepaper is needed, brief Q9) is for counsel to decide.
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type LegalSection = { id: string; title: string; body: string };

export const LEGAL_DRAFT_NOTE = "Draft. Pending legal review.";

export function LegalPage({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="container-page pt-6 md:pt-10">
      <Card texture className="mx-auto max-w-4xl md:p-12">
        <p className="text-13 font-medium uppercase tracking-[0.14em] text-muted">Legal</p>
        <h1 className="mt-3 font-heading text-28 text-text xs:text-40">{title}</h1>

        <div role="note" className="mt-6 flex gap-3 rounded-card border border-accent/40 bg-accent-soft px-5 py-4">
          <FileText size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
          <div>
            <p className="font-semibold text-text">{LEGAL_DRAFT_NOTE}</p>
            <p className="mt-1 text-sm leading-6 text-text/90">
              This page shows the planned structure only. The text under each heading is a placeholder, not the final {title.toLowerCase()}.
            </p>
          </div>
        </div>

        <p className="mt-8 text-base leading-7 text-muted">{intro}</p>

        <nav aria-label="Sections" className="mt-8 rounded-card bg-surface-2 p-5">
          <ol className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="w-5 shrink-0 text-muted tabular">{i + 1}.</span>
                <a href={`#${s.id}`} className="text-text/90 hover:text-accent-text">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-4">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-[calc(var(--header-h)+24px)] border-b border-border py-8 last:border-0">
              <h2 className="text-xl font-semibold text-text">
                <span className="mr-2 text-muted tabular">{i + 1}.</span>
                {s.title}
              </h2>
              <p className="mt-3 text-base leading-7 text-muted">
                <span className="mr-2 rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Placeholder
                </span>
                {s.body}
              </p>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
}
