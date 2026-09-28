import { z } from "zod";
import { setHidden } from "@/db/forum";
import { fail, ID_MAX, ok, readJson, serverError } from "@/db/http";
import { getViewer } from "@/lib/session";

const Hide = z.object({
  kind: z.enum(["post", "comment"]),
  id: z.number().int().positive().max(ID_MAX),
  hidden: z.boolean().default(true),
});

/** POST /api/forum/hide { kind: "post" | "comment", id, hidden } — FORUM_ADMINS only. */
export async function POST(req: Request) {
  const { data, error } = await readJson(req, Hide);
  if (error) return error;
  try {
    const viewer = await getViewer();
    if (!viewer.address) return fail(401, "Sign in first.");
    if (!viewer.isAdmin) return fail(403, "Only forum admins can hide posts.");
    const found = await setHidden(data.kind, data.id, data.hidden);
    if (!found) return fail(404, "Not found.");
    return ok({ ok: true, hidden: data.hidden });
  } catch (err) {
    return serverError(err);
  }
}
