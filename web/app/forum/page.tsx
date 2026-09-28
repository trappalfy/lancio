import { COPY } from "@lancio/shared";
import type { Metadata } from "next";
import { ForumSidebar } from "@/components/forum/ForumSidebar";
import { PostFeed } from "@/components/forum/PostFeed";
import { parseSort, sortLinks } from "@/components/forum/sort";
import { Button, Card, EmptyState, PillTabs } from "@/components/ui";

export const metadata: Metadata = { title: COPY.forum.title, description: COPY.forum.subtitle };

export default async function ForumPage({ searchParams }: { searchParams: Promise<{ sort?: string | string[] }> }) {
  const sort = parseSort((await searchParams).sort);
  return (
    <div className="container-page py-8 md:py-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <h1 className="font-heading text-28 text-text md:text-40">{COPY.forum.title}</h1>
          <p className="mt-2 max-w-xl text-muted">{COPY.forum.subtitle}</p>
          <PillTabs className="mt-6" aria-label="Sort posts" items={sortLinks("/forum", sort)} />
          <Card padded={false} className="mt-5 px-5 md:px-8">
            <PostFeed
              query={{ sort }}
              empty={
                <EmptyState
                  className="min-h-[360px] justify-center"
                  title="No threads yet."
                  description="Open a token's room and start the first one."
                  action={
                    <Button href="/#explore" variant="outline">
                      {COPY.forum.sidebarLink}
                    </Button>
                  }
                />
              }
            />
          </Card>
        </div>
        <ForumSidebar className="lg:sticky lg:top-[calc(var(--header-h)+24px)]" />
      </div>
    </div>
  );
}
