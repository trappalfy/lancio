"use client";

import type { TokenDetail } from "@lancio/shared";
import { useState } from "react";
import { TokenForumTab } from "@/components/forum/TokenForumTab";
import { Card, PillTabs } from "@/components/ui";
import { AboutTab } from "./AboutTab";
import { HoldersTab } from "./HoldersTab";
import { TradesTab } from "./TradesTab";
import type { TokenTab } from "./types";

const ITEMS: { value: TokenTab; label: string }[] = [
  { value: "trades", label: "Trades" },
  { value: "holders", label: "Holders" },
  { value: "forum", label: "Forum" },
  { value: "about", label: "About" },
];

export function TokenTabs({
  token,
  indexing,
  initialTab = "trades",
  className,
}: {
  token: TokenDetail;
  indexing?: boolean;
  initialTab?: TokenTab;
  className?: string;
}) {
  const [tab, setTab] = useState<TokenTab>(initialTab);
  const waiting = indexing && (tab === "trades" || tab === "holders");

  return (
    <Card className={className}>
      <PillTabs aria-label="Token details" value={tab} onChange={setTab} items={ITEMS} />
      <div className="mt-5">
        {waiting ? (
          <p className="py-10 text-center text-sm text-muted">Indexing… {tab === "trades" ? "Trades" : "Holders"} appear here in a few seconds.</p>
        ) : tab === "trades" ? (
          <TradesTab token={token} />
        ) : tab === "holders" ? (
          <HoldersTab token={token} />
        ) : tab === "forum" ? (
          <TokenForumTab token={token} />
        ) : (
          <AboutTab token={token} />
        )}
      </div>
    </Card>
  );
}
