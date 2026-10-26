/**
 * Equity backtests on monthly closes (EQBT): at each rebalance a rule ranks the stocks on their closes up to that
 * month's end only, the best ones are held in equal weights until the next rebalance (their weights drift with
 * their prices in between), and trading costs are charged on the weight traded. The result is compared with the
 * index and with all the stocks held in equal weights, rebalanced monthly.
 */

/** Closes by month, "2026-09" -> the month's last close. */
export type MonthCloses = Record<string, number>;

/** The month of an epoch ms, in UTC: "2026-09". */
export const monthKey = (ms: number) => new Date(ms).toISOString().slice(0, 7);

/**
 * Each month's last close from a spark answer's sessions. Yahoo's monthly answer carries the current month twice
 * (its bar, then today's price): the later one is kept.
 */
export function byMonth(t: number[], c: number[]): MonthCloses {
  const out: MonthCloses = {};
  for (let i = 0; i < Math.min(t.length, c.length); i++) if (c[i] > 0) out[monthKey(t[i])] = c[i];
  return out;
}

/** The month before "2026-01": "2025-12". */
export function prevMonth(m: string): string {
  const [y, mm] = m.split('-').map(Number);
  return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
}

export type Rule = 'momentum' | 'reversal' | 'lowvol' | 'trend';

export const RULES: Record<Rule, { label: string; lookback: number; lookbacks: number[]; desc: string }> = {
  momentum: { label: 'Momentum', lookback: 12, lookbacks: [3, 6, 12], desc: 'the highest return over the lookback, the latest month left out' },
  reversal: { label: 'Short-term reversal', lookback: 1, lookbacks: [1, 3], desc: 'the lowest return over the lookback' },
  lowvol: { label: 'Low volatility', lookback: 12, lookbacks: [6, 12, 24], desc: 'the lowest volatility of monthly returns over the lookback' },
  trend: { label: 'Trend', lookback: 10, lookbacks: [6, 10, 12], desc: 'a close above its average over the lookback, the furthest above first; places no stock fills are held in cash' },
};

const stdev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/**
 * A stock's score at month i of `months` (higher ranks first), from its closes up to that month only; NaN when it
 * lacks a close the rule needs, or (trend) when it is not above its average.
 */
export function score(rule: Rule, closes: MonthCloses, months: string[], i: number, lookback: number): number {
  const c = (k: number) => (k >= 0 ? closes[months[k]] : undefined);
  const now = c(i);
  if (!(now! > 0) || i - lookback < 0) return NaN;
  if (rule === 'momentum') {
    const a = c(i - lookback);
    const b = c(i - 1);
    return a! > 0 && b! > 0 ? b! / a! - 1 : NaN;
  }
  if (rule === 'reversal') {
    const a = c(i - lookback);
    return a! > 0 ? -(now! / a! - 1) : NaN;
  }
  const window: number[] = [];
  for (let k = i - lookback; k <= i; k++) {
    const v = c(k);
    if (!(v! > 0)) return NaN;
    window.push(v!);
  }
  if (rule === 'lowvol') return -stdev(window.slice(1).map((v, k) => v / window[k] - 1));
  // Trend: the average of the lookback's closes, the current one included.
  const avg = window.slice(1).reduce((a, b) => a + b, 0) / lookback;
  const above = now! / avg - 1;
  return above > 0 ? above : NaN;
}

export interface BacktestSpec {
  rule: Rule;
  lookback: number;
  /** Stocks held. */
  holdings: number;
  /** Months between rebalances: 1 or 3. */
  every: number;
  /** Trading cost, basis points of the weight traded. */
  costBps: number;
  /** The first rebalance is at the end of this month, or the first month after it with the lookback's closes. */
  start: string;
}

export interface Pick {
  symbol: string;
  score: number;
}

export interface Rebalance {
  month: string;
  picks: Pick[];
  /** Weight bought and sold, 0 to 2. */
  traded: number;
  /** Weight bought, 0 to 1. */
  bought: number;
}

export interface BacktestResult {
  /** Month ends from the first rebalance to the last month. */
  months: string[];
  /** Growth of 1 at each month end. */
  strategy: number[];
  equal: number[];
  index: number[];
  rebalances: Rebalance[];
  /** The rule's picks at the last month end: what it would hold from now. */
  latest: Pick[];
}

/**
 * Runs a rule over the stocks' month-end closes against the index's, on the index's months up to `last` (the last
 * complete month). Null when no month has enough closes to start.
 */
