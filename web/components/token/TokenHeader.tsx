"use client";

import { formatCount, formatPct, formatPriceEth, type TokenDetail } from "@lancio/shared";
import { Globe } from "lucide-react";
import type { ReactNode } from "react";
import { AddressLink, TimeAgo, TokenImage } from "@/components/common";
import { Badge, Card, Spinner, TelegramIcon, XIcon } from "@/components/ui";
import { useFormatUsd } from "@/lib/usd";
import { cn } from "@/lib/utils";
import { socialUrl } from "./links";

export function TokenHeader({ token, notice, className }: { token: TokenDetail; notice?: ReactNode; className?: string }) {
  const fmtUsd = useFormatUsd();
  const graduated = token.status === "graduated";
  const change = token.change24hPct;
  const socials: { href: string; label: string; icon: ReactNode }[] = [];
  const add = (href: string | null, label: string, icon: ReactNode) => href && socials.push({ href, label, icon });
  add(socialUrl(token.meta.x, "x"), "X", <XIcon size={15} />);
  add(socialUrl(token.meta.telegram, "telegram"), "Telegram", <TelegramIcon size={16} />);
  add(socialUrl(token.meta.website, "website"), "Website", <Globe size={16} />);

  return (
    <Card className={className}>
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-4">
          <TokenImage src={token.meta.image} alt={token.name} seed={token.address} size={80} priority />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate text-28 font-semibold tracking-tight text-text">{token.name}</h1>
              <span className="text-xl text-muted">${token.symbol}</span>
              <Badge variant={graduated ? "graduated" : "curve"}>{graduated ? undefined : "On the curve"}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-13 text-muted">
              <AddressLink address={token.address} kind="token" copy />
              <span className="inline-flex items-center gap-1.5">
                Created by
                <AddressLink address={token.creator} href={`/profile/${token.creator}`} />
              </span>
              {token.createdAt ? (
                <span className="inline-flex items-center gap-1.5">
                  Launched <TimeAgo ts={token.createdAt} />
                </span>
              ) : (
                <span className="tabular">Block {token.createdBlock.toLocaleString("en-US")}</span>
              )}
            </div>
            {socials.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5">
                {socials.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer nofollow ugc"
                    aria-label={s.label}
                    title={s.label}
                    className="grid size-8 place-items-center rounded-full bg-surface-2 text-muted transition-colors hover:text-text"
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 md:text-right">
          <div className="text-13 text-muted">Market cap</div>
          <div className="mt-1 text-28 font-medium tracking-tight text-text tabular md:text-40">{fmtUsd(token.mcapEth)}</div>
          <div className="mt-1 text-13">
            <span className={cn("tabular", change == null ? "text-muted" : change > 0 ? "text-buy" : change < 0 ? "text-sell" : "text-muted")}>
              {change == null ? "—" : formatPct(change, { sign: true })}
            </span>{" "}
            <span className="text-muted">24h</span>
          </div>
        </div>
      </div>

      {notice ? (
        <div className="mt-6 flex items-start gap-2.5 rounded-card bg-accent-soft px-4 py-3 text-13 text-accent-text">
          <Spinner size={14} className="mt-0.5 shrink-0" />
          <div>{notice}</div>
        </div>
      ) : (
        <dl className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <Stat label="Price" value={formatPriceEth(token.priceEth)} />
          <Stat label="Volume 24h" value={fmtUsd(token.volumeEth24h)} />
          <Stat label="Holders" value={formatCount(token.holdersCount)} />
          <Stat label="Trades" value={formatCount(token.tradesCount)} />
        </dl>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-card bg-surface-2 px-4 py-3">
      <dt className="text-13 text-muted">{label}</dt>
      <dd className="mt-1 truncate text-base font-medium text-text tabular">{value}</dd>
    </div>
  );
}
