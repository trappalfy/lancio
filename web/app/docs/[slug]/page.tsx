import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocArticle } from "@/components/docs/DocArticle";
import { DOCS, getDoc } from "@/components/docs/registry";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return DOCS.filter((d) => d.slug).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const found = getDoc(slug);
  if (!found || !slug) return {};
  return { title: found.doc.title, description: found.doc.summary };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  if (!slug || !getDoc(slug)) notFound();
  return <DocArticle slug={slug} />;
}
