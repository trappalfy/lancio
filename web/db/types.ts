/** Forum REST shapes (app/api/forum/**, app/api/auth/**). Client-safe: types and constants only. */
import type { Hex } from "@lancio/shared";

export type ForumSort = "hot" | "new" | "top";
export const FORUM_SORTS: readonly ForumSort[] = ["hot", "new", "top"];

export const FORUM_LIMITS = { title: 120, body: 5000, comment: 2000 } as const;

export type VoteValue = -1 | 0 | 1;

export type ForumToken = { address: Hex; symbol: string; name: string; image: string | null };

export type ForumPost = {
  id: number;
  token: Hex;
  /** null when the indexer does not know the token (or is unreachable). */
  tokenInfo: ForumToken | null;
  author: Hex;
  /** Author held a non-zero balance of the token at read time. */
  authorIsHolder: boolean;
  title: string;
  body: string;
  createdAt: number;
  score: number;
  commentsCount: number;
  /** The signed-in viewer's vote. */
  myVote: VoteValue;
  /** Only admins ever receive hidden items. */
  hidden: boolean;
};

export type ForumComment = {
  id: number;
  postId: number;
  author: Hex;
  authorIsHolder: boolean;
  body: string;
  createdAt: number;
  hidden: boolean;
};

/** GET /api/forum/posts?token=&author=&sort=hot|new|top&cursor= */
export type PostsResponse = { items: ForumPost[]; nextCursor: string | null };
/** GET /api/forum/posts/:id */
export type PostResponse = { post: ForumPost; comments: ForumComment[] };
/** POST /api/forum/vote {postId, value} */
export type VoteResponse = { score: number; myVote: VoteValue };
/** GET /api/auth/me */
export type MeResponse = { address: Hex | null; isAdmin: boolean };
/** Error body of every forum/auth route. */
export type ErrorResponse = { error: string };
