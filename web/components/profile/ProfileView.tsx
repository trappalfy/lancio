"use client";

import type { AccountResponse, Hex } from "@lancio/shared";
import { useState, type ReactNode } from "react";
import { useAccount } from "wagmi";
import { AccountPostsTab } from "@/components/forum/AccountPostsTab";
import { Card, PillTabs, Skeleton } from "@/components/ui";
import { ApiError, useAccount as useAccountData, useHoldings } from "@/lib/api";
import { CreatedGrid } from "./CreatedGrid";
import { CreatorFees } from "./CreatorFees";
import { HoldingsList } from "./HoldingsList";
import { ProfileHeader } from "./ProfileHeader";
import { TradesList } from "./TradesList";

type Tab = "created" | "holdings" | "trades" | "posts";

const is404 = (e: unknown) => e instanceof ApiError && e.status === 404;

function Label({ text, count }: { text: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {count !== undefined && <span className="text-xs text-muted tabular">{count}</span>}
    </span>
  );
}

function Loading() {
  return (
    <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] rounded-card" />
      ))}
    </div>
  );
}

const Unavailable = () => <p className="py-10 text-center text-sm text-muted">Profile data is unavailable right now. Retrying.</p>;

export function ProfileView({ address }: { address: Hex }) {
  const { address: connected } = useAccount();
  const isOwn = !!connected && connected.toLowerCase() === address.toLowerCase();
  const [tab, setTab] = useState<Tab>("created");

  const acc = useAccountData(address);
  const hold = useHoldings(address);
  // An address the indexer has never seen is an empty profile, not an error.
  const account: AccountResponse | undefined =
    acc.data ?? (is404(acc.error) ? { address, created: [], creatorFeesAccruedEth: "0", creatorFeesClaimedEth: "0", tradesCount: 0 } : undefined);
  const holdings = hold.data ?? (is404(hold.error) ? [] : undefined);

  let body: ReactNode;
  if (tab === "created") body = account ? <CreatedGrid tokens={account.created} isOwn={isOwn} /> : acc.isError ? <Unavailable /> : <Loading />;
  else if (tab === "holdings") body = holdings ? <HoldingsList holdings={holdings} /> : hold.isError ? <Unavailable /> : <Loading />;
  else if (tab === "trades") body = <TradesList address={address} />;
  else body = <AccountPostsTab address={address} />;

  return (
    <div className="container-page flex flex-col gap-4 py-8 md:gap-6 md:py-12">
      <ProfileHeader address={address} isOwn={isOwn} account={account} holdingsCount={holdings?.length} />
      {isOwn && <CreatorFees address={address} account={account} />}
      <Card as="section" aria-label="Profile activity">
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <PillTabs
            aria-label="Profile sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: "created", label: <Label text="Created" count={account?.created.length} /> },
              { value: "holdings", label: <Label text="Holdings" count={holdings?.length} /> },
              { value: "trades", label: <Label text="Trades" count={account?.tradesCount} /> },
              { value: "posts", label: <Label text="Posts" /> },
            ]}
          />
        </div>
        <div className="mt-6">{body}</div>
      </Card>
    </div>
  );
}
