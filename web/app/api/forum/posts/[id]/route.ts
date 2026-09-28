import { enrichComments, enrichPosts } from "@/db/enrich";
import { getPost, listComments } from "@/db/forum";
import { fail, ok, parsePostId, serverError } from "@/db/http";
import type { PostResponse } from "@/db/types";
import { getViewer } from "@/lib/session";

/** GET /api/forum/posts/:id → PostResponse (post + flat comments, oldest first). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePostId((await params).id);
  if (!id) return fail(404, "Post not found.");
  try {
    const viewer = await getViewer();
    const row = await getPost(id, viewer.address);
    if (!row || (row.hidden && !viewer.isAdmin)) return fail(404, "Post not found.");
    const [[post], comments] = await Promise.all([
      enrichPosts([row], viewer.isAdmin),
      listComments(id, viewer.isAdmin).then((rows) => enrichComments(row.token, rows)),
    ]);
    return ok<PostResponse>({ post, comments });
  } catch (err) {
    return serverError(err);
  }
}
