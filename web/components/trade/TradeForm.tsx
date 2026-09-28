"use client";

import { formatEth, formatTokens } from "@lancio/shared";
import { useId, type ReactNode } from "react";
import { EthIcon } from "@/components/ui/icons";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { TxStatus } from "@/lib/tx";
import { cn } from "@/lib/utils";
import { sanitizeAmount, toInputString, type Side, type Wallet } from "./hooks";

const BUY_PRESETS = ["0.01", "0.05", "0.1", "0.5"] as const;
const SELL_PRESETS = [25, 50, 75, 100] as const;

export type QuoteRow = { label: ReactNode; value: ReactNode; tone?: "sell" | "muted" };

export type ActionState = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: ButtonVariant;
};

/**
 * Button state machine (brief §11.2 / §11.3):
 * Connect wallet → Switch to Robinhood Chain → Confirm in wallet / Pending… → Enter an amount →
 * Not enough ETH / $TICKER → (blocked reason) → Approve step → Buy / Sell $TICKER.
 */
export function resolveAction(p: {
  wallet: Wallet;
  side: Side;
  symbol: string;
  amount: bigint | null;
  txStatus: TxStatus;
  /** Reason the trade cannot run (quote error, window limit, contracts missing). */
  blocked?: string | null;
  approval?: { label: string; run: () => void } | null;
  /** Quote for the current amount is loaded. */
  ready: boolean;
  execute: () => void;
}): ActionState {
  const { wallet, side, symbol } = p;
  const variant: ButtonVariant = side === "buy" ? "buy" : "sell";
  if (!wallet.connected) return { label: "Connect wallet", onClick: wallet.connect, variant: "accent" };
  if (wallet.wrongChain)
    return { label: "Switch to Robinhood Chain", onClick: wallet.switchChain, loading: wallet.switching, variant: "accent" };
  if (p.txStatus === "confirm") return { label: "Confirm in wallet", disabled: true, loading: true, variant };
  if (p.txStatus === "pending") return { label: "Pending…", disabled: true, loading: true, variant };
  if (!p.amount) return { label: "Enter an amount", disabled: true, variant };
  if (side === "buy" && wallet.ethBalance !== undefined && p.amount > wallet.ethBalance)
    return { label: "Not enough ETH", disabled: true, variant };
  if (side === "sell" && wallet.tokenBalance !== undefined && p.amount > wallet.tokenBalance)
    return { label: `Not enough $${symbol}`, disabled: true, variant };
  if (p.blocked) return { label: p.blocked, disabled: true, variant };
  if (p.approval) return { label: p.approval.label, onClick: p.approval.run, variant: "accent" };
  return {
    label: `${side === "buy" ? "Buy" : "Sell"} $${symbol}`,
    onClick: p.execute,
    disabled: !p.ready,
    variant,
  };
}

export function TradeForm({
  side,
  symbol,
  input,
  onInput,
  wallet,
  rows,
  quoteLoading,
  notices,
  action,
}: {
  side: Side;
  symbol: string;
  input: string;
  onInput: (value: string) => void;
  wallet: Wallet;
  rows: QuoteRow[];
  quoteLoading: boolean;
  notices?: ReactNode;
  action: ActionState;
}) {
  const inputId = useId();
  const balance = side === "buy" ? wallet.ethBalance : wallet.tokenBalance;
  const balanceText =
    balance === undefined ? null : side === "buy" ? formatEth(balance) : formatTokens(balance, symbol);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-surface-2 px-4 pt-3 pb-4 transition-colors focus-within:border-accent">
        <div className="flex items-center justify-between gap-3 text-13 text-muted">
          <label htmlFor={inputId}>{side === "buy" ? "You pay" : "You sell"}</label>
          {balanceText && (
            <span className="tabular">
              Balance <span className="text-text">{balanceText}</span>
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0.00"
            value={input}
            onChange={(e) => onInput(sanitizeAmount(e.target.value))}
            className="min-w-0 flex-1 bg-transparent text-28 font-medium text-text outline-none placeholder:text-muted/70 tabular"
          />
          <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium text-text">
            {side === "buy" ? (
              <>
                <EthIcon size={16} /> ETH
              </>
            ) : (
              <span className="max-w-28 truncate">${symbol}</span>
            )}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {side === "buy"
          ? BUY_PRESETS.map((v) => (
              <PresetButton key={v} active={input === v} onClick={() => onInput(v)}>
                {v} ETH
              </PresetButton>
            ))
          : SELL_PRESETS.map((pct) => {
              const value =
                wallet.tokenBalance !== undefined
                  ? pct === 100
                    ? toInputString(wallet.tokenBalance, 18)
                    : toInputString((wallet.tokenBalance * BigInt(pct)) / 100n, 6)
                  : null;
              return (
                <PresetButton
                  key={pct}
                  active={value !== null && value !== "0" && input === value}
                  disabled={!wallet.tokenBalance}
                  onClick={() => value && onInput(value)}
                >
                  {pct === 100 ? "Max" : `${pct}%`}
                </PresetButton>
              );
            })}
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{r.label}</dt>
            <dd
              className={cn(
                "min-w-0 text-right tabular",
                r.tone === "sell" ? "text-sell" : r.tone === "muted" ? "text-muted" : "text-text",
                i === 0 && "font-medium",
              )}
            >
              {quoteLoading && r.tone !== "muted" ? <Skeleton className="inline-block h-4 w-20 align-middle" /> : r.value}
            </dd>
          </div>
        ))}
      </dl>

      {notices}

      <Button
        size="lg"
        variant={action.variant}
        className="w-full"
        disabled={action.disabled}
        loading={action.loading}
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    </div>
  );
}

function PresetButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full text-13 font-medium whitespace-nowrap transition-colors tabular disabled:opacity-40",
        active ? "bg-accent-soft text-accent-text" : "bg-surface-2 text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

/** Small note under the quote (launch window, graduation, cap). */
export function Notice({ tone = "default", children }: { tone?: "default" | "gold" | "sell"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "rounded-2xl px-3.5 py-2.5 text-13 leading-5",
        tone === "gold" ? "bg-accent-soft text-accent-text" : tone === "sell" ? "bg-sell/10 text-sell" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </p>
  );
}
