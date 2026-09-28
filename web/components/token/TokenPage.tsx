"use client";

import type { Hex, TokenDetail } from "@lancio/shared";
import { ApiError, useToken } from "@/lib/api";
import { OnchainFallback } from "./OnchainFallback";
import { TokenPageSkeleton } from "./TokenPageSkeleton";
import { TokenView } from "./TokenView";
import type { Side, TokenTab } from "./types";

/**
 * Client entry for /launchpad/[address]. `initial` is the server-fetched token (null when the indexer
 * had none); live updates come from useToken. No indexer record → chain fallback.
 */
export function TokenPage({
  address,
  initial,
  initialSide,
  initialTab,
}: {
  address: Hex;
  initial: TokenDetail | null;
  initialSide?: Side;
  initialTab?: TokenTab;
}) {
  const q = useToken(address);
  const token = q.data ?? initial;

  if (token) return <TokenView token={token} initialSide={initialSide} initialTab={initialTab} />;
  if (q.isPending) return <TokenPageSkeleton />;
  return (
    <OnchainFallback
      address={address}
      notIndexed={q.error instanceof ApiError && q.error.status === 404}
      initialSide={initialSide}
      initialTab={initialTab}
    />
  );
}
