"use client";

import { BPS, PARAMS, POOL_SPLIT_BPS, formatEth, formatUsd, type AccountResponse, type Hex } from "@lancio/shared";
import { launchpadAbi, lockerAbi } from "@lancio/shared/abi";
import { useEffect } from "react";
import { zeroAddress } from "viem";
import { useAccount, useReadContracts, useSwitchChain } from "wagmi";
import { Button, Card, Skeleton, StatTile } from "@/components/ui";
import { config } from "@/lib/config";
import { useTx } from "@/lib/tx";
import { useWeiToUsd } from "@/lib/usd";
import { appChain } from "@/lib/wagmi";

const { launchpad, locker } = config.deployment;
/** Onchain reads/claims only with real contracts (mocks → indexer numbers, claim disabled). */
const LIVE = !config.useMocks && launchpad !== zeroAddress;
const LOCKER_LIVE = LIVE && locker !== zeroAddress;

/** Creator fees for the connected creator's own profile (id="creator-fees", linked from the wallet menu). */
export function CreatorFees({ address, account }: { address: Hex; account: AccountResponse | undefined }) {
  const toUsd = useWeiToUsd();
  const money = (wei: bigint | null) => {
    if (wei == null) return { value: <Skeleton className="h-8 w-24" />, sub: <Skeleton className="h-4 w-16" /> };
    const usd = toUsd(wei);
    return { value: formatEth(wei), sub: usd == null ? undefined : formatUsd(usd) };
  };
  const created = account?.created ?? [];
  const graduated = created.filter((t) => t.status === "graduated");

  // Wallet menu links to /profile#creator-fees; this block mounts after the wallet reconnects, so scroll here then.
  useEffect(() => {
    if (window.location.hash === "#creator-fees") document.getElementById("creator-fees")?.scrollIntoView({ block: "start" });
  }, []);

  const curves = useReadContracts({
    contracts: created.map((t) => ({ address: launchpad, abi: launchpadAbi, functionName: "getCurve", args: [t.address] }) as const),
    query: { enabled: LIVE && created.length > 0, refetchInterval: 15_000 },
  });
  const pools = useReadContracts({
    contracts: graduated.map((t) => ({ address: locker, abi: lockerAbi, functionName: "pendingFees", args: [t.address] }) as const),
    query: { enabled: LOCKER_LIVE && graduated.length > 0, refetchInterval: 30_000 },
  });

  // Available now: Σ getCurve(t).creatorFees over tokens this address still controls.
  let available: bigint | null = null;
  const claimable: Hex[] = [];
  if (!LIVE) {
    available = account ? BigInt(account.creatorFeesAccruedEth) - BigInt(account.creatorFeesClaimedEth) : null;
  } else if (account && created.length === 0) {
    available = 0n;
  } else if (curves.data) {
    let sum = 0n;
    curves.data.forEach((r, i) => {
      if (r.status !== "success") return;
      const c = r.result;
      if (c.creator.toLowerCase() !== address.toLowerCase() || c.creatorFees === 0n) return;
      sum += c.creatorFees;
      claimable.push(created[i].address);
    });
    available = sum;
  }

  // Waiting in pools: the creator's share of ETH fees not yet collected from the locked positions.
  let waiting: bigint | null = null;
  const collectable: Hex[] = [];
  if (!LOCKER_LIVE || graduated.length === 0) {
    waiting = account ? 0n : null;
  } else if (pools.data) {
    let sum = 0n;
    pools.data.forEach((r, i) => {
      if (r.status !== "success") return;
      const [ethFees, tokenFees] = r.result;
      sum += (ethFees * POOL_SPLIT_BPS) / BPS;
      if (ethFees > 0n || tokenFees > 0n) collectable.push(graduated[i].address);
    });
    waiting = sum;
  }

  const earned = account ? BigInt(account.creatorFeesAccruedEth) : null;
  const claimed = account ? BigInt(account.creatorFeesClaimedEth) : null;

  const { chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const wrongChain = chainId !== undefined && chainId !== appChain.id;
  const claimTx = useTx();
  const collectTx = useTx();

  const claimAll = () =>
    claimTx.run(
      () => claimTx.writeContractAsync({ address: launchpad, abi: launchpadAbi, functionName: "claimCreatorFees", args: [claimable], chainId: appChain.id }),
      { pending: "Claiming creator fees…", success: "Creator fees claimed" },
    );

  // One collectFees tx per graduated token with pending fees (the locker collects per position).
  const collectAll = async () => {
    for (const token of collectable) {
      const rc = await collectTx.run(
        () => collectTx.writeContractAsync({ address: locker, abi: lockerAbi, functionName: "collectFees", args: [token], chainId: appChain.id }),
        { pending: "Collecting pool fees…", success: "Pool fees collected" },
      );
      if (!rc || rc.status !== "success") break;
    }
  };

  const tiles = [
    { label: "Total earned", hint: "Curve fees plus your share of collected pool fees, since launch.", m: money(earned) },
    { label: "Claimed", m: money(claimed) },
    {
      label: "Waiting in pools",
      hint: `Your ${PARAMS.poolSplit} share of ETH fees still inside the locked pools. It moves to available once the pool fees are collected, which anyone can trigger.`,
      m: money(waiting),
    },
  ];
  const avail = money(available);

  return (
    <Card as="section" id="creator-fees" aria-labelledby="creator-fees-title" className="scroll-mt-[calc(var(--header-h)+16px)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 id="creator-fees-title" className="font-heading text-28 text-text">
            Creator fees
          </h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            {PARAMS.creatorFeePct} of every curve trade on your tokens, and {PARAMS.poolSplit} of pool fees after graduation. Claims go to this
            wallet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wrongChain ? (
            <Button loading={switching} onClick={() => switchChain({ chainId: appChain.id })}>
              Switch to Robinhood Chain
            </Button>
          ) : (
            <>
              {collectable.length > 0 && (
                <Button variant="outline" loading={collectTx.busy} disabled={claimTx.busy} onClick={collectAll}>
                  Collect from pools
                </Button>
              )}
              <Button
                loading={claimTx.busy}
                disabled={!LIVE || claimable.length === 0 || collectTx.busy}
                onClick={claimAll}
                title={!LIVE ? "Claims open once the contracts are configured." : undefined}
              >
                Claim all
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Available now" value={avail.value} sub={avail.sub} size="lg" className="bg-accent-soft ring-1 ring-accent/40 sm:col-span-2 lg:col-span-1" />
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} hint={t.hint} value={t.m.value} sub={t.m.sub} size="lg" />
        ))}
      </div>
      {account && created.length === 0 && <p className="mt-4 text-13 text-muted">Fees start accruing once you launch a token.</p>}
      {!LIVE && <p className="mt-4 text-13 text-muted">Preview data. Claims are disabled until the contracts are configured.</p>}
    </Card>
  );
}
