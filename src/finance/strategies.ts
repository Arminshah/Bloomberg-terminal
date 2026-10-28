import { bollinger, macd, rsi, sma } from './indicators';
import { maxDrawdown } from './stats';

/**
 * STRATEGIES (BTST): popular trading rules run on one security's daily closes and ranked by their historical return
 * and risk, as the publisher describes BTST ("rank popular trading strategies based on historical return and risk
 * stats for any asset class"). Each rule decides its position on a day's close from closes up to that day only; the
 * position earns the next day's return. A change of position costs the stated basis points of the amount traded.
 */

export type StrategyId = 'hold' | 'sma-cross' | 'sma200' | 'macd' | 'rsi' | 'bollinger' | 'breakout' | 'momentum';

export interface StrategyDef {
  id: StrategyId;
  name: string;
  /** The rule in words, long side first; the short side mirrors it when shorts are allowed. */
  rule: string;
  /** Closes it needs before its first decision. */
  warmup: number;
}

export const STRATEGIES: readonly StrategyDef[] = [
  { id: 'hold', name: 'Buy and hold', rule: 'Long from the first day to the last', warmup: 0 },
  { id: 'sma-cross', name: 'Moving average cross 50/200', rule: 'Long while the 50-day average is above the 200-day', warmup: 200 },
  { id: 'sma200', name: 'Price above 200-day average', rule: 'Long while the close is above its 200-day average', warmup: 200 },
  { id: 'macd', name: 'MACD 12/26/9', rule: 'Long while the MACD line is above its 9-day signal line', warmup: 35 },
  { id: 'rsi', name: 'RSI 14 reversal 30/70', rule: 'Buy when the 14-day RSI falls below 30, sell when it rises above 70', warmup: 15 },
  { id: 'bollinger', name: 'Bollinger reversal 20/2', rule: 'Buy on a close below the lower band (20 days, 2 deviations), sell at the middle band', warmup: 20 },
  { id: 'breakout', name: 'Breakout 20/10', rule: 'Buy on a close above the highest of the 20 days before, sell on one below the lowest of the 10 before', warmup: 21 },
  { id: 'momentum', name: 'Momentum 6 months', rule: 'Long while the close is above its level 126 trading days before', warmup: 127 },
];

export const STRATEGY: Record<StrategyId, StrategyDef> = Object.fromEntries(STRATEGIES.map((s) => [s.id, s])) as Record<StrategyId, StrategyDef>;

/** The position each day's close decides: 1 long, −1 short, 0 out. Before a rule can decide, 0. */
export function positions(id: StrategyId, c: ArrayLike<number>, shorts: boolean): Int8Array {
  const n = c.length;
  const out = new Int8Array(n);
  const off = shorts ? -1 : 0;
  const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
  switch (id) {
    case 'hold':
      out.fill(1);
      return out;
    case 'sma-cross': {
      const f = sma(c, 50);
      const s = sma(c, 200);
      for (let i = 0; i < n; i++) out[i] = ok(f[i], s[i]) ? (f[i] > s[i] ? 1 : off) : 0;
      return out;
    }
    case 'sma200': {
      const s = sma(c, 200);
      for (let i = 0; i < n; i++) out[i] = ok(s[i]) ? (c[i] > s[i] ? 1 : off) : 0;
      return out;
    }
    case 'macd': {
      const m = macd(c);
      for (let i = 0; i < n; i++) out[i] = ok(m.macd[i], m.signal[i]) ? (m.macd[i] > m.signal[i] ? 1 : off) : 0;
      return out;
    }
    case 'momentum': {
      for (let i = 126; i < n; i++) out[i] = c[i] > c[i - 126] ? 1 : off;
      return out;
    }
    case 'rsi': {
      const r = rsi(c, 14);
      let p = 0;
      for (let i = 0; i < n; i++) {
        if (ok(r[i])) {
          if (r[i] < 30) p = 1;
          else if (r[i] > 70) p = shorts ? -1 : 0;
        }
        out[i] = p;
      }
      return out;
    }
    case 'bollinger': {
      const b = bollinger(c, 20, 2);
      let p = 0;
      for (let i = 0; i < n; i++) {
        if (ok(b.lower[i], b.upper[i], b.mid[i])) {
          if (p === 1 && c[i] >= b.mid[i]) p = 0;
          else if (p === -1 && c[i] <= b.mid[i]) p = 0;
          if (p === 0 && c[i] < b.lower[i]) p = 1;
          else if (p === 0 && shorts && c[i] > b.upper[i]) p = -1;
        }
        out[i] = p;
      }
      return out;
    }
    case 'breakout': {
      let p = 0;
      for (let i = 20; i < n; i++) {
        let hi20 = -Infinity;
        let lo20 = Infinity;
        for (let j = i - 20; j < i; j++) {
          hi20 = Math.max(hi20, c[j]);
          lo20 = Math.min(lo20, c[j]);
        }
        let hi10 = -Infinity;
        let lo10 = Infinity;
        for (let j = i - 10; j < i; j++) {
          hi10 = Math.max(hi10, c[j]);
          lo10 = Math.min(lo10, c[j]);
        }
        if (p === 1 && c[i] < lo10) p = 0;
        else if (p === -1 && c[i] > hi10) p = 0;
        if (p === 0 && c[i] > hi20) p = 1;
        else if (p === 0 && shorts && c[i] < lo20) p = -1;
        out[i] = p;
      }
      return out;
    }
  }
}

