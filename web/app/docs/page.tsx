import type { Metadata } from "next";
import { DocArticle } from "@/components/docs/DocArticle";
import { DOCS } from "@/components/docs/registry";

export const metadata: Metadata = {
  title: "Docs",
  description: DOCS[0].summary,
};

export default function DocsIndexPage() {
  return <DocArticle slug="" />;
}
