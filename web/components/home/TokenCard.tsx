"use client";

import { COPY, formatProgress, shortAddress, type TokenSummary } from "@lancio/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { TimeAgo, TokenImage, UsdAmount } from "@/components/common";
import { Badge, ProgressBar, Skeleton, Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";

const NEW_SECONDS = 3600;
const LAST_BUY_FRESH_SECONDS = 60;
const IMAGE_SIZES = "(min-width: 1280px) 220px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 480px) 50vw, 100vw";

export const tokenHref = (t: Pick<TokenSummary, "address">) => `/launchpad/${t.address}`;

/** The "Graduated" badge with its explanation. Focusable so the tooltip also works from the keyboard. */
export function GraduatedBadge() {
  return (
    <Tooltip content={COPY.graduated.badgeTooltip}>
      <button type="button" aria-label={`Graduated. ${COPY.graduated.badgeTooltip}`} className="relative z-10 rounded-full">
        <Badge variant="graduated" />
      </button>
    </Tooltip>
  );
}

/**
 * Card shell: the whole card is clickable through the name link stretched over it (after:inset-0),
 * so the badge tooltip stays a separate focusable element (no interactive content nested in <a>).
 */
function CardShell({ token, badges, children }: { token: TokenSummary; badges?: ReactNode; children: ReactNode }) {
  return (
    <article className="group relative flex flex-col rounded-card bg-surface-2 p-2.5 transition-[box-shadow,translate] duration-150 focus-within:ring-2 focus-within:ring-accent hover:-translate-y-0.5 hover:shadow-pop motion-reduce:hover:translate-y-0">
      <div className="relative aspect-square w-full overflow-hidden rounded-image">
        <TokenImage src={token.meta.image} alt="" seed={token.address} size="fill" sizes={IMAGE_SIZES} />
        {badges && <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">{badges}</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-1.5 pt-3 pb-1">
        <h3 className="truncate text-base font-medium text-text">
          <Link href={tokenHref(token)} className="outline-none after:absolute after:inset-0 after:rounded-card after:content-['']">
            {token.name}
          </Link>
        </h3>
        <p className="truncate text-13 text-muted">${token.symbol}</p>
        {children}
      </div>
    </article>
  );
}

function Mcap({ token }: { token: TokenSummary }) {
  return (
    <p className="mt-2 flex items-baseline gap-1.5">
      <UsdAmount wei={token.mcapEth} className="text-lg font-semibold text-text" />
      <span className="text-xs text-muted">MC</span>
    </p>
  );
}

/** Explore card: image, badges, name, $TICKER, market cap, progress to graduation, address, last buy. */
export function TokenCard({ token, now }: { token: TokenSummary; now: number }) {
  const graduated = token.status === "graduated";
  const isNew = now - token.createdAt < NEW_SECONDS;
  const badges = (graduated || isNew) && (
    <>
      {graduated && <GraduatedBadge />}
      {isNew && <Badge variant="new">New</Badge>}
    </>
  );
  return (
    <CardShell token={token} badges={badges || undefined}>
      <Mcap token={token} />
      <div className="mt-2.5 flex items-center gap-2.5">
        <ProgressBar bps={graduated ? 10_000 : token.progressBps} className="flex-1" />
        <span className="text-13 text-muted tabular">{formatProgress(token.progressBps, graduated)}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-13">
        <span className="font-mono text-muted" title={token.address}>
          {shortAddress(token.address)}
        </span>
        <TimeAgo ts={token.lastBuyAt} freshSeconds={LAST_BUY_FRESH_SECONDS} className="text-13" />
      </div>
    </CardShell>
  );
}

/** Graduated card: image, Graduated badge, name, $TICKER, market cap, address, age since graduation. */
export function GraduatedCard({ token }: { token: TokenSummary }) {
  return (
    <CardShell token={token} badges={<GraduatedBadge />}>
      <Mcap token={token} />
      <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 text-13">
        <span className="font-mono text-muted" title={token.address}>
          {shortAddress(token.address)}
        </span>
        <TimeAgo ts={token.graduatedAt} freshSeconds={0} className="text-13" />
      </div>
    </CardShell>
  );
}

export function TokenCardSkeleton({ progress = true, className }: { progress?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col rounded-card bg-surface-2 p-2.5", className)}>
      <Skeleton className="aspect-square w-full rounded-image bg-border/60" />
      <div className="px-1.5 pt-3 pb-1">
        <Skeleton className="h-5 w-2/3 bg-border/60" />
        <Skeleton className="mt-1.5 h-4 w-1/3 bg-border/60" />
        <Skeleton className="mt-3 h-6 w-1/2 bg-border/60" />
        {progress && <Skeleton className="mt-3 h-1.5 w-full bg-border/60" />}
        <Skeleton className="mt-3 h-4 w-full bg-border/60" />
      </div>
    </div>
  );
}
