"use client";

import { COPY, PARAMS, formatCount, formatEth, formatPct, formatUsd, weiToEthNumber, type ProtocolStats } from "@lancio/shared";
import { useState, type ReactNode } from "react";
import { Card, PillTabs, Skeleton, StatTile, SubCard } from "@/components/ui";
import { useDaily, useEthUsd, useStats } from "@/lib/api";
import { useWeiToUsd } from "@/lib/usd";
import { cn } from "@/lib/utils";
import { DailyBars, dayLabel } from "./DailyBars";

type Win = "24h" | "all";

const USD_NOTE = "USD at the current ETH price.";

/** USD big value with ETH fallback while the price is unavailable. */
function useMoney() {
  const toUsd = useWeiToUsd();
  return (wei: string) => {
    const usd = toUsd(wei);
    return usd == null ? { big: formatEth(wei), eth: null } : { big: formatUsd(usd), eth: formatEth(wei) };
  };
}

function Change({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span>No prior day to compare</span>;
  return (
    <span>
      <span className={cn(pct > 0 ? "text-buy" : pct < 0 ? "text-sell" : "text-muted")}>{formatPct(pct, { sign: true })}</span> vs prior day
    </span>
  );
}

const timeFmt = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function UpdatedLine({ stats }: { stats: ProtocolStats | undefined }) {
  if (!stats) return <Skeleton className="mt-3 h-4 w-72" />;
  return (
    <p className="mt-3 text-13 text-muted tabular">
      {stats.latestCompleteDay
        ? `Updated ${timeFmt(stats.updatedAt)}, latest complete day ${dayLabel(stats.latestCompleteDay)} UTC.`
        : `Updated ${timeFmt(stats.updatedAt)}. No complete UTC day yet.`}
    </p>
  );
}

function Overview() {
  const [win, setWin] = useState<Win>("24h");
  const { data: stats, isLoading, isError } = useStats(win);
  const money = useMoney();
  const is24 = win === "24h";
  const vol = stats ? money(stats.volumeEth) : null;

  const tile = (label: string, value: ReactNode, sub: ReactNode, hint?: string) => (
    <StatTile
      label={label}
      hint={hint}
      value={isLoading || !stats ? <Skeleton className="h-10 w-28 md:h-12" /> : value}
      sub={isLoading || !stats ? <Skeleton className="h-4 w-24" /> : sub}
    />
  );

  return (
    <Card as="section" texture aria-labelledby="analytics-title">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 id="analytics-title" className="font-heading text-28 text-text md:text-40">
            {COPY.analytics.title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted md:text-base">{COPY.analytics.subtitle}</p>
          <UpdatedLine stats={stats} />
        </div>
        <PillTabs
          aria-label="Time window"
          value={win}
          onChange={setWin}
          items={[
            { value: "24h", label: "24h" },
            { value: "all", label: "All time" },
          ]}
          className="self-start"
        />
      </div>

      {isError && !stats ? (
        <p className="mt-8 text-sm text-muted">Protocol figures are unavailable right now. Retrying.</p>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tile(
            "Volume",
            vol?.big,
            is24 ? (
              <span>
                {vol?.eth && <>{vol.eth} · </>}
                <Change pct={stats?.volumeChangePct} />
              </span>
            ) : (
              (vol?.eth ?? "All time")
            ),
            vol?.eth ? USD_NOTE : undefined,
          )}
          {tile("Launches", stats && formatCount(stats.launches), is24 ? <Change pct={stats?.launchesChangePct} /> : "All time")}
          {tile("Unique creators", stats && formatCount(stats.uniqueCreators), "All time")}
          {tile("Graduations", stats && formatCount(stats.graduations), is24 ? "Last full UTC day" : "All time")}
        </div>
      )}

      <p className="mt-5 text-13 text-muted">
        {COPY.analytics.footnote} {USD_NOTE}
      </p>
    </Card>
  );
}

function FeeTile({
  label,
  hint,
  wei,
  rows,
  loading,
}: {
  label: string;
  hint?: string;
  wei: string | undefined;
  rows: { label: string; value: ReactNode }[];
  loading: boolean;
}) {
  const money = useMoney();
  const m = wei ? money(wei) : null;
  return (
    <div className="flex flex-col">
      <StatTile
        className="rounded-b-none pb-4"
        label={label}
        hint={hint}
        value={loading || !m ? <Skeleton className="h-10 w-28 md:h-12" /> : m.big}
        sub={loading || !m ? <Skeleton className="h-4 w-20" /> : (m.eth ?? " ")}
      />
      <SubCard className="flex-1 rounded-t-none pt-0">
        <dl className="space-y-2 border-t border-border pt-4 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3">
              <dt className="text-muted">{r.label}</dt>
              <dd className="text-text tabular">{loading ? <Skeleton className="h-4 w-16" /> : r.value}</dd>
            </div>
          ))}
        </dl>
      </SubCard>
    </div>
  );
}

