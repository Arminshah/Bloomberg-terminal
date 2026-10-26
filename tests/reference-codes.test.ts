import { describe, expect, it } from 'vitest';
import { rankMovers } from '../src/functions/RATES';
import { crossesZero, trendChange, trendSeries, trendsFor } from '../src/functions/EEG';
import { parseYahooEarnings } from '../src/data/live/consensus';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import apld from './fixtures/yahoo-apld-summary.json';

const parse = (s: string) => parseCommand(s, lookupFn);

describe('World Bond Movers (WBMV)', () => {
  it('ranks yields by the size of their move, rises and falls together, and leaves out lines without a change', () => {
    const lines = [{ id: 'a', chg: 0.03 }, { id: 'b', chg: -0.11 }, { id: 'c', chg: NaN }, { id: 'd', chg: 0.07 }, { id: 'e', chg: 0 }];
    expect(rankMovers(lines).map((l) => l.id)).toEqual(['b', 'd', 'a', 'e']);
  });

  it('opens under its terminal mnemonic', () => {
    expect(parse('WBMV')).toEqual({ kind: 'route', fn: 'BONDMOVERS' });
  });
});

describe('Regression Analysis (HRA)', () => {
  it('regresses the loaded security on the one typed after the function', () => {
    expect(parse('AAPL HRA MSFT')).toMatchObject({ kind: 'route', fn: 'REGRESSION', sec: { id: 'AAPL US Equity' }, args: 'MSFT' });
    expect(parse('HRA AAPL')).toMatchObject({ kind: 'route', fn: 'REGRESSION', sec: { id: 'AAPL US Equity' } });
  });
});

describe('Index Directory (IN)', () => {
  it('opens under IN, and INDICES still opens MARKET', () => {
    expect(parse('IN')).toEqual({ kind: 'route', fn: 'INDEXLIST' });
    expect(parse('INDICES')).toEqual({ kind: 'route', fn: 'MARKET' });
  });
});

describe('Earnings Estimates Graph (EEG)', () => {
  const parsed = parseYahooEarnings(apld);
  const trends = 'data' in parsed ? parsed.data.trends ?? [] : [];

  it("reads Yahoo's consensus now and 7, 30, 60 and 90 days before, with the revisions, for each period", () => {
    expect(trends.map((t) => t.period)).toEqual(['0q', '+1q', '0y', '+1y']);
    expect(trends[0]).toMatchObject({
      end: '2026-11-30',
      eps: { now: -0.16956, d7: -0.34784, d30: -0.33, d60: -0.33, d90: -0.3 },
      up7: 0, up30: 0, down7: 0, down30: 1, analysts: 2, ccy: 'USD',
    });
    // Yahoo spells the seven-day cuts downLast7Days.
    expect(trends[3]).toMatchObject({ end: '2028-05-31', down7: 1, down30: 1, analysts: 5, yearAgoEps: -1.06336 });
  });

  it('splits quarters from fiscal years, and gives no percentage change from a loss', () => {
    expect(trendsFor(trends, 1).map((t) => t.period)).toEqual(['0q', '+1q']);
    expect(trendsFor(trends, 2).map((t) => t.period)).toEqual(['0y', '+1y']);
    const c = trendChange(trends[0]);
    expect(c.abs).toBeCloseTo(0.13044, 5);
    expect(c.pct).toBeNaN();
    const profit = { ...trends[0], eps: { now: 1.1, d7: 1.05, d30: 1, d60: 1, d90: 1 } };
    expect(trendChange(profit).pct).toBeCloseTo(10, 6);
  });

  it('plots the five readings by days before today, oldest first, and skips a missing one', () => {
    const [s] = trendSeries([{ ...trends[0], eps: { ...trends[0].eps, d60: NaN } }]);
    expect(s.points).toEqual([{ x: -90, y: -0.3 }, { x: -30, y: -0.33 }, { x: -7, y: -0.34784 }, { x: 0, y: -0.16956 }]);
  });

  it('draws a zero line only when the estimates go from a loss to a profit', () => {
    expect(crossesZero(trendSeries(trends))).toBe(false);
    const turning = { ...trends[1], eps: { now: 0.05, d7: 0.01, d30: -0.02, d60: -0.03, d90: -0.04 } };
    expect(crossesZero(trendSeries([trends[0], turning]))).toBe(true);
  });

  it('drops a period Yahoo gives no consensus history for', () => {
    const bare = JSON.parse(JSON.stringify(apld));
    bare.quoteSummary.result[0].earningsTrend.trend[1].epsTrend = {};
    const p = parseYahooEarnings(bare);
    expect('data' in p && p.data.trends?.map((t) => t.period)).toEqual(['0q', '0y', '+1y']);
  });

  it('opens under its terminal mnemonic', () => {
    expect(parse('NVDA EEG')).toMatchObject({ kind: 'route', fn: 'ESTIMATEGRAPH', sec: { id: 'NVDA US Equity' } });
  });
});
