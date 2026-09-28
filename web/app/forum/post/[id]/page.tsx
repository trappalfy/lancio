import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ForumSidebar } from "@/components/forum/ForumSidebar";
import { PostThread } from "@/components/forum/PostThread";
import { getPost } from "@/db/forum";
import { parsePostId } from "@/db/http";
import { getViewer } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/** null = definitely missing (or hidden from this viewer); undefined = database unreachable (the client shows the error). */
const loadPost = cache(async (id: number) => {
  try {
    const viewer = await getViewer();
    const row = await getPost(id, null);
    return row && (!row.hidden || viewer.isAdmin) ? row : null;
  } catch (err) {
    console.error("[forum]", err);
    return undefined;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const id = parsePostId((await params).id);
  const row = id ? await loadPost(id) : null;
  return { title: row ? row.title : "Post" };
}

export default async function PostPage({ params }: Params) {
  const id = parsePostId((await params).id);
  if (!id) notFound();
  if ((await loadPost(id)) === null) notFound();
  return (
    <div className="container-page py-8 md:py-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <PostThread id={id} />
        </div>
        <ForumSidebar className="lg:sticky lg:top-[calc(var(--header-h)+24px)]" />
      </div>
    </div>
  );
}
