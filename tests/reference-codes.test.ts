import { describe, expect, it } from 'vitest';
import { rankMovers } from '../src/functions/RATES';
import { crossesZero, trendChange, trendSeries, trendsFor } from '../src/functions/EEG';
import { fiscalYearOf, quarterLines, trendBars, yearLines } from '../src/functions/EM';
import { bySector, seasonLines, seasonOf, seasonStats, verdict } from '../src/functions/EA';
import { FIELDS, fitLine, gxPoints, type GxContext } from '../src/functions/GX';
import { companiesOf, industriesOf, inIndustry, sectorsOf, UNCLASSIFIED } from '../src/functions/CCB';
import { parseNasdaqListings } from '../src/data/live/earnings-calendar';
import type { CalendarReport } from '../src/data/live/earnings-calendar';
import type { Member } from '../src/data/live/index-members';
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

describe('Earnings Season Results (EA)', () => {
  it('takes the season of the calendar quarter that ended last: its reports until the next quarter ends', () => {
    expect(seasonOf('2026-10-26')).toEqual({ label: 'Q3 2026', from: '2026-10-01', to: '2026-12-31' });
    expect(seasonOf('2026-10-26', 1)).toEqual({ label: 'Q2 2026', from: '2026-07-01', to: '2026-09-30' });
    expect(seasonOf('2026-01-15')).toEqual({ label: 'Q4 2025', from: '2026-01-01', to: '2026-03-31' });
    expect(seasonOf('2026-01-15', 3)).toEqual({ label: 'Q1 2025', from: '2025-04-01', to: '2025-06-30' });
  });

  it('calls a beat, a match or a miss on EPS to the cent', () => {
    expect(verdict(2.5, 2.38)).toBe('beat');
    expect(verdict(1.004, 1)).toBe('inline');
    expect(verdict(0.99, 1)).toBe('miss');
    expect(verdict(NaN, 1)).toBeUndefined();
  });

  const member = (symbol: string, sector: string, cap = NaN, last = NaN) => ({ symbol, name: symbol, sector, cap, last }) as Member;
  const report = (symbol: string, date: string, est: number, actual: number, yearAgo = NaN, rev: [number, number] = [NaN, NaN]) =>
    ({ symbol, date, eps: { est, actual }, rev: { est: rev[0], actual: rev[1] }, epsYearAgo: yearAgo, timing: '--' }) as CalendarReport;
  const season = seasonOf('2026-10-26');
  const members = [member('AAA', 'Tech', 1000, 10), member('BRK.B', 'Financials', 2000, 20), member('CCC', 'Tech', 500, 5), member('DDD', 'Energy'), member('EEE', 'Energy')];
  const reports = [
    report('AAA', '2026-10-20', 1, 1.2, 1, [100, 110]),
    report('AAA', '2026-07-20', 1, 0.5),
    report('BRK/B', '2026-11-02', 2, 1.9, 2.5, [300, 290]),
    report('CCC', '2026-10-15', -0.2, -0.1, -0.3),
    report('DDD', '2026-11-20', 0.8, NaN),
  ];
  const lines = seasonLines(reports, members, season);

  it("matches each member with its report in the season, whatever the ticker's spelling", () => {
    const [a, b, c, d, e] = lines;
    expect(a).toMatchObject({ reported: true, epsAct: 1.2, verdict: 'beat', shares: 100 });
    expect(a.surprise).toBeCloseTo(20, 9);
    expect(a.growth).toBeCloseTo(20, 9);
    expect(a.revSurprise).toBeCloseTo(10, 9);
    expect(b).toMatchObject({ reported: true, verdict: 'miss', shares: 100 });
    expect(b.growth).toBeCloseTo(-24, 9);
    // A loss: a surprise, but no growth.
    expect(c).toMatchObject({ reported: true, verdict: 'beat' });
    expect(c.surprise).toBeCloseTo(50, 9);
    expect(c.growth).toBeNaN();
    expect(d).toMatchObject({ reported: false, epsEst: 0.8 });
    expect(e.report).toBeUndefined();
  });

  it('counts the season and adds up the earnings by shares', () => {
    const st = seasonStats(lines);
    expect(st).toMatchObject({ members: 5, reported: 3, compared: 3, beat: 2, inline: 0, missed: 1, revCompared: 2, revBeat: 1, toReport: 2, dated: 1, growthCount: 3 });
    expect(st.medianSurprise).toBeCloseTo(20, 9);
    // Earnings 120 + 190 - 10 = 300 against 100 + 200 - 20 = 280 expected; a year before 100 + 250 - 30 = 320.
    expect(st.aggSurprise).toBeCloseTo((300 / 280 - 1) * 100, 9);
    expect(st.aggGrowth).toBeCloseTo((300 / 320 - 1) * 100, 9);
    expect(st.medianRevSurprise).toBeCloseTo((10 + (290 / 300 - 1) * 100) / 2, 9);
  });

  it('gives the same figures by sector, largest first', () => {
    const sectors = bySector(lines);
    expect(sectors.map((x) => [x.sector, x.stats.members, x.stats.reported])).toEqual([['Energy', 2, 0], ['Tech', 2, 2], ['Financials', 1, 1]]);
  });

  it('opens under EA for an index, and EA US is still Electronic Arts', () => {
    expect(parse('EA')).toEqual({ kind: 'route', fn: 'EARNINGSSEASON' });
    expect(parse('NDX INDEX EA')).toMatchObject({ kind: 'route', fn: 'EARNINGSSEASON', sec: { id: 'NDX Index' } });
    expect(parse('EA US')).toMatchObject({ kind: 'error', lookup: 'EA' });
    expect(parse('EA US DES')).toMatchObject({ kind: 'error', lookup: 'EA' });
  });
});