export interface StrategyResult {
  id: StrategyId;
  /** Growth of 1 from the first day of the period, one value a day. */
  equity: number[];
  /** Percent. */
  totalReturn: number;
  /** Annual rate, percent: the total return compounded over the period's calendar length. */
  cagr: number;
  /** Annualised volatility of daily returns (252 days), percent. */
  vol: number;
  /** Annualised mean daily return over annualised volatility, with no deduction for a risk-free rate. */
  sharpe: number;
  /** Percent, negative. */
  maxDrawdown: number;
  /** Positions entered (a reversal from long to short counts once). */
  trades: number;
  /** Trades closed with a gain, percent of those closed; NaN with none closed. */
  winRate: number;
  closed: number;
  /** Share of days in a position, percent. */
  exposure: number;
  /** The position the last close decided. */
  now: number;
}

/**
 * One rule over the period from index `start` of the closes (the closes before it are the rule's warm-up). Day i's
 * position, decided on its close, earns the return from close i to close i + 1; a change of position on day i takes
 * `costBps` per unit traded off the capital first (a reversal trades two).
 */
export function runStrategy(id: StrategyId, t: ArrayLike<number>, c: ArrayLike<number>, start: number, costBps: number, shorts: boolean): StrategyResult {
  const pos = positions(id, c, shorts);
  const cost = costBps / 1e4;
  const equity = [1];
  const daily: number[] = [];
  let prev = 0;
  let trades = 0;
  let closed = 0;
  let wins = 0;
  let open = NaN;
  let inMarket = 0;
  let eq = 1;
  for (let i = start; i < c.length - 1; i++) {
    const p = pos[i];
    // The cost comes off the capital when the position changes, before the day's change.
    const kept = p !== prev ? 1 - Math.abs(p - prev) * cost : 1;
    if (p !== prev) {
      if (prev !== 0 && Number.isFinite(open)) {
        closed++;
        if (eq * kept > open) wins++;
      }
      if (p !== 0) {
        trades++;
        open = eq * kept;
      } else open = NaN;
    }
    const r = kept * (1 + p * (c[i + 1] / c[i] - 1)) - 1;
    if (p !== 0) inMarket++;
    eq *= 1 + r;
    equity.push(eq);
    daily.push(r);
    prev = p;
  }
  const n = daily.length;
  const meanD = n ? daily.reduce((a, x) => a + x, 0) / n : NaN;
  const sd = n > 1 ? Math.sqrt(daily.reduce((a, x) => a + (x - meanD) ** 2, 0) / (n - 1)) : NaN;
  const years = (t[c.length - 1] - t[start]) / (365.25 * 86_400_000);
  return {
    id,
    equity,
    totalReturn: (eq - 1) * 100,
    cagr: years > 0 && eq > 0 ? (eq ** (1 / years) - 1) * 100 : NaN,
    vol: sd * Math.sqrt(252) * 100,
    sharpe: sd > 0 ? (meanD * 252) / (sd * Math.sqrt(252)) : NaN,
    maxDrawdown: maxDrawdown(equity) * 100,
    trades,
    winRate: closed ? (wins / closed) * 100 : NaN,
    closed,
    exposure: n ? (inMarket / n) * 100 : NaN,
    now: pos[c.length - 1] ?? 0,
  };
}

/**
 * Every rule over the last `days` trading days of the closes, each with the warm-up it needs before them; NaN results
 * for a rule without enough history before the period.
 */
export function rankStrategies(t: ArrayLike<number>, c: ArrayLike<number>, days: number, costBps: number, shorts: boolean): { start: number; results: StrategyResult[]; short: StrategyId[] } {
  const start = Math.max(0, c.length - 1 - days);
  const results: StrategyResult[] = [];
  const short: StrategyId[] = [];
  for (const s of STRATEGIES) {
    if (start < s.warmup) {
      short.push(s.id);
      continue;
    }
    results.push(runStrategy(s.id, t, c, start, costBps, shorts));
  }
  return { start, results, short };
}
