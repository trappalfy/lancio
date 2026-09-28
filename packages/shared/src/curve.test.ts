import { describe, expect, it } from "vitest";
import { GRADUATION_ETH, LAUNCH_CAP, VIRTUAL_TOKEN_0, WAD } from "./constants";
import { INITIAL_CURVE, maxBuyForTokens, mcapWeiOf, quoteBuy, quoteSell, realEthOf } from "./curve";

const eth = (x: bigint, digits = 6) => Math.round(Number((x * 10n ** BigInt(digits + 2)) / WAD) / 100) / 10 ** digits;
const stateAtSold = (sold: bigint) => {
  const vTok = VIRTUAL_TOKEN_0 - sold;
  const vEth = (2_730_000_000_000_000_000n * VIRTUAL_TOKEN_0 + vTok - 1n) / vTok;
  return { vEth, vTok };
};

describe("brief §7.3 test vectors", () => {
  it("start price / MC", () => {
    expect(eth(mcapWeiOf(INITIAL_CURVE), 3)).toBe(2.544);
  });
  it("1 ETH gross at start", () => {
    const q = quoteBuy(INITIAL_CURVE, WAD);
    expect(q.fee).toBe(10n ** 16n);
    expect(Number(q.tokensOut / 10n ** 17n) / 10).toBe(285556451.6);
  });
  it("0.1 ETH gross at start", () => {
    const q = quoteBuy(INITIAL_CURVE, WAD / 10n);
    expect(q.fee).toBe(10n ** 15n);
    expect(Number(q.tokensOut / 10n ** 17n) / 10).toBe(37549310.7);
  });
  it("realEth at 100M/400M/600M/800M sold", () => {
    expect(eth(realEthOf(stateAtSold(100_000_000n * WAD)))).toBe(0.280576);
    expect(eth(realEthOf(stateAtSold(400_000_000n * WAD)))).toBe(1.622585);
    expect(eth(realEthOf(stateAtSold(600_000_000n * WAD)))).toBe(3.463002);
    expect(realEthOf(stateAtSold(800_000_000n * WAD))).toBe(GRADUATION_ETH);
  });
  it("launch cap max buy ≈ 0.025941 ETH", () => {
    const g = maxBuyForTokens(INITIAL_CURVE, LAUNCH_CAP);
    expect(eth(g)).toBeCloseTo(0.025941, 6);
    expect(quoteBuy(INITIAL_CURVE, g).tokensOut <= LAUNCH_CAP).toBe(true);
    expect(quoteBuy(INITIAL_CURVE, g + 1n).tokensOut > LAUNCH_CAP).toBe(true);
  });
  it("oversized buy completes the curve at exactly 8 ETH and refunds", () => {
    const q = quoteBuy(INITIAL_CURVE, 20n * WAD);
    expect(q.graduates).toBe(true);
    expect(realEthOf(q.next)).toBe(GRADUATION_ETH);
    expect(q.tokensOut).toBe(800_000_000n * WAD);
    expect(q.ethUsed + q.refund).toBe(20n * WAD);
    expect(eth(q.fee, 4)).toBeCloseTo(0.0808, 4);
  });
  it("buy then sell never returns more than paid", () => {
    const b = quoteBuy(INITIAL_CURVE, WAD);
    const s = quoteSell(b.next, b.tokensOut);
    expect(s.ethOut < WAD).toBe(true);
    expect(s.next.vEth >= INITIAL_CURVE.vEth).toBe(true);
  });
});
