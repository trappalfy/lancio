"use client";

import { COPY, explorerAddress, type TokenDetail } from "@lancio/shared";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { LancioMark } from "@/components/brand/LancioMark";
import { Card } from "@/components/ui/Card";
import { PillTabs } from "@/components/ui/PillTabs";
import { config } from "@/lib/config";
import { CurveTrade } from "./CurveTrade";
import { useLiveCurve, type Side } from "./hooks";
import { PoolTrade } from "./PoolTrade";
import { SlippageSettings, useSlippage } from "./SlippageSettings";

const SIDES = [
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
] as const;

/**
 * Trade panel (brief §11.3, right column). On the curve it trades through LancioLaunchpad; once the curve has
 * graduated (live getCurve) it trades in the locked Uniswap v4 pool through the Universal Router.
 */
export function TradePanel({ token, initialSide = "buy" }: { token: TokenDetail; initialSide?: "buy" | "sell" }) {
  const [side, setSide] = useState<Side>(initialSide);
  const [prevInitial, setPrevInitial] = useState(initialSide);
  if (initialSide !== prevInitial) {
    setPrevInitial(initialSide);
    setSide(initialSide);
  }
  const [slippageBps, setSlippageBps] = useSlippage();
  const curve = useLiveCurve(token);
  const pool = curve.graduated;

  return (
    <Card as="section" aria-label={`Trade $${token.symbol}`} className="md:p-6">
      <div className="flex items-center justify-between gap-3">
        <PillTabs value={side} onChange={setSide} items={SIDES} aria-label="Trade side" />
        <SlippageSettings bps={slippageBps} onChange={setSlippageBps} />
      </div>

      {pool && <GraduatedPlate />}

      <div className="mt-5">
        {pool ? (
          <PoolTrade key={`pool-${side}`} token={token} side={side} slippageBps={slippageBps} />
        ) : (
          <CurveTrade key={`curve-${side}`} token={token} side={side} state={curve.state} slippageBps={slippageBps} />
        )}
      </div>
    </Card>
  );
}

function GraduatedPlate() {
  return (
    <div className="graduated-panel canvas-texture mt-5 rounded-card px-4 py-3.5">
      <p className="flex items-center gap-2 text-sm font-medium text-accent-text">
        <LancioMark className="h-3 w-auto shrink-0 text-accent" />
        {COPY.token.graduatedPlate}
      </p>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-muted">
        <span>Trading in the Uniswap v4 pool.</span>
        <Link href="/docs/liquidity-lock" className="underline decoration-border underline-offset-4 hover:text-text">
          How the lock works
        </Link>
        <a
          href={explorerAddress(config.deployment.locker)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline decoration-border underline-offset-4 hover:text-text"
        >
          Locker
          <ArrowUpRight size={13} />
        </a>
      </p>
    </div>
  );
}
