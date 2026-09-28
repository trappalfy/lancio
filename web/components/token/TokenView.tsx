"use client";

import type { TokenDetail } from "@lancio/shared";
import type { ReactNode } from "react";
import { useState } from "react";
import { useAccount as useWallet } from "wagmi";
import { CreatorFeesCard } from "@/components/trade/CreatorFeesCard";
import { GraduationProgress } from "@/components/trade/GraduationProgress";
import { TradePanel } from "@/components/trade/TradePanel";
import { Button, Card, Sheet } from "@/components/ui";
import { sameAddress } from "./links";
import { TokenChart } from "./TokenChart";
import { TokenHeader } from "./TokenHeader";
import { TokenTabs } from "./TokenTabs";
import type { Side, TokenTab } from "./types";
import { useIsDesktop } from "./useIsDesktop";

/**
 * Token page body. Desktop: two columns (header, chart, tabs | trade panel, progress, creator fees).
 * Mobile: one column (header, progress, creator fees, chart, tabs) + a sticky Buy / Sell bar that opens
 * the trade panel in a bottom sheet. `indexing`: the indexer has no data yet (token built from chain reads).
 */
export function TokenView({
  token,
  indexing,
  notice,
  initialSide,
  initialTab,
}: {
  token: TokenDetail;
  indexing?: boolean;
  notice?: ReactNode;
  initialSide?: Side;
  initialTab?: TokenTab;
}) {
  const { address: wallet } = useWallet();
  const isDesktop = useIsDesktop();
  const isCreator = sameAddress(wallet, token.creator);

  return (
    <div className="container-page pt-6 pb-6 md:pt-10 lg:pb-16">
      <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr]">
        <TokenHeader token={token} notice={notice} className="min-w-0 lg:col-start-1" />

        <aside className="min-w-0 space-y-4 md:space-y-6 lg:col-start-2 lg:row-span-3 lg:row-start-1">
          <div className="hidden lg:block">{isDesktop && <TradePanel token={token} initialSide={initialSide} />}</div>
          <Card>
            <GraduationProgress token={token} />
          </Card>
          {isCreator && <CreatorFeesCard token={token} />}
        </aside>

        <TokenChart token={token} indexing={indexing} className="min-w-0 lg:col-start-1" />
        <TokenTabs token={token} indexing={indexing} initialTab={initialTab} className="min-w-0 self-start lg:col-start-1" />
      </div>

      {!isDesktop && <MobileTradeBar token={token} initialSide={initialSide} />}
    </div>
  );
}

/** Sticky at the bottom of the viewport while the page body is in view; opens the sheet on ?side=buy|sell. */
function MobileTradeBar({ token, initialSide }: { token: TokenDetail; initialSide?: Side }) {
  const [side, setSide] = useState<Side>(initialSide ?? "buy");
  const [open, setOpen] = useState(!!initialSide);
  const openSide = (s: Side) => {
    setSide(s);
    setOpen(true);
  };

  return (
    <>
      <div className="sticky bottom-0 z-40 mt-4 pt-2 pb-[max(12px,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex gap-2 rounded-full border border-border bg-surface/95 p-1.5 shadow-pop backdrop-blur">
          <Button variant="buy" size="lg" className="flex-1" onClick={() => openSide("buy")}>
            Buy
          </Button>
          <Button variant="sell" size="lg" className="flex-1" onClick={() => openSide("sell")}>
            Sell
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen} side="bottom" title={`Trade $${token.symbol}`}>
        <TradePanel key={side} token={token} initialSide={side} />
      </Sheet>
    </>
  );
}
