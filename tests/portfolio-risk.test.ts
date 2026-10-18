import { describe, expect, it } from 'vitest';
import { alignPortfolio, benchmarkRisk, historicalRisk, lossTail, portfolioValue, positionShock, type DailyLevel, type RiskPosition } from '../src/finance/portfolio-risk';
import { adjustPosition } from '../src/terminal/portfolio';
import { portfolioSnapshot } from '../src/data/portfolio-history';
import { MarketEngine } from '../src/data/engine';
import { alignedReturns } from '../src/data/analytics';

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const CUTOFF = START + 200 * DAY;
function path(returns: number[], initial = 100): DailyLevel[] {
  const out = [{ date: START, value: initial }];
  for (const r of returns) out.push({ date: START + out.length * DAY, value: out.at(-1)!.value * (1 + r) });
  return out;
}
const returns = Array.from({ length: 40 }, (_, i) => ((i % 9) - 4) / 100);
const holding = (extra: Partial<RiskPosition> = {}): RiskPosition => ({ id: 'A', quantity: 10, cost: 80, multiplier: 1, margined: false, price: 100, fx: 1, prices: path(returns), ...extra });
function aligned(ps: RiskPosition[], cash = 0) {
  const answer = alignPortfolio(ps, cash, CUTOFF);
  if (!answer.ok) throw new Error(answer.error);
  return answer.value;
}

