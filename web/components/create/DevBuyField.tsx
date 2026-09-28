"use client";

import { COPY, TOTAL_SUPPLY, formatEth, formatPct, formatTokens } from "@lancio/shared";
import { EthIcon, Field } from "@/components/ui";
import { cn } from "@/lib/utils";

const DECIMAL_RE = /^\d*\.?\d{0,18}$/;

/** Developer buy: ETH amount bought in the launch transaction, with expected tokens and the launch-cap hint. */
export function DevBuyField({
  value,
  onChange,
  onMax,
  balance,
  expected,
  symbol,
  overCap,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onMax: () => void;
  balance: bigint;
  /** Tokens the dev buy returns (0n when empty). */
  expected: bigint;
  symbol: string;
  overCap: boolean;
  disabled?: boolean;
}) {
  const pct = Number((expected * 1_000_000n) / TOTAL_SUPPLY) / 10_000;
  return (
    <Field label="Developer buy" htmlFor="dev-buy" error={overCap ? COPY.create.devBuyCapHint : undefined}>
      <div
        className={cn(
          "rounded-2xl border bg-surface-2 px-4 py-3 transition-colors focus-within:border-accent",
          overCap ? "border-sell" : "border-border",
          disabled && "opacity-60",
        )}
      >
        <div className="flex items-center gap-3">
          <input
            id="dev-buy"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={value}
            disabled={disabled}
            aria-invalid={overCap || undefined}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (DECIMAL_RE.test(v)) onChange(v);
            }}
            className="min-w-0 flex-1 bg-transparent text-28 font-medium text-text outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onMax}
            disabled={disabled}
            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-text"
          >
            Max
          </button>
          <span className="flex items-center gap-1.5 text-sm font-medium text-text">
            <EthIcon size={18} />
            ETH
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-13">
          <span className="text-muted">{COPY.create.devBuyHelper(formatEth(balance))}</span>
          {expected > 0n && (
            <span className="text-text">
              {formatTokens(expected, symbol || "tokens")} · {formatPct(pct)} of supply
            </span>
          )}
        </div>
      </div>
    </Field>
  );
}
