"use client";

import { COPY, TOTAL_SUPPLY, WAD, formatTiny, formatUsd, sig, weiToEthNumber, type Interval, type TokenDetail } from "@lancio/shared";
import {
  CandlestickSeries,
  ColorType,
  LineSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, PillTabs, Skeleton } from "@/components/ui";
import { useCandles, useEthUsd } from "@/lib/api";
import { cssVar } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Metric = "price" | "mcap";
type Unit = "usd" | "eth";

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1m", label: "1m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1D" },
];
const METRICS: { value: Metric; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "mcap", label: "MCap" },
];

/** Whole tokens in the supply (1e9): MCap = price per token × supply. */
const SUPPLY = Number(TOTAL_SUPPLY / WAD);
/** Bars kept in view on load (older ones are a scroll away). */
const VISIBLE_BARS = 70;
const HEIGHT = "h-[320px] md:h-[420px]";

/** Hex colour → rgba with alpha (theme tokens used here are plain hex). */
function alpha(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function TokenChart({ token, indexing, className }: { token: TokenDetail; indexing?: boolean; className?: string }) {
  const [interval, setIv] = useState<Interval>("5m");
  const [metric, setMetric] = useState<Metric>("mcap");
  const [unitPref, setUnit] = useState<Unit>("usd");
  const ethUsd = useEthUsd().data?.usd ?? null;
  const unit: Unit = ethUsd == null ? "eth" : unitPref;
  const candles = useCandles(indexing ? null : token.address, interval);

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PillTabs size="sm" aria-label="Interval" value={interval} onChange={setIv} items={INTERVALS} />
        <div className="flex flex-wrap items-center gap-2">
          <PillTabs size="sm" aria-label="Series" value={metric} onChange={setMetric} items={METRICS} />
          <PillTabs
            size="sm"
            aria-label="Currency"
            value={unit}
            onChange={setUnit}
            items={[
              { value: "usd", label: "USD", disabled: ethUsd == null },
              { value: "eth", label: "ETH" },
            ]}
          />
        </div>
      </div>

      <div className="mt-5">
        {indexing ? (
          <div className={cn("relative", HEIGHT)}>
            <Skeleton className="size-full rounded-card" />
            <p className="absolute inset-0 grid place-items-center text-sm text-muted">Indexing…</p>
          </div>
        ) : candles.isPending ? (
          <Skeleton className={cn("w-full rounded-card", HEIGHT)} />
        ) : (
          <CandleChart
            token={token}
            candles={candles.data}
            failed={candles.isError && !candles.data}
            metric={metric}
            unit={unit}
            ethUsd={ethUsd}
            fitKey={`${token.address}|${interval}|${metric}|${unit}`}
          />
        )}
      </div>
    </Card>
  );
}

function CandleChart({
  token,
  candles,
  failed,
  metric,
  unit,
  ethUsd,
  fitKey,
}: {
  token: TokenDetail;
  candles: { time: number; open: string; high: string; low: string; close: string }[] | undefined;
  failed: boolean;
  metric: Metric;
  unit: Unit;
  ethUsd: number | null;
  fitKey: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const fitted = useRef("");

  const factor = (metric === "mcap" ? SUPPLY : 1) * (unit === "usd" && ethUsd != null ? ethUsd : 1);
  const empty = !failed && (candles?.length ?? 0) === 0;

  const bars = useMemo<CandlestickData<UTCTimestamp>[]>(() => {
    const v = (wei: string) => weiToEthNumber(wei) * factor;
    return (candles ?? []).map((c) => ({ time: c.time as UTCTimestamp, open: v(c.open), high: v(c.high), low: v(c.low), close: v(c.close) }));
  }, [candles, factor]);

  // No trades yet: a flat line at the current (starting) price from launch to now.
  const flat = useMemo<LineData<UTCTimestamp>[]>(() => {
    if (!empty) return [];
    const now = Math.floor(Date.now() / 1000);
    const from = token.createdAt && token.createdAt < now - 60 ? token.createdAt : now - 3600;
    const value = weiToEthNumber(token.priceEth) * factor;
    return [
      { time: from as UTCTimestamp, value },
      { time: now as UTCTimestamp, value },
    ];
  }, [empty, token.createdAt, token.priceEth, factor]);

  // Price format: formatter per mode + a base (1/minMove) about 5 significant digits below the smallest value,
  // so tiny prices (1e-10 and below) still get a usable scale. `base` avoids float issues of 1/minMove.
  const priceFormat = useMemo(() => {
    const values = bars.length ? bars.map((b) => b.low) : flat.map((p) => p.value);
    const min = Math.min(...values.filter((x) => x > 0));
    const decimals = isFinite(min) ? Math.min(18, Math.max(0, 4 - Math.floor(Math.log10(min)))) : 2;
    const base = 10 ** decimals;
    const formatter = (x: number) =>
      unit === "usd" ? (metric === "mcap" ? formatUsd(x) : `$${formatTiny(x)}`) : metric === "mcap" ? sig(x, 4) : formatTiny(x);
    return { type: "custom" as const, formatter, base, minMove: 1 / base };
  }, [bars, flat, unit, metric]);

  // Create once.
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, fontSize: 12, attributionLogo: true },
      rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 2 },
    });
    chart.current = c;
    candleSeries.current = c.addSeries(CandlestickSeries, { priceLineVisible: true });
    lineSeries.current = c.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, crosshairMarkerVisible: false, lastValueVisible: true });
    return () => {
      c.remove();
      chart.current = null;
      candleSeries.current = null;
      lineSeries.current = null;
      fitted.current = "";
    };
  }, []);

  // Colours from the CSS variables of the (only) dark theme.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const text = cssVar("--muted");
    const border = cssVar("--border");
    const buy = cssVar("--buy");
    const sell = cssVar("--sell");
    c.applyOptions({
      layout: { textColor: text, fontFamily: getComputedStyle(document.body).fontFamily },
      grid: { vertLines: { color: alpha(border, 0.45) }, horzLines: { color: alpha(border, 0.45) } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
      crosshair: {
        vertLine: { color: alpha(text, 0.5), labelBackgroundColor: cssVar("--surface-2") },
        horzLine: { color: alpha(text, 0.5), labelBackgroundColor: cssVar("--surface-2") },
      },
    });
    candleSeries.current?.applyOptions({
      upColor: buy,
      downColor: sell,
      borderUpColor: buy,
      borderDownColor: sell,
      wickUpColor: buy,
      wickDownColor: sell,
    });
    lineSeries.current?.applyOptions({ color: cssVar("--accent") });
  }, []);

  // Data.
  useEffect(() => {
    const c = chart.current;
    if (!c || !candleSeries.current || !lineSeries.current) return;
    candleSeries.current.applyOptions({ priceFormat });
    lineSeries.current.applyOptions({ priceFormat });
    candleSeries.current.setData(bars);
    lineSeries.current.setData(flat);
    if (fitted.current !== fitKey && (bars.length || flat.length)) {
      fitted.current = fitKey;
      if (bars.length) c.timeScale().setVisibleLogicalRange({ from: bars.length - VISIBLE_BARS, to: bars.length + 2 });
      else c.timeScale().fitContent();
    }
  }, [bars, flat, priceFormat, fitKey]);

  return (
    <div className={cn("relative", HEIGHT)}>
      <div ref={el} className="absolute inset-0" />
      {(empty || failed) && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-muted">
          {failed ? "Chart data is unavailable right now." : COPY.token.waitingFirstTrade}
        </p>
      )}
    </div>
  );
}
