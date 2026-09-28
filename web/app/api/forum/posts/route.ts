import { z } from "zod";
import { enrichPosts } from "@/db/enrich";
import { createPost, listPosts } from "@/db/forum";
import { ADDRESS_RE, fail, ok, readJson, serverError } from "@/db/http";
import { takeRateLimit } from "@/db/ratelimit";
import { FORUM_LIMITS, FORUM_SORTS, type ForumPost, type PostsResponse } from "@/db/types";
import { api, ApiError } from "@/lib/api";
import { getViewer } from "@/lib/session";

const PAGE = 20;

const Query = z.object({
  token: z.string().regex(ADDRESS_RE, "Invalid token address.").optional(),
  author: z.string().regex(ADDRESS_RE, "Invalid author address.").optional(),
  sort: z.enum(FORUM_SORTS).default("hot"),
  cursor: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(PAGE),
});

/** GET /api/forum/posts?token=&author=&sort=hot|new|top&cursor= → PostsResponse (cursor = offset). */
export async function GET(req: Request) {
  const params = Object.fromEntries([...new URL(req.url).searchParams].filter(([, v]) => v !== ""));
  const parsed = Query.safeParse(params);
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid query.");
  const q = parsed.data;
  try {
    const viewer = await getViewer();
    const { rows, hasMore } = await listPosts({
      token: q.token?.toLowerCase(),
      author: q.author?.toLowerCase(),
      sort: q.sort,
      offset: q.cursor,
      limit: q.limit,
      viewer: viewer.address,
      includeHidden: viewer.isAdmin,
    });
    const items = await enrichPosts(rows, viewer.isAdmin);
    return ok<PostsResponse>({ items, nextCursor: hasMore ? String(q.cursor + rows.length) : null });
  } catch (err) {
    return serverError(err);
  }
}

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

const NewPost = z.object({
  token: z.string().regex(ADDRESS_RE, "Invalid token address."),
  title: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(1, "Add a title.")
        .max(FORUM_LIMITS.title, `Titles are limited to ${FORUM_LIMITS.title} characters.`),
    ),
  body: z
    .string()
    .default("")
    .transform(tidy)
    .pipe(z.string().max(FORUM_LIMITS.body, `Posts are limited to ${FORUM_LIMITS.body.toLocaleString("en-US")} characters.`)),
});

/** POST /api/forum/posts { token, title, body } → ForumPost (201). Requires a SIWE session. */
export async function POST(req: Request) {
  const { data, error } = await readJson(req, NewPost);
  if (error) return error;
  try {
    const viewer = await getViewer();
    if (!viewer.address) return fail(401, "Sign in to post.");

    const token = data.token.toLowerCase();
    try {
      await api.token(token);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return fail(400, "This token was not launched on Lancio.");
      return fail(503, "Token data is unavailable right now. Try again shortly.");
    }

    const wait = takeRateLimit("post", viewer.address);
    if (wait) return fail(429, `Posting limit reached. Try again in ${Math.ceil(wait / 60)} min.`, { "retry-after": String(wait) });

    const row = await createPost({ token, author: viewer.address, title: data.title, body: data.body });
    const [post] = await enrichPosts([row], viewer.isAdmin);
    return ok<ForumPost>(post, 201);
  } catch (err) {
    return serverError(err);
  }
}
