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
   * The ratings' average on a 1 (sell) to 5 (buy) scale, the scale ANR's consensus rating uses: strong buy 5,
   * buy 4, hold 3, sell 2, strong sell 1. Worked out here from the counts the source gives.
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
    score: total > 0 ? (5 * sb + 4 * b + 3 * h + 2 * s + ss) / total : NaN,
  };
}
