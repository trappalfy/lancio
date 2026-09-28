"use client";

import type { ReactNode } from "react";
import { Button, Skeleton } from "@/components/ui";
import { ForumError } from "@/db/fetch";
import type { ForumPost } from "@/db/types";
import { usePosts, type PostsQuery } from "./api";
import { PostCard } from "./PostCard";

export function FeedSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy className="divide-y divide-border">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 py-5">
          <Skeleton className="h-20 w-8" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FeedError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-sm text-muted">{error instanceof ForumError ? error.message : "The forum is unavailable right now."}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Post list for a sort + optional token/author filter, 20 per page with "Load more". */
export function PostFeed({
  query,
  showToken = true,
  showBuy = true,
  empty,
}: {
  query: PostsQuery;
  showToken?: boolean;
  showBuy?: boolean;
  empty: ReactNode;
}) {
  const q = usePosts(query);
  if (q.isPending) return <FeedSkeleton />;
  if (q.isError) return <FeedError error={q.error} onRetry={() => void q.refetch()} />;

  // Offset pages can overlap when new posts arrive between pages.
  const items = [...new Map<number, ForumPost>(q.data.pages.flatMap((p) => p.items.map((it) => [it.id, it] as const))).values()];
  if (!items.length) return <>{empty}</>;

  return (
    <div>
      <ul className="divide-y divide-border">
        {items.map((post) => (
          <li key={post.id}>
            <PostCard post={post} showToken={showToken} showBuy={showBuy} />
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <div className="flex justify-center border-t border-border py-5">
          <Button variant="outline" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
