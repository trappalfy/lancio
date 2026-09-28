"use client";

import { formatCount, shortAddress } from "@lancio/shared";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Identicon, TimeAgo, TokenImage } from "@/components/common";
import { Badge, Button, buttonClass } from "@/components/ui";
import { ForumError } from "@/db/fetch";
import type { ForumPost, VoteValue } from "@/db/types";
import { useSiwe } from "@/lib/siwe";
import { cn } from "@/lib/utils";
import { cachedPost, forumApi, patchPost } from "./api";

const errorText = (err: unknown, fallback: string) => (err instanceof ForumError ? err.message : fallback);

/** Short address → profile, with a "Holder" chip when the author holds the token. */
export function Author({ address, holder, symbol }: { address: string; holder: boolean; symbol?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Link href={`/profile/${address}`} title={address} className="inline-flex items-center gap-1.5 font-mono text-13 text-muted transition-colors hover:text-text">
        <Identicon address={address} size={18} />
        {shortAddress(address)}
      </Link>
      {holder && (
        <span
          title={symbol ? `Holds $${symbol}` : "Holds this token"}
          className="inline-flex h-5 items-center rounded-full bg-accent-soft px-2 text-xs font-medium text-accent-text"
        >
          Holder
        </span>
      )}
    </span>
  );
}

function TokenTag({ post }: { post: ForumPost }) {
  const t = post.tokenInfo;
  return (
    <Link href={`/forum/${post.token}`} className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-text transition-colors hover:text-accent-text">
      <TokenImage src={t?.image} alt={t?.name ?? post.token} seed={post.token} size={20} />
      {t ? <span className="truncate">${t.symbol}</span> : <span className="font-mono text-13 font-normal">{shortAddress(post.token)}</span>}
    </Link>
  );
}

function VoteColumn({ post }: { post: ForumPost }) {
  const qc = useQueryClient();
  const siwe = useSiwe();
  const [pending, setPending] = useState(false);

  async function vote(dir: 1 | -1) {
    if (pending) return;
    if (!(await siwe.ensureSignedIn())) return;
    const current = cachedPost(qc, post.id) ?? post;
    const value: VoteValue = current.myVote === dir ? 0 : dir;
    const prev = { score: current.score, myVote: current.myVote };
    patchPost(qc, post.id, { myVote: value, score: current.score - current.myVote + value });
    setPending(true);
    try {
      patchPost(qc, post.id, await forumApi.vote({ postId: post.id, value }));
    } catch (err) {
      patchPost(qc, post.id, prev);
      if (err instanceof ForumError && err.status === 401) siwe.refresh();
      toast.error(errorText(err, "Vote failed. Try again."));
    } finally {
      setPending(false);
    }
  }

  const btn = "grid size-8 place-items-center rounded-full transition-colors hover:bg-surface-2 disabled:opacity-50";
  return (
    <div className="flex w-8 shrink-0 flex-col items-center pt-0.5">
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={post.myVote === 1}
        disabled={pending}
        onClick={() => void vote(1)}
        className={cn(btn, post.myVote === 1 ? "text-accent-text" : "text-muted hover:text-text")}
      >
        <ChevronUp size={20} />
      </button>
      <span className={cn("py-0.5 text-sm font-semibold tabular", post.myVote === 1 ? "text-accent-text" : post.myVote === -1 ? "text-sell" : "text-text")}>
        {formatCount(post.score)}
      </span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={post.myVote === -1}
        disabled={pending}
        onClick={() => void vote(-1)}
        className={cn(btn, post.myVote === -1 ? "text-sell" : "text-muted hover:text-text")}
      >
        <ChevronDown size={20} />
      </button>
    </div>
  );
}

/** Plain-text body. clamp: collapsed after ~8 lines with a fade and "Show more". */
export function PostBody({ text, clamp, className }: { text: string; clamp: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const collapsed = clamp && !expanded;

  useEffect(() => {
    const el = ref.current;
    if (!el || !collapsed) return;
    const ro = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, text]);

  return (
    <div className={className}>
      <div className="relative">
        <div ref={ref} className={cn("whitespace-pre-wrap break-words text-sm leading-6 text-text", collapsed && "max-h-48 overflow-hidden")}>
          {text}
        </div>
        {collapsed && overflows && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-surface to-transparent" />
        )}
      </div>
      {collapsed && overflows && (
        <button type="button" onClick={() => setExpanded(true)} className="mt-1 text-13 font-medium text-accent-text hover:underline">
          Show more
        </button>
      )}
    </div>
  );
}

export function PostCard({
  post,
  showToken = true,
  showBuy = true,
  clamp = true,
  linkTitle = true,
}: {
  post: ForumPost;
  showToken?: boolean;
  showBuy?: boolean;
  /** Collapse long bodies (feeds). The post page shows the full text. */
  clamp?: boolean;
  linkTitle?: boolean;
}) {
  const qc = useQueryClient();
  const siwe = useSiwe();
  const [hiding, setHiding] = useState(false);
  const href = `/forum/post/${post.id}`;
  const n = post.commentsCount;

  async function toggleHidden() {
    setHiding(true);
    try {
      await forumApi.hide({ kind: "post", id: post.id, hidden: !post.hidden });
      patchPost(qc, post.id, { hidden: !post.hidden });
      toast.success(post.hidden ? "Post is visible again." : "Post hidden.");
    } catch (err) {
      toast.error(errorText(err, "Could not update the post."));
    } finally {
      setHiding(false);
    }
  }

  const Title = linkTitle ? "h3" : "h1";
  return (
    <article className={cn("flex gap-3 py-5 md:gap-4", post.hidden && "opacity-60")}>
      <VoteColumn post={post} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-13">
          {showToken && <TokenTag post={post} />}
          <Author address={post.author} holder={post.authorIsHolder} symbol={post.tokenInfo?.symbol} />
          <span aria-hidden className="text-muted">
            ·
          </span>
          <TimeAgo ts={post.createdAt} className="text-13" />
          {post.hidden && <Badge variant="crimson">Hidden</Badge>}
        </div>
        <Title className={cn("mt-1.5 break-words font-semibold leading-snug text-text", linkTitle ? "text-lg" : "text-xl md:text-28 md:leading-tight")}>
          {linkTitle ? (
            <Link href={href} className="transition-colors hover:text-accent-text">
              {post.title}
            </Link>
          ) : (
            post.title
          )}
        </Title>
        {post.body && <PostBody text={post.body} clamp={clamp} className="mt-2" />}
        <div className="-ml-3 mt-3 flex flex-wrap items-center gap-2">
          <Link href={href} className={buttonClass("ghost", "sm")}>
            <MessageSquare size={15} />
            {formatCount(n)} {n === 1 ? "comment" : "comments"}
          </Link>
          {showBuy && (
            <Button href={`/launchpad/${post.token}?side=buy`} variant="outline" size="sm" className="text-buy">
              Buy
            </Button>
          )}
          {siwe.isAdmin && (
            <Button variant="ghost" size="sm" loading={hiding} onClick={() => void toggleHidden()}>
              {post.hidden ? "Unhide" : "Hide"}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
