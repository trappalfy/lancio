"use client";

import { COPY, formatProgress, type TokenSummary } from "@lancio/shared";
import Link from "next/link";
import { TimeAgo, TokenImage } from "@/components/common";
import { Badge, Button, EmptyState, ProgressBar } from "@/components/ui";
import { useFormatUsd } from "@/lib/usd";

function ProfileTokenCard({ t }: { t: TokenSummary }) {
  const usd = useFormatUsd();
  const graduated = t.status === "graduated";
  return (
    <Link
      href={`/launchpad/${t.address}`}
      className="group block rounded-card bg-surface-2 p-3 transition-colors hover:bg-border/50 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-square overflow-hidden rounded-image">
        <TokenImage src={t.meta.image} alt={t.name} seed={t.address} size="fill" sizes="(min-width: 1024px) 240px, (min-width: 768px) 30vw, (min-width: 480px) 45vw, 90vw" />
        {graduated && <Badge variant="graduated" className="absolute top-2 left-2" />}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="truncate font-medium text-text">{t.name}</p>
        <TimeAgo ts={t.createdAt} className="shrink-0 text-xs" />
      </div>
      <p className="truncate text-13 text-muted">{t.symbol}</p>
      <div className="mt-3 flex items-center justify-between text-13">
        <span className="text-muted">Market cap</span>
        <span className="text-text tabular">{usd(t.mcapEth)}</span>
      </div>
      {graduated ? (
        <p className="mt-2.5 text-13 text-accent-text">Trading in the locked pool</p>
      ) : (
        <div className="mt-2.5 flex items-center gap-2">
          <ProgressBar bps={t.progressBps} />
          <span className="shrink-0 text-xs text-muted tabular">{formatProgress(t.progressBps)}</span>
        </div>
      )}
    </Link>
  );
}

export function CreatedGrid({ tokens, isOwn }: { tokens: TokenSummary[]; isOwn: boolean }) {
  if (tokens.length === 0) {
    return isOwn ? (
      <EmptyState
        image="/brand/painting-colleganza.png"
        title={COPY.profile.empty}
        action={<Button href="/launchpad/create">{COPY.hero.ctaLaunch}</Button>}
      />
    ) : (
      <p className="py-10 text-center text-sm text-muted">No tokens launched from this address.</p>
    );
  }
  const sorted = [...tokens].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {sorted.map((t) => (
        <ProfileTokenCard key={t.address} t={t} />
      ))}
    </div>
  );
}