function Fees() {
  const { data: stats, isLoading } = useStats("all");
  const { data: px } = useEthUsd();
  const toUsd = useWeiToUsd();
  const f = stats?.fees;
  const row = (wei: string | undefined) => {
    if (!wei) return "—";
    const usd = toUsd(wei);
    return usd == null ? formatEth(wei) : `${formatUsd(usd)} · ${formatEth(wei)}`;
  };
  const loading = isLoading || !stats;

  return (
    <Card as="section" aria-labelledby="fees-title">
      <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
        <div>
          <h2 id="fees-title" className="font-heading text-28 text-text">
            Fees
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            All time. Each curve trade pays {PARAMS.tradeFeePct}: {PARAMS.creatorFeePct} to the creator and {PARAMS.protocolFeePct} to the
            protocol. After graduation, pool fees are split {PARAMS.poolSplit} between creator and treasury.
          </p>
        </div>
        <p className="shrink-0 text-13 text-muted tabular">
          {px?.usd != null ? `ETH at ${formatUsd(px.usd)}, current price` : "ETH price unavailable, amounts in ETH"}
        </p>
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        <FeeTile
          label="Paid to creators"
          hint="Fees credited to creators, claimed or not."
          wei={f?.creatorsEth}
          loading={loading}
          rows={[
            { label: "From the curve", value: row(f?.curveCreatorsEth) },
            { label: "From pools", value: row(f?.poolCreatorsEth) },
          ]}
        />
        <FeeTile
          label="Protocol treasury"
          wei={f?.protocolEth}
          loading={loading}
          rows={[
            { label: "From the curve", value: row(f?.curveProtocolEth) },
            { label: "From pools", value: row(f?.poolProtocolEth) },
          ]}
        />
        <FeeTile
          label="Locked liquidity"
          hint="ETH placed into pools at graduation. The positions are held by the locker and cannot be withdrawn."
          wei={f?.lockedLiquidityEth}
          loading={loading}
          rows={[
            { label: "Graduated tokens", value: stats ? formatCount(stats.graduations) : "—" },
            { label: "Each pool opens with", value: `${PARAMS.graduationEth} ETH` },
          ]}
        />
      </div>
    </Card>
  );
}

function Charts() {
  const { data, isLoading } = useDaily(14);
  const toUsd = useWeiToUsd();
  const volLabel = (wei: string) => {
    const usd = toUsd(wei);
    return usd == null ? formatEth(wei) : formatUsd(usd);
  };
  const last = data?.at(-1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <DailyBars
        title="Trading volume"
        loading={isLoading}
        headline={last ? volLabel(last.volumeEth) : null}
        points={data?.map((p) => ({ day: p.day, value: weiToEthNumber(p.volumeEth), label: volLabel(p.volumeEth) }))}
      />
      <DailyBars
        title="Token launches"
        loading={isLoading}
        headline={last ? formatCount(last.launches) : null}
        points={data?.map((p) => ({ day: p.day, value: p.launches, label: formatCount(p.launches) }))}
      />
    </div>
  );
}

export function AnalyticsView() {
  return (
    <div className="container-page flex flex-col gap-4 py-8 md:gap-6 md:py-12">
      <Overview />
      <Fees />
      <Charts />
    </div>
  );
}