export function runBacktest(stocks: Record<string, MonthCloses>, bench: MonthCloses, spec: BacktestSpec, last: string): BacktestResult | null {
  const months = Object.keys(bench).filter((m) => m <= last).sort();
  const symbols = Object.keys(stocks).sort();
  const ranked = (i: number): Pick[] =>
    symbols
      .map((symbol) => ({ symbol, score: score(spec.rule, stocks[symbol], months, i, spec.lookback) }))
      .filter((p) => Number.isFinite(p.score))
      .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))
      .slice(0, spec.holdings);
  const s = months.findIndex((m, i) => m >= spec.start && i >= spec.lookback && (spec.rule === 'trend' || ranked(i).length >= Math.min(spec.holdings, symbols.length)));
  if (s < 0 || s >= months.length - 1) return null;
  const out: BacktestResult = { months: [months[s]], strategy: [], equal: [1], index: [1], rebalances: [], latest: ranked(months.length - 1) };
  let weights = new Map<string, number>();
  let value = 1;
  const rebalance = (i: number) => {
    const picks = ranked(i);
    const target = new Map(picks.map((p) => [p.symbol, 1 / spec.holdings]));
    // Fewer picks than places: the rule's own (trend) leaves cash; the others share the weight among the picks.
    if (spec.rule !== 'trend' && picks.length) for (const p of picks) target.set(p.symbol, 1 / picks.length);
    let traded = 0;
    let bought = 0;
    for (const sym of new Set([...weights.keys(), ...target.keys()])) {
      const d = (target.get(sym) ?? 0) - (weights.get(sym) ?? 0);
      traded += Math.abs(d);
      if (d > 0) bought += d;
    }
    value *= 1 - (traded * spec.costBps) / 10_000;
    weights = target;
    out.rebalances.push({ month: months[i], picks, traded, bought });
  };
  rebalance(s);
  out.strategy.push(value);
  for (let j = s + 1; j < months.length; j++) {
    const ret = (sym: string) => {
      const a = stocks[sym]?.[months[j - 1]];
      const b = stocks[sym]?.[months[j]];
      return a! > 0 && b! > 0 ? b! / a! - 1 : NaN;
    };
    let r = 0;
    for (const [sym, w] of weights) r += w * (ret(sym) || 0);
    const next = new Map<string, number>();
    for (const [sym, w] of weights) next.set(sym, (w * (1 + (ret(sym) || 0))) / (1 + r));
    weights = next;
    value *= 1 + r;
    const all = symbols.map(ret).filter(Number.isFinite);
    out.equal.push(out.equal[out.equal.length - 1] * (1 + (all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0)));
    out.index.push(out.index[out.index.length - 1] * (bench[months[j]] / bench[months[j - 1]]));
    out.months.push(months[j]);
    if ((j - s) % spec.every === 0 && j < months.length - 1) rebalance(j);
    out.strategy.push(value);
  }
  return out;
}

export interface Stats {
  total: number;
  /** Compound annual return, %. */
  cagr: number;
  /** Annualised volatility of monthly returns, %. */
  vol: number;
  /** Compound annual return over volatility. */
  ratio: number;
  /** Largest fall from a month-end peak, % (negative). */
  maxDrawdown: number;
  best: number;
  worst: number;
  /** Months it beat the index, %. */
  beat: number;
}

/** Returns of a growth series, month by month, %. */
export const returnsOf = (values: number[]) => values.slice(1).map((v, i) => (v / values[i] - 1) * 100);

export function statsOf(values: number[], index: number[]): Stats {
  const r = returnsOf(values);
  const b = returnsOf(index);
  const years = r.length / 12;
  const growth = values[values.length - 1] / values[0];
  let peak = values[0];
  let dd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  }
  const cagr = (growth ** (1 / years) - 1) * 100;
  const vol = r.length > 1 ? stdev(r) * Math.sqrt(12) : NaN;
  return { total: (growth - 1) * 100, cagr, vol, ratio: cagr / vol, maxDrawdown: dd * 100, best: Math.max(...r), worst: Math.min(...r), beat: (r.filter((x, i) => x > b[i]).length / r.length) * 100 };
}

/** Each calendar year's return, %, compounded from the months in it (a year the backtest starts or ends inside is partial). */
export function calendarYears(months: string[], values: number[]): { year: number; ret: number; months: number }[] {
  const out: { year: number; ret: number; months: number }[] = [];
  for (let i = 1; i < months.length; i++) {
    const year = Number(months[i].slice(0, 4));
    const r = values[i] / values[i - 1];
    const row = out[out.length - 1];
    if (row?.year === year) {
      row.ret = ((1 + row.ret / 100) * r - 1) * 100;
      row.months++;
    } else out.push({ year, ret: (r - 1) * 100, months: 1 });
  }
  return out;
}