describe('exact portfolio history and historical FX', () => {
  it('freezes source state and timestamps with the exact price/FX marks used in calculations', () => {
    const market = new MarketEngine(() => CUTOFF);
    const d = market.defs.find((s) => s.cls === 'equity' && s.ccy === 'EUR')!;
    const set = (id: string, last: number, provider: string, time: number) => {
      market.setExternalDaily(id, [{ day: CUTOFF / DAY - 1, o: last, h: last, l: last, c: last, v: 1 }], { provider });
      market.setExternalQuote(id, { last, time, fetched: CUTOFF, marketOpen: true, timing: 'realtime' });
    };
    set(d.id, 100, 'Old price source', CUTOFF - 30_000);
    set('CCY:EUR', 1.2, 'Old FX source', CUTOFF - 20_000);
    const result = portfolioSnapshot([{ id: d.id, qty: 10, cost: 90 }], 1000, 252, market);
    if (!result.ok) throw new Error(result.error);
    const p = result.value.positions[0];
    expect(p.price).toBe(100);
    expect(p.fx).toBe(1.2);
    expect(p.priceMark).toMatchObject({ provider: 'Old price source', time: CUTOFF - 30_000, received: CUTOFF, freshness: 'REAL-TIME' });
    expect(p.fxMark).toMatchObject({ provider: 'Old FX source', time: CUTOFF - 20_000 });
    set(d.id, 200, 'New price source', CUTOFF);
    set('CCY:EUR', 1.4, 'New FX source', CUTOFF);
    expect(p.price).toBe(100);
    expect(p.fx).toBe(1.2);
    expect(p.priceMark.provider).toBe('Old price source');
    expect(p.fxMark.provider).toBe('Old FX source');
    expect(portfolioValue([p], 1000)).toBe(2200);
    expect(result.value.capturedAt).toBe(CUTOFF);
  });

  it('labels the CNY/CNH conversion proxy explicitly and keeps its actual FX identity', () => {
    const market = new MarketEngine(() => CUTOFF);
    const d = { ...market.get('AAPL US Equity')!, id: 'CNY FIXTURE Equity', ticker: 'CNY FIXTURE', ccy: 'CNY' };
    expect(market.addSecurity(d)).toBe(true);
    const result = portfolioSnapshot([{ id: d.id, qty: 1, cost: 1 }], 1000, 20, market);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.positions[0]).toMatchObject({ quoteCurrency: 'CNY', fxCurrency: 'CNH', fxId: 'CCY:CNH', fxProxyNote: expect.stringContaining('offshore CNH') });
  });
  it('allows the correlation universe to become empty without accessing a missing date spine', () => {
    expect(alignedReturns([], 252)).toEqual({ dates: [], rets: [] });
  });
  it('replays historical FX and future P&L with fixed quantities and cash', () => {
    const prices = path([0.1, -0.2]);
    const fxHistory = path([0.2, -0.1], 1);
    const a = holding({ prices, fxHistory });
    const f = holding({ id: 'F', quantity: -2, multiplier: 50, margined: true, cost: 90, prices, fxHistory });
    const history = aligned([a, f], 5000);
    [5000 + 1000 - 1000, 5000 + 1100 * 1.2 - 2000 * 1.2, 5000 + 880 * 1.08 + 200 * 1.08].forEach((v, i) => expect(history.nav[i]).toBeCloseTo(v, 9));
    // Today's FX/spot are deliberately different and cannot leak into historical NAV.
    const changed = aligned([{ ...a, price: 700, fx: 3 }, f], 5000);
    expect(changed.nav).toEqual(history.nav);
  });

  it('never drops a holding or fills unavailable price/FX history', () => {
    expect(alignPortfolio([holding(), holding({ id: 'EMPTY', prices: [] })], 0, CUTOFF)).toMatchObject({ ok: false, error: expect.stringContaining('EMPTY') });
    expect(alignPortfolio([holding({ fxHistory: [] })], 0, CUTOFF)).toMatchObject({ ok: false });
    expect(alignPortfolio([holding({ prices: [path([])[0], path([])[0]] })], 0, CUTOFF)).toMatchObject({ ok: false });
    expect(alignPortfolio([holding(), holding()], 0, CUTOFF)).toMatchObject({ ok: false });
  });

  it('ignores nonpositive futures prices outside the selected shared window, but refuses them inside it', () => {
    const f = holding({ id: 'FUTURE', margined: true, prices: path(returns) });
    f.prices[0] = { ...f.prices[0], value: -37.63 };
    const recent = alignPortfolio([f], 10_000, CUTOFF, 20);
    if (!recent.ok) throw new Error(recent.error);
    expect(recent.value.dates).toHaveLength(21);
    expect(historicalRisk([f], 10_000, recent.value)).toMatchObject({ ok: true });
    expect(alignPortfolio([f], 10_000, CUTOFF, 252)).toMatchObject({ ok: false, error: expect.stringContaining('selected history window') });
    // The original source data, including the negative historical observation, is retained.
    expect(f.prices[0].value).toBe(-37.63);
  });

  it('excludes the forming UTC date and refuses to bridge missing sessions in risk', () => {
    const a = holding();
    const b = holding({ id: 'B', prices: a.prices.filter((_, i) => i !== 15) });
    const history = aligned([a, b]);
    expect(history.dates).not.toContain(START + 15 * DAY);
    expect(history.omittedDates).toBe(1);
    const analysis = historicalRisk([a, b], 10_000, history);
    if (!analysis.ok) throw new Error(analysis.error);
    // Missing Jan 16 removes both adjoining daily intervals, not an artificial 2-day return.
    expect(analysis.value.dailyPnl).toHaveLength(38);
    expect(analysis.value.dailyDates).not.toContainEqual({ start: START + 14 * DAY, end: START + 16 * DAY });
    const cutoff = START + 40 * DAY;
    const cutoffHistory = alignPortfolio([a], 0, cutoff);
    if (!cutoffHistory.ok) throw new Error(cutoffHistory.error);
    expect(cutoffHistory.value.dates.at(-1)).toBe(cutoff - DAY);
  });

  it('joins a stock across weekends next to a seven-day crypto series, but not across a weekday holiday', () => {
    const crypto = holding({ id: 'BTC' });
    const weekday = (d: DailyLevel) => ![0, 6].includes(new Date(d.date).getUTCDay());
    const stock = holding({ id: 'STOCK', prices: path(returns).filter(weekday) });
    const history = aligned([stock, crypto]);
    // Every shared date is a weekday and every interval joins adjacent stock sessions.
    expect(history.dates.every((date) => ![0, 6].includes(new Date(date).getUTCDay()))).toBe(true);
    expect(history.links.every(Boolean)).toBe(true);
    expect(history.omittedDates).toBe(0);
    // A weekday the stock is missing (Monday 19 January) still breaks the interval across it.
    const holiday = START + 18 * DAY;
    const closed = holding({ id: 'STOCK', prices: path(returns).filter((d) => weekday(d) && d.date !== holiday) });
    const gap = aligned([closed, crypto]);
    expect(gap.omittedDates).toBe(1);
    expect(gap.links.filter((l) => !l)).toHaveLength(1);
    // A weekend day missing from one of two seven-day series is a gap.
    const btc2 = holding({ id: 'ETH', prices: path(returns).filter((d) => d.date !== START + 10 * DAY) });
    expect(aligned([crypto, btc2]).omittedDates).toBe(1);
  });

  it('rejects unknown and yield-only positions and requires a foreign FX history in the real-data adapter', () => {
    const market = new MarketEngine(() => CUTOFF);
    market.realOnly = true;
    expect(portfolioSnapshot([{ id: 'Unknown', qty: 1, cost: 1 }], 0, 252, market)).toMatchObject({ ok: false });
    expect(portfolioSnapshot([{ id: 'USGG10YR Index', qty: 1, cost: 1 }], 0, 252, market)).toMatchObject({ ok: false, error: expect.stringContaining('yield reference') });
    const foreign = market.defs.find((d) => d.cls === 'equity' && d.ccy === 'EUR')!;
    expect(foreign).toBeDefined();
    market.setExternalDaily(foreign.id, [1, 2, 3].map((n) => ({ day: START / DAY + n, o: 100, h: 100, l: 100, c: 100, v: 1 })), { provider: 'Fixture' });
    const missing = portfolioSnapshot([{ id: foreign.id, qty: 10, cost: 100 }], 100, 252, market);
    if (!missing.ok) throw new Error(missing.error);
    expect(missing.value.history).toMatchObject({ ok: false });
    market.setExternalDaily('CCY:EUR', [1, 2, 3].map((n) => ({ day: START / DAY + n, o: 1 + n / 10, h: 1 + n / 10, l: 1 + n / 10, c: 1 + n / 10, v: 0 })), { provider: 'Fixture FX' });
    const good = portfolioSnapshot([{ id: foreign.id, qty: 10, cost: 100 }], 100, 252, market);
    if (!good.ok || !good.value.history.ok) throw new Error('Expected covered foreign history');
    expect(good.value.history.value.nav).toEqual([1200, 1300, 1400]);
  });
});

