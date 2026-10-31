import type { RatingTally } from './live/analysts';

export interface RatingSummary {
  buys: number;
  holds: number;
  sells: number;
  total: number;
  /** Shares of all ratings, in percent. */
  buyPct: number;
  holdPct: number;
  sellPct: number;
  /**
   * The ratings' average on the 1 (sell) to 5 (buy) scale of ANR's consensus rating: buys 5, holds 3, sells 1.
   * The report's four ANR captures give a rating at most 0.04 under this average of their own counts (some sources
   * are graded between the steps, which counts do not show). Scoring the source's "buy" count 4 and only "strong buy"
   * 5 read 4.29 for Microsoft on 31 October 2026 (Finnhub: 22, 40, 3, 0, 0), where this average is 4.91.
   */
  score: number;
}

/** ANR's left-hand summary from a provider's rating counts; NaN throughout when there are no ratings. */
export function ratingSummary(r: RatingTally): RatingSummary {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const sb = n(r.strongBuy);
  const b = n(r.buy);
  const h = n(r.hold);
  const s = n(r.sell);
  const ss = n(r.strongSell);
  const total = sb + b + h + s + ss;
  const pct = (x: number) => (total > 0 ? (x / total) * 100 : NaN);
  return {
    buys: sb + b,
    holds: h,
    sells: s + ss,
    total,
    buyPct: pct(sb + b),
    holdPct: pct(h),
    sellPct: pct(s + ss),
    score: total > 0 ? (5 * (sb + b) + 3 * h + (s + ss)) / total : NaN,
  };
}
