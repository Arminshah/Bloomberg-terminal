import { describe, expect, it } from 'vitest';
import * as finnhubMain from '../electron/finnhub.cjs';
import { verdict } from '../src/components/EarningsExpectations';
import { epsDisagreement, growth, keepEstimates, keptEstimates, mergeConsensus, parseYahooEarnings, quarterAt, surprisePct, type YahooEarnings } from '../src/data/live/consensus';
import { parseCalendarHistory, type PastReport } from '../src/data/live/finnhub';
import tsm from './fixtures/yahoo-earnings-tsm.json';

const yahoo = (() => {
  const r = parseYahooEarnings(tsm);
  if ('error' in r) throw new Error(r.error);
  return r.data;
})();
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe("the analysts' expectations against the reports", () => {
  it("reads Yahoo's last four quarters, EPS expected against reported (TSMC's third quarter of 2026)", () => {
    expect(yahoo.past).toHaveLength(4);
    const q = yahoo.past[0];
    expect(q).toMatchObject({ end: '2026-09-30', label: 'Q3 2026', epsActual: 4.6, epsCcy: 'USD' });
    expect(q.epsEst).toBeCloseTo(4.52449, 5);
    expect(new Date(q.date!).toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(yahoo.revCcy).toBe('TWD');
  });

  it("reads the coming quarters' EPS and revenue estimates with their range, analysts and year-ago figures", () => {
    expect(yahoo.next).toMatchObject({ end: '2026-12-31', yearAgoEps: 3.14, dateEstimated: true });
    expect(yahoo.next!.eps).toMatchObject({ est: 5.1641, low: 5.102, high: 5.28, analysts: 8, ccy: 'USD' });
    expect(yahoo.next!.rev).toMatchObject({ analysts: 27, ccy: 'TWD' });
    expect(yahoo.next!.rev.est).toBeCloseTo(1.705e12, -9);
    expect(yahoo.following?.end).toBe('2027-03-31');
  });

  it('says beat or miss by how much, as on an earnings card', () => {
    const q = mergeConsensus({ yahoo }).past[0];
    expect(surprisePct(q.eps)).toBeCloseTo(1.67, 1);
    expect(verdict(q.eps)).toEqual({ text: 'Beat by 1.7%', cls: 'up' });
    expect(verdict({ est: 2, actual: 1.8 })).toEqual({ text: 'Missed by 10%', cls: 'dn' });
    expect(verdict({ est: NaN, actual: 1 }).text).toBe('');
    // A negative estimate: a smaller loss is a beat.
    expect(verdict({ est: -0.5, actual: -0.4 }).text).toBe('Beat by 20%');
  });

  it("keeps a quarter's revenue estimate from before the report, in the same currency as the reported revenue", () => {
    const withRevenue: YahooEarnings = { ...yahoo, past: yahoo.past.map((p, i) => (i === 0 ? { ...p, revActual: 1.1e12 } : p)) };
    const kept = { '2026-09-30': { epsEst: 4.5, revEst: 1.0e12, revCcy: 'TWD', revAnalysts: 20, epsCcy: 'USD', at: day('2026-10-10') } };
    const q = mergeConsensus({ yahoo: withRevenue, kept }).past[0];
    expect(q.rev).toMatchObject({ est: 1.0e12, actual: 1.1e12, ccy: 'TWD', actualFrom: 'Yahoo Finance' });
    expect(q.rev.estFrom).toMatch(/read 10\/10\/2026/);
    // An estimate in another currency is not compared.
    const other = mergeConsensus({ yahoo: withRevenue, kept: { '2026-09-30': { ...kept['2026-09-30'], revCcy: 'USD' } } }).past[0];
    expect(other.rev.est).toBeNaN();
    expect(other.rev.actual).toBe(1.1e12);
  });

  it("takes revenue expected and reported from Finnhub's past reports, matched by report date", () => {
    const rows: PastReport[] = [{ date: '2026-10-16', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 4.5, epsActual: 4.6, revenueEstimate: 45.7e9, revenueActual: 46.72e9 }];
    const q = mergeConsensus({ yahoo, finnhubPast: rows }).past[0];
    expect(q.rev).toMatchObject({ est: 45.7e9, actual: 46.72e9, estFrom: 'Finnhub' });
    // Yahoo's EPS pair stays: one source for both figures.
    expect(q.eps.estFrom).toBe('Yahoo Finance');
    expect(verdict(q.rev).text).toBe('Beat by 2.2%');
  });

  it("uses Finnhub's EPS comparisons for quarters Yahoo leaves out, and its calendar for the next report", () => {
    const c = mergeConsensus({
      finnhubEps: [{ period: '2026-06-30', quarter: 2, year: 2026, actual: 1.2, estimate: 1, surprise: 0.2, surprisePct: 20 }],
      finnhubNext: { date: '2026-11-05', hour: 'amc', quarter: 3, year: 2026, epsEstimate: 1.3, revenueEstimate: 5e9 },
    });
    expect(c.past[0]).toMatchObject({ label: 'Q2 2026', eps: { est: 1, actual: 1.2, estFrom: 'Finnhub' } });
    expect(c.next).toMatchObject({ label: 'Q3 2026', eps: { est: 1.3 }, rev: { est: 5e9 } });
  });

  it('works out growth on the year and the quarter from one series at a time', () => {
    const pts = [
      { end: '2026-09-30', value: 4.6 },
      { end: '2026-06-30', value: 4.31 },
      { end: '2025-09-30', value: 2.92 },
    ];
    const g = growth('2026-09-30', [{ from: 'Yahoo Finance', points: pts.slice(0, 2) }, { from: 'statements', points: pts }]);
    expect(g.qoq).toBeCloseTo((4.6 / 4.31 - 1) * 100, 6);
    expect(g.qoqFrom).toBe('Yahoo Finance');
    expect(g.yoy).toBeCloseTo((4.6 / 2.92 - 1) * 100, 6);
    expect(g.yoyFrom).toBe('statements');
    // No growth to or from a loss.
    expect(growth('2026-09-30', [{ from: 'x', points: [{ end: '2026-09-30', value: 1 }, { end: '2026-06-30', value: -1 }] }]).qoq).toBeNaN();
    expect(growth('2026-09-30', [{ from: 'x', points: [{ end: '2026-09-30', value: -0.01 }, { end: '2026-06-30', value: 0.04 }] }]).qoq).toBeNaN();
  });

  it("finds the quarter a calendar row's report belongs to", () => {
    const c = mergeConsensus({ yahoo });
    expect(quarterAt(c, day('2026-10-15'))?.end).toBe('2026-09-30');
    expect(quarterAt(c, day('2027-01-14'))?.end).toBe('2026-12-31');
  });

  it('keeps the latest estimates of the coming quarters, a few per security', () => {
    keepEstimates('TSM US Equity', yahoo, day('2026-10-19'));
    const k = keptEstimates.get().by['TSM US Equity'];
    expect(Object.keys(k).sort()).toEqual(['2026-12-31', '2027-03-31']);
    expect(k['2026-12-31']).toMatchObject({ epsEst: 5.1641, revCcy: 'TWD', revAnalysts: 27 });
  });

  it("asks Finnhub for the past 13 months of reports and reads the reported ones", () => {
    const req = finnhubMain.finnhubRequest('history', 'TSM', day('2026-10-19'));
    expect(req?.url).toBe('https://finnhub.io/api/v1/calendar/earnings?from=2025-09-14&to=2026-10-19&symbol=TSM');
    const text = JSON.stringify({ earningsCalendar: [
      { date: '2026-07-16', hour: 'bmo', quarter: 2, year: 2026, epsEstimate: 3.9, epsActual: 4.31, revenueEstimate: 4e10, revenueActual: 4.2e10, symbol: 'TSM' },
      { date: '2026-10-15', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 4.5, epsActual: 4.6, revenueEstimate: 4.57e10, revenueActual: 4.67e10, symbol: 'TSM' },
      { date: '2026-11-01', hour: '', quarter: 4, year: 2026, epsEstimate: 5, epsActual: null, revenueEstimate: 5e10, revenueActual: null, symbol: 'TSM' },
    ] });
    const r = parseCalendarHistory(text);
    expect('data' in r && r.data.map((x) => x.date)).toEqual(['2026-10-15', '2026-07-16']);
  });
});

describe('two sources that call a quarter a beat and a miss', () => {
  // Applied Digital's quarter to 31 August 2026: Yahoo's adjusted -0.01 against -0.30 expected, Finnhub's -0.82
  // (the 10-Q's diluted EPS) against -0.31.
  const NONE = { est: NaN, actual: NaN, low: NaN, high: NaN, analysts: NaN };
  const yahoo = { ...NONE, est: -0.303, actual: -0.01, estFrom: 'Yahoo Finance', actualFrom: 'Yahoo Finance' };
  const finnhub = { ...NONE, est: -0.306, actual: -0.82, estFrom: 'Finnhub', actualFrom: 'Finnhub' };

  it('says they disagree, with both comparisons', () => {
    const text = epsDisagreement({ eps: yahoo, alternativeEps: finnhub })!;
    expect(text).toContain('Yahoo Finance: -0.01 against -0.303 expected (beat by 97%)');
    expect(text).toContain('Finnhub: -0.82 against -0.306 expected (miss by 168%)');
  });

  it('says nothing when they agree on the direction, or only one compares', () => {
    expect(epsDisagreement({ eps: yahoo, alternativeEps: { ...finnhub, actual: -0.2 } })).toBeUndefined();
    expect(epsDisagreement({ eps: yahoo })).toBeUndefined();
    // Within 2% either way is in line, not a disagreement.
    expect(epsDisagreement({ eps: { ...yahoo, actual: -0.305 }, alternativeEps: { ...finnhub, actual: -0.30 } })).toBeUndefined();
  });
});
