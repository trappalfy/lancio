"use client";

import { useInfiniteQuery, useQuery, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { ForumError, forumFetch } from "@/db/fetch";
import type { ForumComment, ForumPost, ForumSort, PostResponse, PostsResponse, VoteResponse, VoteValue } from "@/db/types";

export type PostsQuery = { sort: ForumSort; token?: string; author?: string };

export const forumKeys = {
  posts: (q: PostsQuery) => ["forum", "posts", { sort: q.sort, token: q.token?.toLowerCase(), author: q.author?.toLowerCase() }] as const,
  post: (id: number) => ["forum", "post", id] as const,
};

function qs(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  return u.toString();
}

/** Paged feed (cursor = offset). */
export function usePosts(q: PostsQuery) {
  return useInfiniteQuery({
    queryKey: forumKeys.posts(q),
    queryFn: ({ pageParam, signal }) =>
      forumFetch<PostsResponse>(`/api/forum/posts?${qs({ sort: q.sort, token: q.token, author: q.author, cursor: pageParam ?? undefined })}`, {
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
}

export function usePost(id: number) {
  return useQuery({
    queryKey: forumKeys.post(id),
    queryFn: ({ signal }) => forumFetch<PostResponse>(`/api/forum/posts/${id}`, { signal }),
    staleTime: 10_000,
    retry: (n, e) => !(e instanceof ForumError && e.status < 500) && n < 1,
  });
}

export const forumApi = {
  createPost: (b: { token: string; title: string; body: string }) => forumFetch<ForumPost>("/api/forum/posts", { method: "POST", json: b }),
  createComment: (b: { postId: number; body: string }) => forumFetch<ForumComment>("/api/forum/comments", { method: "POST", json: b }),
  vote: (b: { postId: number; value: VoteValue }) => forumFetch<VoteResponse>("/api/forum/vote", { method: "POST", json: b }),
  hide: (b: { kind: "post" | "comment"; id: number; hidden: boolean }) => forumFetch<{ ok: true }>("/api/forum/hide", { method: "POST", json: b }),
};

/** Patch one post everywhere it is cached (every feed + its thread) without refetching and reordering feeds. */
export function patchPost(qc: QueryClient, id: number, patch: Partial<ForumPost> | ((p: ForumPost) => Partial<ForumPost>)) {
  const apply = (p: ForumPost) => (p.id === id ? { ...p, ...(typeof patch === "function" ? patch(p) : patch) } : p);
  qc.setQueriesData<InfiniteData<PostsResponse>>({ queryKey: ["forum", "posts"] }, (data) =>
    data ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: pg.items.map(apply) })) } : data,
  );
  qc.setQueryData<PostResponse>(forumKeys.post(id), (d) => (d ? { ...d, post: apply(d.post) } : d));
}

/** Current cached copy of a post (first match), for rollbacks. */
export function cachedPost(qc: QueryClient, id: number): ForumPost | undefined {
  const thread = qc.getQueryData<PostResponse>(forumKeys.post(id));
  if (thread) return thread.post;
  for (const [, data] of qc.getQueriesData<InfiniteData<PostsResponse>>({ queryKey: ["forum", "posts"] })) {
    const hit = data?.pages.flatMap((p) => p.items).find((p) => p.id === id);
    if (hit) return hit;
  }
  return undefined;
}
