"use client";

import * as Popover from "@radix-ui/react-popover";
import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lancio-slippage-bps";
export const DEFAULT_SLIPPAGE_BPS = 200;
const MIN_BPS = 1;
const MAX_BPS = 5_000;
const HIGH_BPS = 500;
const PRESETS = [50, 100, 200, 500] as const;

const valid = (bps: number) => Number.isInteger(bps) && bps >= MIN_BPS && bps <= MAX_BPS;
export const bpsLabel = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;

/** Max slippage in bps, remembered per browser (default 2%). */
export function useSlippage() {
  const [bps, setBps] = useState(DEFAULT_SLIPPAGE_BPS);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      if (valid(v)) setBps(v);
    } catch {
      /* storage unavailable */
    }
  }, []);
  const update = useCallback((v: number) => {
    if (!valid(v)) return;
    setBps(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      /* storage unavailable */
    }
  }, []);
  return [bps, update] as const;
}

export function SlippageSettings({ bps, onChange }: { bps: number; onChange: (bps: number) => void }) {
  const [custom, setCustom] = useState("");
  const isPreset = (PRESETS as readonly number[]).includes(bps);

  const applyCustom = (raw: string) => {
    const s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
    setCustom(s);
    const pct = Number(s);
    if (s && isFinite(pct)) onChange(Math.round(pct * 100));
  };
  const customPct = Number(custom);
  const customInvalid = custom !== "" && (!isFinite(customPct) || !valid(Math.round(customPct * 100)));

  return (
    <Popover.Root onOpenChange={(open) => open && setCustom(isPreset ? "" : String(bps / 100))}>
      <Popover.Trigger
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-13 text-muted transition-colors hover:text-text"
        aria-label={`Max slippage ${bpsLabel(bps)}`}
      >
        <SlidersHorizontal size={14} />
        <span className="tabular">{bpsLabel(bps)}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-72 rounded-card border border-border bg-surface p-4 shadow-pop outline-none"
        >
          <p className="text-sm font-medium text-text">Max slippage</p>
          <p className="mt-1 text-13 text-muted">The trade reverts if the price moves against you by more than this.</p>
          <div className="mt-3 flex items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setCustom("");
                  onChange(p);
                }}
                className={cn(
                  "h-8 flex-1 rounded-full text-13 font-medium transition-colors tabular",
                  bps === p ? "bg-accent text-on-accent" : "bg-surface-2 text-muted hover:text-text",
                )}
              >
                {bpsLabel(p)}
              </button>
            ))}
          </div>
          <label className="mt-2 flex h-9 items-center gap-2 rounded-full border border-border bg-surface-2 px-3 focus-within:border-accent">
            <span className="text-13 text-muted">Custom</span>
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => applyCustom(e.target.value)}
              placeholder={isPreset ? "0.00" : String(bps / 100)}
              aria-invalid={customInvalid || undefined}
              className="w-full bg-transparent text-right text-13 text-text outline-none placeholder:text-muted tabular"
            />
            <span className="text-13 text-muted">%</span>
          </label>
          {customInvalid ? (
            <p className="mt-2 text-13 text-sell">Enter 0.01% to 50%.</p>
          ) : bps > HIGH_BPS ? (
            <p className="mt-2 text-13 text-sell">High slippage: the trade may fill at a much worse price.</p>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
