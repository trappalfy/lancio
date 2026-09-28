"use client";

import type { TokenSummary } from "@lancio/shared";
import Link from "next/link";
import { useState } from "react";
import { EmptyState, PillTabs } from "@/components/ui";
import type { ForumSort } from "@/db/types";
import { NewPostDialog } from "./NewPostDialog";
import { PostFeed } from "./PostFeed";
import { SORT_ITEMS } from "./sort";

/** Token page → Forum tab: this token's posts + New post. */
export function TokenForumTab({ token }: { token: TokenSummary }) {
  const [sort, setSort] = useState<ForumSort>("hot");
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillTabs size="sm" value={sort} onChange={setSort} items={SORT_ITEMS} aria-label="Sort posts" />
        <div className="flex items-center gap-3">
          <Link href={`/forum/${token.address}`} className="text-13 text-muted transition-colors hover:text-text">
            Open room
          </Link>
          <NewPostDialog token={token.address} symbol={token.symbol} size="sm" />
        </div>
      </div>
      <PostFeed
        query={{ sort, token: token.address }}
        showToken={false}
        showBuy={false}
        empty={
          <EmptyState
            title={`No threads about $${token.symbol} yet.`}
            description="Start the first one. Holders get a badge next to their address."
          />
        }
      />
    </div>
  );
}
