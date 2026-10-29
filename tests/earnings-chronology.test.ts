import { describe, expect, it } from 'vitest';
import { mergeConsensus, parseYahooEarnings, type YahooEarnings } from '../src/data/live/consensus';

const at = (s: string) => Date.parse(s.includes('T') ? s : `${s}T00:00:00Z`);
const now = at('2026-10-29T12:00:00Z');
const past = { end: '2026-09-30', label: 'Q3 2026', date: at('2026-10-20'), epsEst: 1, epsActual: 1.2, epsCcy: 'USD', revActual: 12e6 };
const yahoo = (rows: YahooEarnings['past']): YahooEarnings => ({ past: rows, next: null, following: null, revCcy: 'USD' });

describe('reported earnings chronology', () => {
  it('quarantines future fiscal periods before they can change the next-quarter anchors', () => {
    const c = mergeConsensus({
      now, yahoo: yahoo([{ ...past, end: '2027-03-31', label: 'Q1 2027', date: undefined }, past]),
      av: { reports: [], estimates: [{ end: '2026-12-31', period: 'quarter', epsEst: 1.3, epsLow: 1, epsHigh: 2, epsAnalysts: 4, revEst: NaN, revLow: NaN, revHigh: NaN, revAnalysts: NaN }] },
    });
    expect(c.past.map((q) => q.end)).toEqual(['2026-09-30']);
    expect(c.next).toMatchObject({ end: '2026-12-31', eps: { est: 1.3 } });
    expect(c.chronologyProblems).toEqual([expect.stringContaining('fiscal period 2027-03-31 has not ended')]);
  });

  it('withholds an actual until its exact stated announcement, including later on the same day', () => {
    const announcedAt = at('2026-10-29T20:05:00Z');
    const input = yahoo([{ ...past, date: at('2026-10-29'), announcedAt }]);
    const before = mergeConsensus({ now, yahoo: input });
    expect(before.past).toEqual([]);
    expect(before.chronologyProblems?.[0]).toContain('stated announcement');
    expect(mergeConsensus({ now: announcedAt, yahoo: input }).past[0].eps.actual).toBe(1.2);
  });

  it('rejects future date-only and normalized-period reports from Finnhub and Alpha Vantage', () => {
    const c = mergeConsensus({ now, fye: 12,
      finnhubEps: [{ period: '2026-12-31', quarter: 4, year: 2026, estimate: 1, actual: 8, surprise: 7, surprisePct: 700 }],
      finnhubPast: [{ date: '2026-11-01', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 1, epsActual: 7, revenueEstimate: 1e6, revenueActual: 7e6 }],
      av: { reports: [{ end: '2026-09-30', date: '2026-11-01', timing: 'Bef-mkt', epsEst: 1, epsActual: 6 }], estimates: [] },
    });
    expect(c.past).toEqual([]);
    expect(c.chronologyProblems).toEqual(expect.arrayContaining([expect.stringContaining('Finnhub'), expect.stringContaining('Alpha Vantage')]));
  });

  it('does not let one future-dated alternative overwrite a healthy comparison or supply its date', () => {
    const healthy = { ...past, date: at('2026-10-26') };
    const c = mergeConsensus({ now, yahoo: yahoo([healthy]),
      fmpReports: [{ symbol: 'TEST', date: '2026-11-01', timing: '--', epsEst: 1, epsActual: 8, revEst: 1e6, revActual: 8e6 }],
      history: [{ source: 'Zacks', eps: [{ period: '2026-09', date: '2026-11-01', est: 1, actual: 9 }], sales: [], gaap: [] }],
    });
    expect(c.past).toHaveLength(1);
    expect(c.past[0]).toMatchObject({ date: healthy.date, eps: { actual: 1.2, actualFrom: 'Yahoo Finance' } });
    expect(c.past[0].epsComparisons).toBeUndefined();
    expect(c.chronologyProblems).toEqual(expect.arrayContaining([expect.stringContaining('FMP'), expect.stringContaining('Zacks')]));
  });

  it('retains an otherwise valid historical actual when publication timing is unknown', () => {
    const c = mergeConsensus({ now, yahoo: yahoo([{ ...past, date: undefined }]),
      history: [{ source: 'Zacks', eps: [{ period: '2026-09', date: '2026-11-01', est: 1, actual: NaN }], sales: [], gaap: [] }],
    });
    expect(c.past[0].eps.actual).toBe(1.2);
    expect(c.past[0].date).toBeUndefined();
    expect(c.chronologyProblems?.[0]).toContain('Zacks');
  });

  it('does not let a future Yahoo history record discard current upcoming estimates during parsing', () => {
    const parsed = parseYahooEarnings({ quoteSummary: { result: [{
      earningsHistory: { history: [{ quarter: { raw: at('2027-03-31') / 1000 }, epsEstimate: 1, epsActual: 9 }] },
      earningsTrend: { trend: [
        { period: '0q', endDate: '2026-12-31', earningsEstimate: { avg: 1.3 } },
        { period: '+1q', endDate: '2027-03-31', earningsEstimate: { avg: 1.4 } },
      ] },
    }] } }, 'TEST', now);
    if ('error' in parsed) throw new Error(parsed.error);
    const c = mergeConsensus({ now, yahoo: parsed.data });
    expect(c.past).toEqual([]);
    expect(c.next).toMatchObject({ end: '2026-12-31', eps: { est: 1.3 } });
    expect(c.following).toMatchObject({ end: '2027-03-31', eps: { est: 1.4 } });
  });
});
