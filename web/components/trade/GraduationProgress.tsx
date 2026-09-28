"use client";

import {
  COPY,
  formatEth,
  formatProgress,
  formatTokens,
  PARAMS,
  progressBpsOf,
  realEthOf,
  tokensLeftOf,
  type TokenDetail,
} from "@lancio/shared";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { useLiveCurve } from "./hooks";

/** Progress to graduation from the live curve (getCurve every ~2 s), falling back to the indexer's fields. */
export function GraduationProgress({ token }: { token: TokenDetail }) {
  const { state, graduated } = useLiveCurve(token);

  if (graduated) {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="graduated" />
          <span className="text-sm font-medium text-text tabular">{formatProgress(10_000, true)}</span>
        </div>
        <ProgressBar bps={10_000} />
        <p className="text-13 text-muted">{COPY.graduated.subtitle}</p>
      </div>
    );
  }

  const bps = progressBpsOf(state);
  const pct = formatProgress(bps);
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-13 font-medium text-muted">Graduation progress</span>
        <span className="text-sm font-medium text-text tabular">{pct}</span>
      </div>
      <ProgressBar bps={bps} />
      <p className="text-13 text-text tabular">
        {pct} · {formatEth(realEthOf(state), { unit: false })} of {PARAMS.graduationEth} ETH raised
      </p>
      <p className="text-13 text-muted tabular">{formatTokens(tokensLeftOf(state))} tokens left on the curve</p>
    </div>
  );
}
