import type { MDXComponents } from "mdx/types";
import Link from "next/link";

/** Global MDX styles for /docs. Docs area may extend this map. */
const components: MDXComponents = {
  h1: (p) => <h1 className="font-heading text-40 mb-6 mt-2" {...p} />,
  h2: (p) => <h2 className="font-heading text-28 mt-12 mb-4" {...p} />,
  h3: (p) => <h3 className="text-lg font-semibold mt-8 mb-3" {...p} />,
  p: (p) => <p className="text-base leading-7 text-text/90 my-4" {...p} />,
  ul: (p) => <ul className="list-disc pl-6 my-4 space-y-2 marker:text-accent" {...p} />,
  ol: (p) => <ol className="list-decimal pl-6 my-4 space-y-2 marker:text-muted" {...p} />,
  li: (p) => <li className="leading-7" {...p} />,
  a: ({ href = "", ...p }) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className="text-accent-text underline underline-offset-4 hover:no-underline" {...p} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="text-accent-text underline underline-offset-4 hover:no-underline" {...p} />
    ),
  code: (p) => <code className="font-mono text-[0.9em] rounded-md bg-surface-2 px-1.5 py-0.5" {...p} />,
  pre: (p) => <pre className="font-mono text-sm rounded-card bg-surface-2 p-4 overflow-x-auto my-6" {...p} />,
  blockquote: (p) => <blockquote className="border-l-2 border-accent pl-4 my-6 text-muted" {...p} />,
  hr: () => <hr className="my-10 border-border" />,
  table: (p) => (
    <div className="my-6 overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm" {...p} />
    </div>
  ),
  th: (p) => <th className="text-left font-medium text-muted px-4 py-3 border-b border-border" {...p} />,
  td: (p) => <td className="px-4 py-3 border-b border-border last:border-0" {...p} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
