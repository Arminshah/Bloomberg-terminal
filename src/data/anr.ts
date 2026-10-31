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
   * ANR's consensus rating places each firm's rating, on that firm's own scale, onto 1 to 5 (strong buy or equivalent 5,
   * buy 4, hold 3, sell 2, strong sell 1; the provider's ANR index methodology, July 2023, appendix II) and averages
   * the ratings updated in the last 12 months. From grouped counts the best fit is buys 5, holds 3, sells 1: a firm's
   * top grade counts 5 (the report's four captures sit at most 0.04 under this average, the gap one firm grading
   * between steps), so it can read a few hundredths high. Scoring the source's "buy" count 4 read 4.29 for Microsoft on
   * 31 October 2026 (Finnhub: 22, 40, 3, 0, 0), where this average is 4.91. Which grade of a three-grade firm is 4 is
   * not settled by any public source.
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
