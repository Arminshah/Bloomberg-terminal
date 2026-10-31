import type { RatingTally } from './live/analysts';
import { MONTHS } from '../core/format';

/** A month's five rating counts, as Finnhub's /stock/recommendation and Yahoo's recommendationTrend give them. */
export type RatingCounts = Pick<RatingTally, 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell'>;

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

/** One of ANR's 100% stacked bars: a month's buys, holds and sells as shares of its ratings. */
export interface MonthShares {
  /** The source's own period: a calendar month's first day from Finnhub (2026-10-01), or a month relative to Yahoo's snapshot (0m, -1m). */
  period: string;
  /** Under the bar: the month's name (Oct), or the relative month as the source gives it (-1m). */
  label: string;
  /** The calendar year of a dated month, for the axis's second line; empty for a relative month. */
  year: string;
  buys: number;
  holds: number;
  sells: number;
  total: number;
  /** In percent of the month's ratings, adding up to 100; NaN for a month with no ratings. */
  buyPct: number;
  holdPct: number;
  sellPct: number;
}

/**
 * ANR's monthly bars from a source's rating counts, oldest first as the terminal draws them: buys are strong buys and
 * buys, sells are sells and strong sells, each a share of the month's ratings. Every month the source gives is kept, one
 * with no ratings as a gap (NaN shares); a period that is neither a dated nor a relative month has no place on the axis
 * and is left out. Yahoo's relative months stay relative.
 */
export function monthlyShares(months: readonly (RatingCounts & { period?: string })[]): MonthShares[] {
  return months
    .flatMap((m) => {
      const period = m.period ?? '';
      const dated = /^(\d{4})-(\d{2})-\d{2}$/.exec(period);
      const at = dated ? Date.parse(`${period}T00:00:00Z`) : NaN;
      if (dated && Number.isFinite(at)) return [{ m, period, order: at, label: MONTHS[Number(dated[2]) - 1], year: dated[1] }];
      if (/^(0|-\d+)m$/.test(period)) return [{ m, period, order: Number.parseInt(period, 10), label: period, year: '' }];
      return [];
    })
    .sort((a, b) => a.order - b.order)
    .map(({ m, period, label, year }) => {
      const s = ratingSummary({ strongBuy: m.strongBuy, buy: m.buy, hold: m.hold, sell: m.sell, strongSell: m.strongSell, consensus: '' });
      return { period, label, year, buys: s.buys, holds: s.holds, sells: s.sells, total: s.total, buyPct: s.buyPct, holdPct: s.holdPct, sellPct: s.sellPct };
    });
}
