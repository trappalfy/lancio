"use client";

import { BPS, formatEth, formatTokens, PARAMS, POOL_SPLIT_BPS, type TokenDetail } from "@lancio/shared";
import { launchpadAbi, lockerAbi } from "@lancio/shared/abi";
import { useState } from "react";
import { zeroAddress } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { config } from "@/lib/config";
import { useTx } from "@/lib/tx";
import { cn } from "@/lib/utils";
import { LAUNCHPAD, LIVE, REFRESH_MS, useLiveCurve } from "./hooks";
import { NOT_CONFIGURED } from "./format";

const LOCKER = config.deployment.locker;

/**
 * Creator fees for this token (brief §11.3). Renders only for the token's current creator.
 * "Earned on the curve" = getCurve().creatorFees — unclaimed ETH held by the launchpad (after graduation it also
 * includes pool ETH fees already collected). "Waiting in the pool" = the creator's share of locker.pendingFees().
 */
export function CreatorFeesCard({ token }: { token: TokenDetail }) {
  const { address } = useAccount();
  const curve = useLiveCurve(token);
  const tx = useTx();
  const [running, setRunning] = useState<"claim" | "collect" | null>(null);
  const isCreator = !!address && address.toLowerCase() === curve.creator.toLowerCase();

  const pendingRead = useReadContract({
    address: LOCKER,
    abi: lockerAbi,
    functionName: "pendingFees",
    args: [token.address],
    query: { enabled: LIVE && isCreator && curve.graduated && LOCKER !== zeroAddress, refetchInterval: REFRESH_MS * 3 },
  });

  if (!isCreator) return null;

  const fallbackEarned = BigInt(token.creatorFeesAccruedEth) - BigInt(token.creatorFeesClaimedEth);
  const earned = curve.creatorFees ?? (fallbackEarned > 0n ? fallbackEarned : 0n);
  const share = (v: bigint) => (v * POOL_SPLIT_BPS) / BPS;
  const pendingEth = pendingRead.data ? share(pendingRead.data[0]) : 0n;
  const pendingTok = pendingRead.data ? share(pendingRead.data[1]) : 0n;
  const hasPending = pendingEth > 0n || pendingTok > 0n;
  const busy = tx.busy;

  const track = (kind: "claim" | "collect", p: Promise<unknown>) => {
    setRunning(kind);
    void p.finally(() => setRunning(null));
  };
  const claim = () =>
    track(
      "claim",
      tx.run(
      () =>
        tx.writeContractAsync({
          address: LAUNCHPAD,
          abi: launchpadAbi,
          functionName: "claimCreatorFees",
          args: [[token.address]],
        }),
        { pending: "Claiming…", success: `Claimed ${formatEth(earned)}` },
      ),
    );
  const collect = () =>
    track(
      "collect",
      tx.run(
        () => tx.writeContractAsync({ address: LOCKER, abi: lockerAbi, functionName: "collectFees", args: [token.address] }),
        { pending: "Collecting pool fees…", success: "Pool fees collected" },
      ),
    );

  return (
    <div className="rounded-card bg-surface-2 p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-xl text-text">Creator fees</h3>
        <span className="text-13 text-muted tabular">Lifetime {formatEth(token.creatorFeesAccruedEth)}</span>
      </div>

      <dl className="mt-4 flex flex-col gap-3">
        <FeeLine
          label="Earned on the curve"
          hint={
            curve.graduated
              ? "Unclaimed ETH, including pool fees already collected."
              : `Unclaimed ETH from your ${PARAMS.creatorFeePct} of every curve trade.`
          }
          value={formatEth(earned)}
        />
        {curve.graduated && (
          <FeeLine
            label="Waiting in the pool"
            hint={`Your ${PARAMS.poolSplit} share of uncollected pool fees. Collecting adds the ETH to your balance above and sends the tokens to your wallet.`}
            value={
              pendingRead.data
                ? `${formatEth(pendingEth)} + ${formatTokens(pendingTok, token.symbol)}`
                : LIVE
                  ? "…"
                  : "—"
            }
          />
        )}
      </dl>

      <div className={cn("mt-5 grid gap-2", curve.graduated ? "grid-cols-2" : "grid-cols-1")}>
        <Button
          variant="accent"
          onClick={claim}
          disabled={!LIVE || busy || earned <= 0n}
          loading={running === "claim"}
          title={!LIVE ? NOT_CONFIGURED : undefined}
        >
          Claim
        </Button>
        {curve.graduated && (
          <Button
            variant="outline"
            onClick={collect}
            disabled={!LIVE || busy || !hasPending}
            loading={running === "collect"}
            title={!LIVE ? NOT_CONFIGURED : undefined}
          >
            Collect pool fees
          </Button>
        )}
      </div>
    </div>
  );
}

function FeeLine({ label, hint, value }: { label: string; hint: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm text-muted">
        <Tooltip content={hint}>
          <button type="button" className="cursor-help underline decoration-border decoration-dotted underline-offset-4">
            {label}
          </button>
        </Tooltip>
      </dt>
      <dd className="text-right text-sm font-medium text-text tabular">{value}</dd>
    </div>
  );
}