describe('empirical loss quantiles and additive risk', () => {
  it('uses nearest-rank VaR and fractional ES, including gains and order-independent ties', () => {
    const tail = lossTail([10, 20, 30, 40], 0.625)!;
    expect(tail.valueAtRisk).toBe(30);
    expect(tail.tailMass).toBe(1.5);
    expect(tail.expectedShortfall).toBe((40 + 0.5 * 30) / 1.5);
    expect(lossTail([10, 20, 30, 40], 0.99)!.expectedShortfall).toBeCloseTo(40, 12);
    const tied = lossTail([10, 30, 30, 10], 0.75)!;
    expect(tied.weights).toEqual([{ index: 1, weight: 0.5 }, { index: 2, weight: 0.5 }]);
    expect(lossTail([-4, -3, -2, -1], 0.75)).toMatchObject({ valueAtRisk: -2, expectedShortfall: -1 });
    for (const input of [[], [NaN], [Infinity]]) expect(lossTail(input, 0.95)).toBeNull();
    expect(lossTail([1], 1)).toBeNull();
  });

  it('matches hand-calculated exposure shocks and Euler contributions, including a hedge', () => {
    const a = holding();
    const b = holding({ id: 'HEDGE', quantity: -5 });
    const result = historicalRisk([a, b], 5000, aligned([a, b], 5000));
    if (!result.ok) throw new Error(result.error);
    const r = result.value;
    const pnl = returns.map((v) => 500 * v);
    r.dailyPnl.forEach((v, i) => expect(v).toBeCloseTo(pnl[i], 10));
    const average = pnl.reduce((a, b) => a + b) / pnl.length;
    const sd = Math.sqrt(pnl.reduce((sum, v) => sum + (v - average) ** 2, 0) / (pnl.length - 1));
    expect(r.nav).toBe(5500);
    expect(r.grossExposure).toBe(1500);
    expect(r.annualVolatilityUsd).toBeCloseTo(sd * Math.sqrt(252), 9);
    expect(r.contributions[0].volatilityShare).toBeCloseTo(2, 10);
    expect(r.contributions[1].volatilityShare).toBeCloseTo(-1, 10);
    expect(r.contributions.reduce((s, c) => s + c.volatilityUsd, 0)).toBeCloseTo(r.annualVolatilityUsd, 10);
    expect(r.contributions.reduce((s, c) => s + c.expectedShortfall, 0)).toBeCloseTo(r.tail.expectedShortfall, 10);
    expect(r.contributions[1].expectedShortfall).toBeLessThan(0);
  });

  it('revalues observed multi-interval changes rather than scaling one-day VaR', () => {
    const a = holding({ prices: path(Array(40).fill(-0.01)) });
    const result = historicalRisk([a], 0, aligned([a]), 0.95, 5);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.scenarioPnl).toHaveLength(36);
    expect(result.value.tail.valueAtRisk).toBeCloseTo(1000 * (1 - 0.99 ** 5), 10);
    expect(result.value.tail.valueAtRisk).not.toBeCloseTo(10 * Math.sqrt(5), 1);
    expect(result.value.scenarioDates[0]).toEqual({ start: START, end: START + 5 * DAY });
  });

  it('returns zero dollar risk for exact hedges, and omits percent metrics for nonpositive NAV', () => {
    const a = holding();
    const b = holding({ id: 'HEDGE', quantity: -10 });
    const r = historicalRisk([a, b], 0, aligned([a, b]));
    if (!r.ok) throw new Error(r.error);
    expect(r.value.annualVolatilityUsd).toBe(0);
    expect(r.value.tail.expectedShortfall).toBe(0);
    expect(r.value.annualVolatility).toBeNaN();
    expect(r.value.drawdown).toBeNaN();
    expect(historicalRisk([a], 0, aligned([a]), 0.99, 30)).toMatchObject({ ok: false, error: expect.stringContaining('20 shared') });
    expect(historicalRisk([{ ...a, price: NaN }], 0, aligned([a]))).toMatchObject({ ok: false });
  });

  it('matches benchmark start/end dates independently, with known beta and tracking error', () => {
    const a = holding();
    const r = historicalRisk([a], 0, aligned([a]));
    if (!r.ok) throw new Error(r.error);
    const bm = path(returns.map((r) => r / 2)).filter((_, i) => i !== 15);
    const paired = benchmarkRisk(r.value.dailyDates, r.value.dailyPnl, r.value.nav, bm, CUTOFF)!;
    expect(paired.dates).toHaveLength(38);
    expect(paired.regression.beta).toBeCloseTo(2, 10);
    expect(paired.regression.corr).toBeCloseTo(1, 10);
    paired.portfolioReturns.forEach((v, i) => expect(v).toBeCloseTo(2 * paired.benchmarkReturns[i], 12));
    expect(benchmarkRisk(r.value.dailyDates, r.value.dailyPnl, -1, bm, CUTOFF)).toBeNull();
  });
});

