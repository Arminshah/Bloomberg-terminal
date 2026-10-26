import { describe, expect, it } from 'vitest';
import { byMonth, calendarYears, monthKey, prevMonth, runBacktest, score, statsOf, type MonthCloses } from '../src/data/backtest';
import { scoreShown, universeOf } from '../src/functions/EQBT';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import spark from './fixtures/yahoo-monthly-dow-2026-10.json';

// Yahoo's monthly closes as it answered them on 26 October 2026 (range=10y, interval=1mo): the Dow and the 30 members
// the app keeps for it, timestamps and closes only.
const answers = spark as Record<string, { timestamp: number[]; close: (number | null)[] }>;
const closes = (sym: string): MonthCloses => byMonth(answers[sym].timestamp.map((t) => t * 1000), answers[sym].close.map((c) => (typeof c === 'number' ? c : NaN)));
const bench = closes('^DJI');
const stocks = Object.fromEntries(Object.keys(answers).filter((s) => s !== '^DJI').map((s) => [s, closes(s)]));
const spec = { rule: 'momentum' as const, lookback: 12, holdings: 10, every: 1, costBps: 0, start: '' };

describe('Equity backtesting (EQBT)', () => {
  it("keeps each month's last close: Yahoo's answer carries the current month twice", () => {
    const raw = answers.KO;
    expect(raw.timestamp).toHaveLength(121);
    expect(monthKey(raw.timestamp[119] * 1000)).toBe(monthKey(raw.timestamp[120] * 1000));
    const ko = closes('KO');
    expect(Object.keys(ko)).toHaveLength(120);
    expect(ko['2026-10']).toBe(raw.close[120]);
    expect(Object.keys(ko)[0]).toBe('2016-11');
    expect(prevMonth('2026-01')).toBe('2025-12');
  });

  it('scores a stock on its closes up to the month only, each rule as it says', () => {
    const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
    const c = { '2026-01': 100, '2026-02': 110, '2026-03': 99, '2026-04': 120 };
    // Momentum over three months leaves out the latest: 99 / 100.
    expect(score('momentum', c, months, 3, 3)).toBeCloseTo(-0.01, 12);
    expect(score('reversal', c, months, 3, 1)).toBeCloseTo(-(120 / 99 - 1), 12);
    const r = [0.1, 99 / 110 - 1, 120 / 99 - 1];
    const m = r.reduce((a, b) => a + b) / 3;
    expect(score('lowvol', c, months, 3, 3)).toBeCloseTo(-Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / 2), 12);
    expect(score('trend', c, months, 3, 3)).toBeCloseTo(120 / ((110 + 99 + 120) / 3) - 1, 12);
    // Below its average, a stock is not held on trend; without the lookback's closes, by no rule.
    expect(score('trend', c, months, 2, 2)).toBeNaN();
    expect(score('momentum', c, months, 2, 3)).toBeNaN();
  });

  it("holds the momentum leaders on the Dow's real closes, against the Dow and its members in equal weights", () => {
    const res = runBacktest(stocks, bench, spec, '2026-09')!;
    // Twelve months of closes first: the first rebalance is at the end of November 2017.
    expect(res.months[0]).toBe('2017-11');
    expect(res.months[res.months.length - 1]).toBe('2026-09');
    expect(res.index[res.index.length - 1]).toBeCloseTo(bench['2026-09'] / bench['2017-11'], 12);
    // The picks: the ten best returns from November 2016 to October 2017.
    const leaders = Object.keys(stocks)
      .filter((s) => stocks[s]['2016-11'] > 0 && stocks[s]['2017-10'] > 0)
      .sort((a, b) => stocks[b]['2017-10'] / stocks[b]['2016-11'] - stocks[a]['2017-10'] / stocks[a]['2016-11'])
      .slice(0, 10);
    expect(res.rebalances[0].picks.map((p) => p.symbol)).toEqual(leaders);
    // The first month: the picks' average return, as they start in equal weights.
    const first = leaders.reduce((a, s) => a + stocks[s]['2017-12'] / stocks[s]['2017-11'] - 1, 0) / 10;
    expect(res.strategy[1]).toBeCloseTo(1 + first, 12);
    const all = Object.keys(stocks).filter((s) => stocks[s]['2017-11'] > 0 && stocks[s]['2017-12'] > 0);
    expect(res.equal[1]).toBeCloseTo(1 + all.reduce((a, s) => a + stocks[s]['2017-12'] / stocks[s]['2017-11'] - 1, 0) / all.length, 12);
    expect(res.rebalances).toHaveLength(res.months.length - 1);
    expect(res.latest).toHaveLength(10);
  });

  it('charges costs on the weight traded, and rebalances quarterly when asked', () => {
    const free = runBacktest(stocks, bench, spec, '2026-09')!;
    const paid = runBacktest(stocks, bench, { ...spec, costBps: 25 }, '2026-09')!;
    expect(paid.strategy[0]).toBeCloseTo(1 - 0.0025, 12);
    expect(paid.rebalances[0].bought).toBeCloseTo(1, 12);
    expect(paid.strategy[paid.strategy.length - 1]).toBeLessThan(free.strategy[free.strategy.length - 1]);
    const quarterly = runBacktest(stocks, bench, { ...spec, every: 3 }, '2026-09')!;
    expect(quarterly.rebalances.map((r) => r.month).slice(0, 3)).toEqual(['2017-11', '2018-02', '2018-05']);
  });

  it('holds cash on trend for places no stock above its average fills', () => {
    const res = runBacktest({ KO: stocks.KO }, bench, { ...spec, rule: 'trend', lookback: 10, holdings: 5 }, '2026-09')!;
    const r = res.rebalances[0];
    // One stock at most: a fifth of the portfolio, the rest in cash.
    expect(r.picks.length).toBeLessThanOrEqual(1);
    expect(r.bought).toBeCloseTo(r.picks.length / 5, 12);
  });

  it('starts at the month chosen, and gives no result without the history', () => {
    expect(runBacktest(stocks, bench, { ...spec, start: '2022-01' }, '2026-09')!.months[0]).toBe('2022-01');
    expect(runBacktest(stocks, bench, { ...spec, start: '2026-09' }, '2026-09')).toBeNull();
  });

  it('measures annual return, volatility, the largest fall and the months beating the index', () => {
    const s = statsOf([1, 1.1, 0.99, 1.21], [1, 1, 1, 1]);
    expect(s.total).toBeCloseTo(21, 9);
    expect(s.cagr).toBeCloseTo((1.21 ** 4 - 1) * 100, 9);
    expect(s.maxDrawdown).toBeCloseTo(-10, 9);
    expect(s.best).toBeCloseTo((1.21 / 0.99 - 1) * 100, 9);
    expect(s.beat).toBeCloseTo((2 / 3) * 100, 9);
    expect(calendarYears(['2025-11', '2025-12', '2026-01', '2026-02'], [1, 1.1, 0.99, 1.21])).toEqual([
      { year: 2025, ret: expect.closeTo(10, 9), months: 1 },
      { year: 2026, ret: expect.closeTo(10, 9), months: 2 },
    ]);
  });

  it('opens under EQBT on the index named or loaded, the Dow otherwise, and shows each score in its own terms', () => {
    expect(parseCommand('EQBT', lookupFn)).toEqual({ kind: 'route', fn: 'BACKTEST' });
    expect(universeOf('spx', undefined)).toBe('SPX Index');
    expect(universeOf('', 'NDX Index')).toBe('NDX Index');
    expect(universeOf('', 'AAPL US Equity')).toBe('INDU Index');
    expect(scoreShown('lowvol', { symbol: 'KO', score: -0.04 })).toBeCloseTo(4 * Math.sqrt(12), 9);
    expect(scoreShown('reversal', { symbol: 'KO', score: 0.05 })).toBeCloseTo(-5, 9);
  });
});
