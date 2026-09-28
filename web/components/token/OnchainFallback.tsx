"use client";

import { mcapWeiOf, priceWeiOf, progressBpsOf, shortAddress, type Hex, type TokenDetail } from "@lancio/shared";
import { launchpadAbi, tokenAbi } from "@lancio/shared/abi";
import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { Button, Card, EmptyState } from "@/components/ui";
import { LIVE_MS } from "@/lib/api";
import { config } from "@/lib/config";
import { isZeroAddress } from "./links";
import { TokenPageSkeleton } from "./TokenPageSkeleton";
import { TokenView } from "./TokenView";
import type { Side, TokenTab } from "./types";

/**
 * The indexer has no record of this token (just launched) or is unreachable: read the curve and the
 * ERC-20 name/symbol straight from Robinhood Chain and render the page with an "Indexing…" note.
 * getCurve().creator == 0 → not a Lancio token.
 */
export function OnchainFallback({
  address,
  notIndexed,
  initialSide,
  initialTab,
}: {
  address: Hex;
  /** true: the indexer answered 404; false: the indexer failed. */
  notIndexed: boolean;
  initialSide?: Side;
  initialTab?: TokenTab;
}) {
  const launchpad = config.deployment.launchpad;
  const configured = !isZeroAddress(launchpad);
  const reads = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: launchpad, abi: launchpadAbi, functionName: "getCurve", args: [address] },
      { address, abi: tokenAbi, functionName: "name" },
      { address, abi: tokenAbi, functionName: "symbol" },
    ],
    query: { enabled: configured, refetchInterval: LIVE_MS },
  });

  const [curveRes, nameRes, symbolRes] = reads.data ?? [];
  const curve = curveRes?.status === "success" ? curveRes.result : undefined;

  const token = useMemo<TokenDetail | null>(() => {
    if (!curve || isZeroAddress(curve.creator)) return null;
    const s = { vEth: curve.vEth, vTok: curve.vTok };
    const graduated = curve.graduated;
    return {
      address: address.toLowerCase() as Hex,
      name: nameRes?.status === "success" ? nameRes.result : shortAddress(address),
      symbol: symbolRes?.status === "success" ? symbolRes.result : "",
      creator: curve.creator.toLowerCase() as Hex,
      createdAt: 0,
      createdBlock: Number(curve.createdBlock),
      status: graduated ? "graduated" : "curve",
      metadataUri: "",
      meta: { description: null, image: null, x: null, telegram: null, website: null },
      vEth: curve.vEth.toString(),
      vTok: curve.vTok.toString(),
      realEth: curve.realEth.toString(),
      progressBps: graduated ? 10_000 : progressBpsOf(s),
      priceEth: priceWeiOf(s).toString(),
      mcapEth: mcapWeiOf(s).toString(),
      volumeEth24h: "0",
      volumeEth7d: "0",
      volumeEthAll: "0",
      change24hPct: null,
      tradesCount: 0,
      holdersCount: 0,
      lastBuyAt: null,
      lastTradeAt: null,
      graduatedAt: null,
      poolId: null,
      creatorFeesAccruedEth: curve.creatorFees.toString(),
      creatorFeesClaimedEth: "0",
    };
  }, [address, curve, nameRes, symbolRes]);

  if (configured && reads.isPending) return <TokenPageSkeleton />;

  if (configured && !curve)
    return (
      <div className="container-page py-10 md:py-16">
        <Card className="text-center">
          <p className="text-base text-text">This token could not be read from Robinhood Chain right now.</p>
          <Button variant="outline" className="mt-6" onClick={() => reads.refetch()} loading={reads.isFetching}>
            Try again
          </Button>
        </Card>
      </div>
    );

  if (!token)
    return (
      <div className="container-page py-10 md:py-16">
        <Card>
          <EmptyState
            image="/brand/painting-gate.png"
            title="This address is not a Lancio token."
            description={<span className="font-mono break-all">{address}</span>}
            action={
              <Button href="/" variant="outline">
                Back to Explore
              </Button>
            }
          />
        </Card>
      </div>
    );

  const notice = notIndexed
    ? "Indexing… This token is live onchain. Its chart, trades and holders appear once the indexer catches up."
    : "Market data is unavailable right now. Showing the live contract state from Robinhood Chain.";

  return <TokenView token={token} indexing notice={notice} initialSide={initialSide} initialTab={initialTab} />;
}
