import { formatPct } from "@lancio/shared";

/** Price impact at or above this is shown in the sell colour. */
export const IMPACT_WARN_BPS = 500;
/** Button label when contracts are not configured (mocks / local preview without a deployment). */
export const NOT_CONFIGURED = "Contracts not configured";

export const formatImpact = (bps: number) => (bps < 1 ? "<0.01%" : formatPct(bps / 100));
