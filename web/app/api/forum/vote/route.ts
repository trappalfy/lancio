import { z } from "zod";
import { getPost, setVote } from "@/db/forum";
import { fail, ID_MAX, ok, readJson, serverError } from "@/db/http";
import { takeRateLimit } from "@/db/ratelimit";
import type { VoteResponse, VoteValue } from "@/db/types";
import { getViewer } from "@/lib/session";

const Vote = z.object({
  postId: z.number().int().positive().max(ID_MAX),
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

/** POST /api/forum/vote { postId, value: 1 | -1 | 0 (clear) } → VoteResponse. Requires a SIWE session. */
export async function POST(req: Request) {
  const { data, error } = await readJson(req, Vote);
  if (error) return error;
  try {
    const viewer = await getViewer();
    if (!viewer.address) return fail(401, "Sign in to vote.");
    const post = await getPost(data.postId, viewer.address);
    if (!post || post.hidden) return fail(404, "Post not found.");

    const wait = takeRateLimit("vote", viewer.address);
    if (wait) return fail(429, `Vote limit reached. Try again in ${Math.ceil(wait / 60)} min.`, { "retry-after": String(wait) });

    const score = await setVote(post.id, viewer.address, data.value as VoteValue);
    return ok<VoteResponse>({ score, myVote: data.value as VoteValue });
  } catch (err) {
    return serverError(err);
  }
}
