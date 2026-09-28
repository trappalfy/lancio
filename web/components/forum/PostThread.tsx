"use client";

import { formatCount } from "@lancio/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TimeAgo } from "@/components/common";
import { Badge, Button, Card, CardHeader, CountPill, EmptyState, Field, Skeleton, Textarea } from "@/components/ui";
import { ForumError } from "@/db/fetch";
import { FORUM_LIMITS, type ForumComment, type ForumPost, type PostResponse } from "@/db/types";
import { useSiwe } from "@/lib/siwe";
import { cn } from "@/lib/utils";
import { forumApi, forumKeys, patchPost, usePost } from "./api";
import { Author, PostBody, PostCard } from "./PostCard";
import { FeedError, FeedSkeleton } from "./PostFeed";
import { SignInGate } from "./SignInGate";

function CommentForm({ post }: { post: ForumPost }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const siwe = useSiwe();
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError("Write a comment first.");
    setSaving(true);
    setError(null);
    try {
      const comment = await forumApi.createComment({ postId: post.id, body });
      qc.setQueryData<PostResponse>(forumKeys.post(post.id), (d) => (d ? { ...d, comments: [...d.comments, comment] } : d));
      patchPost(qc, post.id, (p) => ({ commentsCount: p.commentsCount + 1 }));
      setBody("");
    } catch (err) {
      if (err instanceof ForumError && err.status === 401) siwe.refresh();
      setError(err instanceof ForumError ? err.message : "Could not comment. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SignInGate action="comment">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label="Your comment"
          htmlFor={id}
          error={error}
          aside={`${body.length.toLocaleString("en-US")} / ${FORUM_LIMITS.comment.toLocaleString("en-US")}`}
        >
          <Textarea id={id} rows={3} value={body} maxLength={FORUM_LIMITS.comment} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={saving} disabled={!body.trim()}>
            Comment
          </Button>
        </div>
      </form>
    </SignInGate>
  );
}

function CommentItem({ comment, symbol }: { comment: ForumComment; symbol?: string | null }) {
  const siwe = useSiwe();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function toggleHidden() {
    setBusy(true);
    try {
      await forumApi.hide({ kind: "comment", id: comment.id, hidden: !comment.hidden });
      await qc.invalidateQueries({ queryKey: ["forum"] });
      toast.success(comment.hidden ? "Comment is visible again." : "Comment hidden.");
    } catch (err) {
      toast.error(err instanceof ForumError ? err.message : "Could not update the comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("py-4", comment.hidden && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-13">
        <Author address={comment.author} holder={comment.authorIsHolder} symbol={symbol} />
        <span aria-hidden className="text-muted">
          ·
        </span>
        <TimeAgo ts={comment.createdAt} className="text-13" />
        {comment.hidden && <Badge variant="crimson">Hidden</Badge>}
        {siwe.isAdmin && (
          <Button variant="ghost" size="sm" className="ml-auto h-7" loading={busy} onClick={() => void toggleHidden()}>
            {comment.hidden ? "Unhide" : "Hide"}
          </Button>
        )}
      </div>
      <PostBody text={comment.body} clamp={false} className="mt-1.5 pl-6" />
    </li>
  );
}

/** /forum/post/[id]: the post, a comment form and flat comments (oldest first). */
export function PostThread({ id }: { id: number }) {
  const q = usePost(id);

  if (q.isPending)
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-5 w-32" />
        <Card padded={false} className="px-5 md:px-8">
          <FeedSkeleton rows={1} />
        </Card>
      </div>
    );
  if (q.isError) {
    if (q.error instanceof ForumError && q.error.status === 404)
      return (
        <Card>
          <EmptyState
            image="/brand/painting-gate.png"
            title="This post is not here."
            description="It may have been hidden by a moderator."
            action={
              <Button href="/forum" variant="outline">
                Back to Forum
              </Button>
            }
          />
        </Card>
      );
    return (
      <Card>
        <FeedError error={q.error} onRetry={() => void q.refetch()} />
      </Card>
    );
  }

  const { post, comments } = q.data;
  const symbol = post.tokenInfo?.symbol;
  return (
    <div className="flex flex-col gap-5">
      <Link href={`/forum/${post.token}`} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-text">
        <ArrowLeft size={16} />
        {symbol ? `$${symbol} room` : "Token room"}
      </Link>
      <Card padded={false} className="px-5 md:px-8">
        <PostCard post={post} clamp={false} linkTitle={false} />
      </Card>
      <Card>
        <CardHeader title="Comments" count={<CountPill>{formatCount(post.commentsCount)}</CountPill>} />
        <div className="mt-5">
          <CommentForm post={post} />
        </div>
        {comments.length ? (
          <ul className="mt-4 divide-y divide-border">
            {comments.map((c) => (
              <CommentItem key={c.id} comment={c} symbol={symbol} />
            ))}
          </ul>
        ) : (
          <p className="pt-6 text-sm text-muted">No comments yet.</p>
        )}
      </Card>
    </div>
  );
}