describe('linear stress and manual position costs', () => {
  it('revalues both price and FX, using futures unrealised value rather than notional in NAV', () => {
    const stock = holding({ fx: 1.2 });
    expect(positionShock(stock, -0.1, 0.1)).toBeCloseTo(10 * 90 * 1.32 - 1200, 10);
    const future = holding({ quantity: 2, cost: 80, multiplier: 50, margined: true, fx: 1.2 });
    expect(portfolioValue([future], 5000)).toBe(7400);
    expect(positionShock(future, -0.1, 0.1)).toBeCloseTo(2 * 50 * (90 - 80) * 1.32 - 2400, 10);
    expect(positionShock(stock, -1, 0)).toBe(-1200);
    expect(positionShock(stock, -1.1, 0)).toBeNaN();
    expect(positionShock(stock, 0, -1)).toBeNaN();
  });

  it('averages increases, preserves reduced cost, resets reversals and removes closed positions', () => {
    const p = { id: 'A', qty: 10, cost: 100 };
    expect(adjustPosition(p, 'A', 10, 200)).toEqual({ id: 'A', qty: 20, cost: 150 });
    expect(adjustPosition(p, 'A', -5, 200)).toEqual({ id: 'A', qty: 5, cost: 100 });
    expect(adjustPosition(p, 'A', -15, 200)).toEqual({ id: 'A', qty: -5, cost: 200 });
    expect(adjustPosition(p, 'A', -10, 200)).toBeNull();
    expect(adjustPosition({ ...p, qty: -10 }, 'A', 5, 200)).toEqual({ id: 'A', qty: -5, cost: 100 });
    expect(() => adjustPosition(p, 'A', 1, NaN)).toThrow();
  });
});
