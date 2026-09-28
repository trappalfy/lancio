import { z } from "zod";
import { enrichComments } from "@/db/enrich";
import { createComment, getPost } from "@/db/forum";
import { fail, ID_MAX, ok, readJson, serverError } from "@/db/http";
import { takeRateLimit } from "@/db/ratelimit";
import { FORUM_LIMITS, type ForumComment } from "@/db/types";
import { getViewer } from "@/lib/session";

const NewComment = z.object({
  postId: z.number().int().positive().max(ID_MAX),
  body: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim())
    .pipe(
      z
        .string()
        .min(1, "Write a comment first.")
        .max(FORUM_LIMITS.comment, `Comments are limited to ${FORUM_LIMITS.comment.toLocaleString("en-US")} characters.`),
    ),
});

/** POST /api/forum/comments { postId, body } → ForumComment (201). Requires a SIWE session. */
export async function POST(req: Request) {
  const { data, error } = await readJson(req, NewComment);
  if (error) return error;
  try {
    const viewer = await getViewer();
    if (!viewer.address) return fail(401, "Sign in to comment.");
    const post = await getPost(data.postId, viewer.address);
    if (!post || post.hidden) return fail(404, "Post not found.");

    const wait = takeRateLimit("comment", viewer.address);
    if (wait) return fail(429, `Comment limit reached. Try again in ${Math.ceil(wait / 60)} min.`, { "retry-after": String(wait) });

    const row = await createComment({ postId: post.id, author: viewer.address, body: data.body });
    const [comment] = await enrichComments(post.token, [row]);
    return ok<ForumComment>(comment, 201);
  } catch (err) {
    return serverError(err);
  }
}
