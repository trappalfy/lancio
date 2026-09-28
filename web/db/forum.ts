import { and, asc, desc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { getDb } from "./client";
import { comments, posts, votes } from "./schema";
import type { ForumSort, VoteValue } from "./types";

/** Addresses passed in here are lowercase. */
export type PostRow = typeof posts.$inferSelect & { myVote: VoteValue };
export type CommentRow = typeof comments.$inferSelect;

const nowSec = () => Math.floor(Date.now() / 1000);
const toVote = (v: unknown): VoteValue => (Number(v) > 0 ? 1 : Number(v) < 0 ? -1 : 0);

function myVote(viewer: string | null) {
  return viewer
    ? sql<number | null>`(select ${votes.value} from ${votes} where ${votes.postId} = ${posts.id} and ${votes.voter} = ${viewer})`
    : sql<number | null>`null`;
}

/** Hot = score / (ageHours + 2)^1.5 */
const hot = (now: number) =>
  sql`(${posts.score})::float8 / power(greatest((${now})::float8 - ${posts.createdAt}, 0) / 3600.0 + 2, 1.5::float8)`;

const postColumns = (viewer: string | null) => ({ ...getTableColumns(posts), myVote: myVote(viewer) });
const toPost = (r: typeof posts.$inferSelect & { myVote: number | null }): PostRow => ({ ...r, myVote: toVote(r.myVote) });

export async function listPosts(opts: {
  token?: string;
  author?: string;
  sort: ForumSort;
  offset: number;
  limit: number;
  viewer: string | null;
  includeHidden: boolean;
}): Promise<{ rows: PostRow[]; hasMore: boolean }> {
  const db = await getDb();
  const where: SQL[] = [];
  if (opts.token) where.push(eq(posts.token, opts.token));
  if (opts.author) where.push(eq(posts.author, opts.author));
  if (!opts.includeHidden) where.push(eq(posts.hidden, false));
  const order =
    opts.sort === "new"
      ? [desc(posts.createdAt), desc(posts.id)]
      : opts.sort === "top"
        ? [desc(posts.score), desc(posts.createdAt), desc(posts.id)]
        : [desc(hot(nowSec())), desc(posts.createdAt), desc(posts.id)];
  const rows = await db
    .select(postColumns(opts.viewer))
    .from(posts)
    .where(and(...where))
    .orderBy(...order)
    .limit(opts.limit + 1)
    .offset(opts.offset);
  return { rows: rows.slice(0, opts.limit).map(toPost), hasMore: rows.length > opts.limit };
}

export async function getPost(id: number, viewer: string | null): Promise<PostRow | null> {
  const db = await getDb();
  const [row] = await db.select(postColumns(viewer)).from(posts).where(eq(posts.id, id)).limit(1);
  return row ? toPost(row) : null;
}

export async function listComments(postId: number, includeHidden: boolean): Promise<CommentRow[]> {
  const db = await getDb();
  const where = includeHidden ? eq(comments.postId, postId) : and(eq(comments.postId, postId), eq(comments.hidden, false));
  return db.select().from(comments).where(where).orderBy(asc(comments.createdAt), asc(comments.id)).limit(1000);
}

export async function createPost(v: { token: string; author: string; title: string; body: string }): Promise<PostRow> {
  const db = await getDb();
  const [row] = await db
    .insert(posts)
    .values({ ...v, createdAt: nowSec(), hidden: false, score: 0, commentsCount: 0 })
    .returning();
  return { ...row, myVote: 0 };
}

async function recountComments(postId: number) {
  const db = await getDb();
  await db
    .update(posts)
    .set({
      commentsCount: sql`(select count(*) from ${comments} where ${comments.postId} = ${postId} and ${comments.hidden} = false)::int`,
    })
    .where(eq(posts.id, postId));
}

export async function createComment(v: { postId: number; author: string; body: string }): Promise<CommentRow> {
  const db = await getDb();
  const [row] = await db
    .insert(comments)
    .values({ ...v, createdAt: nowSec(), hidden: false })
    .returning();
  await recountComments(v.postId);
  return row;
}

/** value 0 removes the vote. Returns the recounted score. */
export async function setVote(postId: number, voter: string, value: VoteValue): Promise<number> {
  const db = await getDb();
  if (value === 0) {
    await db.delete(votes).where(and(eq(votes.postId, postId), eq(votes.voter, voter)));
  } else {
    await db
      .insert(votes)
      .values({ postId, voter, value })
      .onConflictDoUpdate({ target: [votes.postId, votes.voter], set: { value } });
  }
  const [row] = await db
    .update(posts)
    .set({ score: sql`(select coalesce(sum(${votes.value}), 0) from ${votes} where ${votes.postId} = ${postId})::int` })
    .where(eq(posts.id, postId))
    .returning({ score: posts.score });
  return row?.score ?? 0;
}

/** Admin moderation. Returns false when the item does not exist. */
export async function setHidden(kind: "post" | "comment", id: number, hidden: boolean): Promise<boolean> {
  const db = await getDb();
  if (kind === "post") {
    const rows = await db.update(posts).set({ hidden }).where(eq(posts.id, id)).returning({ id: posts.id });
    return rows.length > 0;
  }
  const rows = await db.update(comments).set({ hidden }).where(eq(comments.id, id)).returning({ postId: comments.postId });
  if (!rows[0]) return false;
  await recountComments(rows[0].postId);
  return true;
}
