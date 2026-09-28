import { ArrowLeft, ArrowRight } from "lucide-react";
import type { MDXComponents } from "mdx/types";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isValidElement, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { type DocEntry, docHref, getDoc } from "./registry";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}
const anchorOf = (node: ReactNode) =>
  textOf(node)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Docs-only overrides on top of the global map in mdx-components.tsx. */
const docsComponents: MDXComponents = {
  h2: ({ children }) => (
    <h2 id={anchorOf(children) || undefined} className="mb-4 mt-12 scroll-mt-[calc(var(--header-h)+24px)] font-heading text-28 text-text">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={anchorOf(children) || undefined} className="mb-3 mt-8 scroll-mt-[calc(var(--header-h)+24px)] text-xl font-semibold text-text">
      {children}
    </h3>
  ),
  pre: (p) => (
    <pre
      className="my-6 overflow-x-auto rounded-card border border-border bg-surface-2 p-4 font-mono text-sm leading-7 text-text md:p-5 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]"
      {...p}
    />
  ),
};

function PrevNext({ prev, next }: { prev: DocEntry | null; next: DocEntry | null }) {
  if (!prev && !next) return null;
  const cls = "group flex flex-col gap-1 rounded-card bg-surface-2 p-4 transition-colors hover:bg-pill-active md:p-5";
  return (
    <nav aria-label="Docs pages" className="mt-14 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={docHref(prev.slug)} className={cls}>
          <span className="inline-flex items-center gap-1.5 text-13 text-muted">
            <ArrowLeft size={14} aria-hidden /> Previous
          </span>
          <span className="text-base font-medium text-text group-hover:text-accent-text">{prev.title}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next && (
        <Link href={docHref(next.slug)} className={`${cls} sm:items-end sm:text-right`}>
          <span className="inline-flex items-center gap-1.5 text-13 text-muted">
            Next <ArrowRight size={14} aria-hidden />
          </span>
          <span className="text-base font-medium text-text group-hover:text-accent-text">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

/** One docs page: title, optional painting, MDX body, previous / next. */
export async function DocArticle({ slug }: { slug: string }) {
  const found = getDoc(slug);
  if (!found) notFound();
  const { doc, index, prev, next } = found;
  const { default: Content } = await doc.load();

  return (
    <article className="min-w-0">
      <Card texture className="md:p-12">
        <header className="max-w-3xl">
          <p className="text-13 font-medium uppercase tracking-[0.14em] text-muted">Docs · {String(index + 1).padStart(2, "0")}</p>
          <h1 className="mt-3 font-heading text-28 text-text xs:text-40 lg:text-56">{doc.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted md:text-xl md:leading-8">{doc.summary}</p>
        </header>

        {doc.image && (
          <figure className="relative mt-8 aspect-[16/9] overflow-hidden rounded-card border border-border/60 md:aspect-[21/9]">
            <Image
              src={doc.image.src}
              alt={doc.image.alt}
              fill
              loading="eager"
              sizes="(min-width: 1232px) 880px, (min-width: 1024px) 70vw, 100vw"
              className="object-cover"
            />
            <div aria-hidden className="absolute inset-0 bg-linear-to-t from-accent-ink/45 via-transparent to-transparent" />
          </figure>
        )}

        <div className="mt-8 max-w-3xl [&>*:first-child]:mt-0">
          <Content components={docsComponents} />
        </div>

        <PrevNext prev={prev} next={next} />
      </Card>
    </article>
  );
}
