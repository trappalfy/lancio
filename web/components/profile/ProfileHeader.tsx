import { explorerAddress, formatCount, shortAddress, type AccountResponse } from "@lancio/shared";
import { ArrowUpRight } from "lucide-react";
import { CopyButton, Identicon } from "@/components/common";
import { Badge, Card, Skeleton } from "@/components/ui";

export function ProfileHeader({
  address,
  isOwn,
  account,
  holdingsCount,
}: {
  address: string;
  isOwn: boolean;
  account: AccountResponse | undefined;
  holdingsCount: number | undefined;
}) {
  const stats: { label: string; value: number | undefined }[] = [
    { label: "Tokens launched", value: account?.created.length },
    { label: "Tokens held", value: holdingsCount },
    { label: "Trades", value: account?.tradesCount },
  ];
  return (
    <Card texture className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-4 md:gap-5">
        <Identicon address={address} size={72} className="ring-2 ring-border" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-13 text-muted">Profile</span>
            {isOwn && <Badge variant="new">You</Badge>}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <h1 className="truncate font-mono text-xl text-text md:text-28" title={address}>
              <span className="lg:hidden">{shortAddress(address)}</span>
              <span className="hidden lg:inline">{address}</span>
            </h1>
            <CopyButton value={address} label="Copy address" size={16} className="size-8" />
            <a
              href={explorerAddress(address)}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in explorer"
              title="Open in explorer"
              className="inline-grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 md:flex md:gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card bg-surface-2 px-4 py-3 md:min-w-28">
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className="mt-1 text-xl font-medium text-text tabular">
              {s.value === undefined ? <Skeleton className="h-6 w-10" /> : formatCount(s.value)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