describe('Graphical Cross Sectional (GX)', () => {
  it('fits the least-squares line with its correlation, and none through fewer than three points', () => {
    const exact = fitLine([{ x: 1, y: 3 }, { x: 2, y: 5 }, { x: 4, y: 9 }]);
    expect(exact.slope).toBeCloseTo(2, 12);
    expect(exact.intercept).toBeCloseTo(1, 12);
    expect(exact.r).toBeCloseTo(1, 12);
    const noisy = fitLine([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 3 }]);
    expect(noisy.slope).toBeCloseTo(0.8, 12);
    expect(noisy.intercept).toBeCloseTo(0.3, 12);
    expect(noisy.r).toBeCloseTo(0.8, 12);
    expect(noisy.r2).toBeCloseTo(0.64, 12);
    expect(fitLine([{ x: 1, y: 1 }, { x: 2, y: 2 }]).slope).toBeNaN();
  });

  it('plots each member on the two fields, market value on a log scale, and leaves out a member without both', () => {
    const field = (k: string) => FIELDS.find((f) => f.key === k)!;
    const m = (symbol: string, cap: number, weight: number) => ({ symbol, cap, weight, last: NaN, volume: NaN, pct: NaN }) as unknown as Member;
    const ctx: GxContext = { index: 'SPX', shortPct: (x) => (x.symbol === 'AAA' ? 2.5 : NaN), daysToCover: () => NaN };
    const pts = gxPoints([m('AAA', 1e12, 0.07), m('BBB', 1e10, 0.0007), m('CCC', NaN, 0.01)], field('cap'), field('weight'), ctx);
    expect(pts.map((p) => p.member.symbol)).toEqual(['AAA', 'BBB']);
    expect(pts.map((p) => p.x)).toEqual([12, 10]);
    expect(pts[0].y).toBeCloseTo(7, 12);
    expect(pts[1].y).toBeCloseTo(0.07, 12);
    expect(field('cap').fmt(12)).toBe('1.0T');
    expect(gxPoints([m('AAA', 1e12, 0.07), m('BBB', 1e10, 0.0007)], field('si'), field('weight'), ctx).map((p) => p.member.symbol)).toEqual(['AAA']);
  });

  it('opens under GX for an index', () => {
    expect(parse('NDX INDEX GX')).toMatchObject({ kind: 'route', fn: 'CROSSSECTION', sec: { id: 'NDX Index' } });
    expect(parse('GX')).toEqual({ kind: 'route', fn: 'CROSSSECTION' });
  });
});

describe('Company Classification Browser (CCB)', () => {
  const row = (symbol: string, name: string, sector: string, industry: string, marketCap: string) => ({ symbol, name, sector, industry, marketCap, lastsale: '$10.00', country: 'United States' });
  const answer = parseNasdaqListings(JSON.stringify({ data: { rows: [
    row('NVDA', 'NVIDIA Corporation Common Stock', 'Technology', 'Semiconductors', '4500000000000'),
    row('AMD', 'Advanced Micro Devices, Inc. Common Stock', 'Technology', 'Semiconductors', '300000000000'),
    row('MSFT', 'Microsoft Corporation Common Stock', 'Technology', 'Computer Software: Prepackaged Software', '3800000000000'),
    row('JPM', 'JP Morgan Chase & Co. Common Stock', 'Finance', 'Major Banks', '800000000000'),
    row('XYZ', 'Shell Co', '', '', ''),
  ] } }));
  const list = companiesOf('data' in answer ? answer.data : undefined);

  it('groups the listed companies by sector and industry, largest market value first, the unclassified last', () => {
    expect(sectorsOf(list).map((g) => [g.name, g.count, g.cap])).toEqual([['Technology', 3, 8.6e12], ['Finance', 1, 8e11], [UNCLASSIFIED, 1, 0]]);
    expect(industriesOf(list, 'Technology').map((g) => [g.name, g.count])).toEqual([['Semiconductors', 2], ['Computer Software: Prepackaged Software', 1]]);
    expect(inIndustry(list, 'Technology', 'Semiconductors').map((l) => [l.symbol, l.name])).toEqual([['NVDA', 'NVIDIA Corporation'], ['AMD', 'Advanced Micro Devices, Inc.']]);
    expect(inIndustry(list, UNCLASSIFIED, UNCLASSIFIED).map((l) => l.symbol)).toEqual(['XYZ']);
  });

  it('opens under CCB, on a stock when one is typed', () => {
    expect(parse('CCB')).toEqual({ kind: 'route', fn: 'CLASSIFICATION' });
    expect(parse('NVDA CCB')).toMatchObject({ kind: 'route', fn: 'CLASSIFICATION', sec: { id: 'NVDA US Equity' } });
  });
});
