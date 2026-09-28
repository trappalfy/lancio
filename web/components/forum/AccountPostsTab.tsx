"use client";

import { EmptyState } from "@/components/ui";
import { PostFeed } from "./PostFeed";

/** Profile → Posts tab: posts written by this address, newest first. */
export function AccountPostsTab({ address }: { address: `0x${string}` }) {
  return <PostFeed query={{ sort: "new", author: address }} empty={<EmptyState title="No posts from this address yet." />} />;
}
