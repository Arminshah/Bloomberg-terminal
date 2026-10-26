import { describe, expect, it } from 'vitest';
import { rankMovers } from '../src/functions/RATES';
import { crossesZero, trendChange, trendSeries, trendsFor } from '../src/functions/EEG';
import { fiscalYearOf, quarterLines, trendBars, yearLines } from '../src/functions/EM';
import type { Consensus, EstimateTrend, QuarterView } from '../src/data/live/consensus';
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

describe('Earnings Trends (EM)', () => {
  const none = { est: NaN, low: NaN, high: NaN, analysts: NaN, actual: NaN };
  const q = (label: string, end: string, actual: number, est: number, rev = NaN): QuarterView => ({
    label, end,
    eps: { ...none, actual, est, analysts: 9, actualFrom: 'Yahoo Finance' },
    rev: { ...none, actual: rev, actualFrom: 'Yahoo Finance' },
  });
  // Newest first, as the consensus gives them: fiscal years end in May.
  const c: Consensus = {
    past: [
      q('Q4 2026', '2026-05-31', 0.5, 0.4, 1200e6), q('Q3 2026', '2026-02-28', 0.4, 0.42, 1100e6), q('Q2 2026', '2025-11-30', 0.3, 0.3), q('Q1 2026', '2025-08-31', 0.2, 0.25),
      q('Q4 2025', '2025-05-31', 0.25, 0.2, 1000e6), q('Q3 2025', '2025-02-28', -0.1, -0.05), q('Q2 2025', '2024-11-30', 0.1, 0.1), q('Q1 2025', '2024-08-31', 0.1, 0.1),
    ],
    next: { label: 'Q1 2027', end: '2026-08-31', eps: { ...none, est: 0.6, analysts: 8, estFrom: 'Yahoo Finance' }, rev: { ...none, est: 1300e6 }, yearAgoEps: 0.2, yearAgoRev: 1000e6 },
    following: { label: 'Q2 2027', end: '2026-11-30', eps: { ...none, est: 0.7, analysts: 7 }, rev: none, yearAgoEps: -0.05 },
    problems: [],
    loading: false,
  };

  it('lists the reported quarters oldest first with their surprise and growth, then the next two', () => {
    const lines = quarterLines(c, []);
    expect(lines.map((l) => l.label)).toEqual(['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027']);
    const last = lines[7];
    expect(last).toMatchObject({ reported: true, eps: 0.5, est: 0.4, from: 'Yahoo Finance' });
    expect(last.surprise).toBeCloseTo(25, 6);
    expect(last.yoy).toBeCloseTo(100, 6);
    expect(last.qoq).toBeCloseTo(25, 6);
    expect(last.revYoy).toBeCloseTo(20, 6);
    // Against a loss a year before: no growth, and it says so.
    expect(lines[6].yoy).toBeNaN();
    expect(lines[6].nm).toBe(true);
    // The quarters to come grow on the year-ago figure the source gives.
    expect(lines[8]).toMatchObject({ reported: false, est: 0.6, analysts: 8 });
    expect(lines[8].eps).toBeNaN();
    expect(lines[8].yoy).toBeCloseTo(200, 6);
    expect(lines[8].revYoy).toBeCloseTo(30, 6);
    expect(lines[9].nm).toBe(true);
    // Nor from a profit to a loss.
    const toLoss = quarterLines({ ...c, next: c.next && { ...c.next, eps: { ...c.next.eps, est: -0.25 }, yearAgoEps: 0.09 } }, []);
    expect(toLoss[8].yoy).toBeNaN();
    expect(toLoss[8].nm).toBe(true);
    // A source without the year-ago figure (Finnhub's calendar): the same quarter as reported a year before.
    const finnhub = quarterLines({ ...c, next: c.next && { ...c.next, end: '', yearAgoEps: undefined, yearAgoRev: undefined } }, []);
    expect(finnhub[8].yoy).toBeCloseTo((0.6 / 0.2 - 1) * 100, 6);
    expect(quarterLines(c, [], 3).map((l) => l.label)).toEqual(['Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027']);
  });

  it("compares EPS across sources on the analysts' basis, never with the statements' GAAP EPS", () => {
    const mixed: Consensus = { ...c, past: c.past.map((x, i) => (i >= 4 ? { ...x, eps: { ...x.eps, actualFrom: 'Alpha Vantage' } } : x)) };
    // The statements' diluted EPS for the latest quarter and the one a year before would give +300%.
    const statements = [
      { end: Date.parse('2026-05-31T00:00:00Z'), eps: 0.8, rev: 1200 },
      { end: Date.parse('2025-05-31T00:00:00Z'), eps: 0.2, rev: 900 },
    ] as unknown as Parameters<typeof quarterLines>[1];
    const lines = quarterLines(mixed, statements);
    expect(lines[7].yoy).toBeCloseTo(100, 6);
    // Revenue: the reported figures first; the statements only where none was reported.
    expect(lines[7].revYoy).toBeCloseTo(20, 6);
  });

  it("adds up a fiscal year's four reported quarters and carries on into Yahoo's consensus for the years to come", () => {
    const trends: EstimateTrend[] = [
      { period: '0y', end: '2027-05-31', eps: { now: 2.4, d7: 2.4, d30: 2.3, d60: 2.2, d90: 2.1 }, up7: 0, up30: 1, down7: 0, down30: 0, analysts: 9, growth: 0.714, yearAgoEps: 1.4 },
      { period: '+1y', end: '2028-05-31', eps: { now: 3, d7: 3, d30: 3, d60: 3, d90: 3 }, up7: 0, up30: 0, down7: 0, down30: 0, analysts: 6, growth: 0.25, yearAgoEps: 2.4 },
      { period: '0q', end: '2026-08-31', eps: { now: 0.6, d7: 0.6, d30: 0.6, d60: 0.6, d90: 0.6 }, up7: 0, up30: 0, down7: 0, down30: 0, analysts: 8, growth: 2, yearAgoEps: 0.2 },
    ];
    const lines = yearLines(c, trends);
    expect(lines.map((l) => [l.label, l.reported])).toEqual([['FY 2025', true], ['FY 2026', true], ['FY 2027', false], ['FY 2028', false]]);
    expect(lines[0].eps).toBeCloseTo(0.35, 9);
    expect(lines[0].yoy).toBeNaN();
    expect(lines[1].eps).toBeCloseTo(1.4, 9);
    expect(lines[1].yoy).toBeCloseTo(300, 6);
    expect(lines[2]).toMatchObject({ est: 2.4, analysts: 9, from: 'Yahoo Finance' });
    expect(lines[2].yoy).toBeCloseTo((2.4 / 1.4 - 1) * 100, 6);
    expect(lines[3].yoy).toBeCloseTo(25, 6);
  });

  it('names a fiscal year by the year it ends in, a first-week end counting in the month before', () => {
    expect(fiscalYearOf('2026-05-31')).toBe(2026);
    expect(fiscalYearOf('2026-01-03')).toBe(2025);
  });

  it('draws reported EPS as bars and the consensus as points, a period to come having only its point', () => {
    const [bars, dots] = trendBars(quarterLines(c, [], 2));
    expect(bars.points).toEqual([{ x: 0, y: 0.4 }, { x: 1, y: 0.5 }]);
    expect(dots.points).toEqual([{ x: 0, y: 0.42 }, { x: 1, y: 0.4 }, { x: 2, y: 0.6 }, { x: 3, y: 0.7 }]);
  });

  it('opens under its terminal mnemonic', () => {
    expect(parse('NVDA EM')).toMatchObject({ kind: 'route', fn: 'EARNINGSTREND', sec: { id: 'NVDA US Equity' } });
  });
});
