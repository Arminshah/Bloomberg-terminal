import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExpectationsTable } from '../src/components/EarningsExpectations';
import { matchQuarter } from '../src/data/ern';
import { canonicalQuarter, fyeFromLabels, mergeConsensus, parseYahooEarnings, quarterAt, type YahooEarnings } from '../src/data/live/consensus';
import type { PastReport } from '../src/data/live/finnhub';
import apld from './fixtures/yahoo-apld-summary.json';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const read = (answer: unknown) => {
  const result = parseYahooEarnings(answer);
  if ('error' in result) throw new Error(result.error);
  return result.data;
};
const y = read(apld);
const calendar: PastReport[] = [
  { date: '2026-10-07', hour: 'amc', quarter: 1, year: 2027, epsEstimate: -0.31, epsActual: -0.82, revenueEstimate: 136.44e6, revenueActual: 341.875e6 },
  { date: '2026-07-27', hour: 'amc', quarter: 4, year: 2026, epsEstimate: -0.22, epsActual: -0.39, revenueEstimate: 250e6, revenueActual: 258.748e6 },
  { date: '2026-04-08', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: -0.13, epsActual: -0.4, revenueEstimate: 120e6, revenueActual: 126.637e6 },
  { date: '2026-01-07', hour: 'amc', quarter: 2, year: 2026, epsEstimate: -0.12, epsActual: -0.13, revenueEstimate: 110e6, revenueActual: 126.589e6 },
];

describe('fiscal earnings accuracy', () => {
  it('keeps reported calendar data when both EPS-history sources omit a quarter, without inventing an end date', () => {
    const c = mergeConsensus({ finnhubPast: calendar });
    expect(c.past).toHaveLength(4);
    expect(c.past[0]).toMatchObject({ end: '', label: 'Q1 2027', date: day('2026-10-07'), timing: 'Aft-mkt', eps: { est: -0.31, actual: -0.82 }, rev: { est: 136.44e6, actual: 341.875e6 } });
    const partial = mergeConsensus({ finnhubPast: [{ ...calendar[0], epsEstimate: NaN, revenueEstimate: NaN }] });
    expect(partial.past[0].eps.actual).toBe(-0.82);
    expect(partial.past[0].rev.actual).toBe(341.875e6);
    const mixed = mergeConsensus({ yahoo: { ...y, past: [y.past[2]] }, finnhubPast: [...calendar].reverse() });
    expect(mixed.past.map((q) => q.label)).toEqual(['Q1 2027', 'Q4 2026', 'Q3 2026', 'Q2 2026']);
    expect(mixed.past.filter((q) => q.label === 'Q3 2026')).toHaveLength(1);
  });

  it('normalizes the two provider spellings of the same fiscal quarter', () => {
    expect(canonicalQuarter('1Q2027')).toBe('Q1 2027');
    expect(canonicalQuarter('Q1 FY2027')).toBe('Q1 2027');
    expect(canonicalQuarter('Q5 2027')).toBeUndefined();
  });

  it('merges APLD fiscal and calendar period ends once, preserving the EPS comparison basis', () => {
    const c = mergeConsensus({
      yahoo: y,
      finnhubEps: calendar.map((r, i) => ({ period: ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31'][i], quarter: r.quarter, year: r.year, actual: r.epsActual, estimate: r.epsEstimate, surprise: 0, surprisePct: 0 })),
      finnhubPast: calendar,
    });
    expect(c.past).toHaveLength(4);
    expect(c.past.map((q) => q.label)).toEqual(['Q1 2027', 'Q4 2026', 'Q3 2026', 'Q2 2026']);
    expect(c.past[0]).toMatchObject({ end: '2026-08-31', timing: 'Aft-mkt', eps: { est: -0.30305, actual: -0.01, estFrom: 'Yahoo Finance' }, alternativeEps: { est: -0.31, actual: -0.82, estFrom: 'Finnhub' } });
    expect(c.past.map((q) => new Date(q.date!).toISOString().slice(0, 10))).toEqual(calendar.map((r) => r.date));
    expect(c.past[1].rev).toMatchObject({ est: 250e6, actual: 258.748e6 });
    expect(new Set(c.past.map((q) => q.date)).size).toBe(4);
    const html = renderToStaticMarkup(createElement(ExpectationsTable, { c: { ...c, loading: false, problems: [] } }));
    expect(html).toContain('After-market');
    expect(html).toContain('Pre-market');
    expect(html).toContain('Other provider EPS comparisons');
    expect(html).not.toContain('1Q2027');
  });

  it('does not attach the newest calendar revenue to an adjacent fiscal quarter', () => {
    const c = mergeConsensus({ yahoo: y, finnhubPast: calendar.slice(0, 1) });
    expect(c.past[0].rev.est).toBe(136.44e6);
    expect(c.past[1].rev.est).toBeNaN();
    expect(c.past[1].rev.actual).toBe(258.748e6);
  });

  it('uses chart comparisons when history is missing, and its explicit calendar identity for shifted history', () => {
    const onlyChart = structuredClone(apld);
    onlyChart.quoteSummary.result[0].earningsHistory.history = [];
    expect(read(onlyChart).past).toHaveLength(4);
    const shifted = structuredClone(apld);
    shifted.quoteSummary.result[0].earningsHistory.history[3].quarter.raw = day('2026-09-30') / 1000;
    const q = read(shifted).past[0];
    expect(q).toMatchObject({ end: '2026-08-31', label: 'Q1 2027', epsActual: -0.01 });
  });

  it('does not erase an available reported EPS when its estimate is missing', () => {
    const partial: YahooEarnings = { ...y, past: [{ ...y.past[0], epsEst: NaN }] };
    expect(mergeConsensus({ yahoo: partial }).past[0].eps.actual).toBe(-0.01);
  });

  it('does not compare unknown-currency Finnhub revenue with a kept Yahoo estimate', () => {
    const partial: YahooEarnings = { ...y, past: [{ ...y.past[0], revActual: NaN }] };
    const c = mergeConsensus({ yahoo: partial, finnhubPast: [{ ...calendar[0], revenueEstimate: NaN }], kept: { '2026-08-31': { epsEst: -0.3, revEst: 300e6, revCcy: 'EUR', revAnalysts: 3, at: day('2026-10-01') } } });
    expect(c.past[0].rev.actual).toBe(341.875e6);
    expect(c.past[0].rev.est).toBeNaN();
    expect(c.past[0].rev.ccy).toBeUndefined();
  });

  it('rejects an estimate saved after publication and still fills EPS independently of calendar revenue', () => {
    const partial: YahooEarnings = { ...y, past: [{ ...y.past[0], epsEst: NaN }] };
    const kept = { epsEst: -0.3, epsCcy: 'USD', revEst: 300e6, revCcy: 'USD', revAnalysts: 3, basis: y.past[0].basis, shareBasis: y.past[0].shareBasis, splitBasis: y.past[0].splitBasis, scope: y.past[0].scope, at: day('2026-10-01') };
    const c = mergeConsensus({ yahoo: partial, finnhubPast: [{ ...calendar[0], epsEstimate: NaN }], kept: { '2026-08-31': kept } });
    expect(c.past[0].eps.est).toBe(-0.3);
    expect(c.past[0].rev.est).toBe(136.44e6);
    expect(mergeConsensus({ yahoo: partial, kept: { '2026-08-31': { ...kept, basis: 'unknown' } } }).past[0].eps.est).toBeNaN();
    const after = mergeConsensus({ yahoo: partial, kept: { '2026-08-31': { ...kept, at: day('2026-10-08') } } });
    expect(after.past[0].eps.est).toBeNaN();
    expect(after.past[0].rev.est).toBeNaN();
  });

  it('does not merge next-quarter estimates or session time from a different fiscal quarter', () => {
    const c = mergeConsensus({ yahoo: y, finnhubNext: { date: '2027-04-06', hour: 'bmo', quarter: 3, year: 2027, epsEstimate: 5, revenueEstimate: 1e9 } });
    expect(c.next?.label).toBe('Q2 2027');
    expect(c.next?.timing).toBeUndefined();
    expect(c.next?.eps.est).toBe(y.next!.eps.est);
  });

  it('does not reuse a report with a known announcement date for an unrelated calendar event', () => {
    const c = mergeConsensus({ yahoo: y });
    expect(quarterAt(c, day('2026-10-07'))?.end).toBe('2026-08-31');
    expect(quarterAt(c, day('2026-11-15'))).toBeNull();
    expect(matchQuarter(day('2026-11-15'), c.past)).toBeUndefined();
  });
});

describe('naming the coming quarters', () => {
  it("names Yahoo's quarter after next by the fiscal year its reported quarters show, when the security's is not known", () => {
    const c = mergeConsensus({ yahoo: y });
    expect(c.next).toMatchObject({ end: '2026-11-30', label: 'Q2 2027' });
    expect(c.following).toMatchObject({ end: '2027-02-28', label: 'Q3 2027' });
    // A known fiscal year still wins.
    expect(mergeConsensus({ yahoo: { ...y, next: y.next && { ...y.next, label: undefined } }, fye: 5 }).next?.label).toBe('Q2 2027');
  });

  it("reads the fiscal year's last month from a named quarter", () => {
    expect(fyeFromLabels([{ end: '2025-11-30', label: 'Q2 2026' }])).toBe(5);
    expect(fyeFromLabels([{ end: '2026-05-31', label: '4Q2026' }])).toBe(5);
    // Apple: Q1 ends in late December, its year in September.
    expect(fyeFromLabels([{ end: '2025-12-27', label: 'Q1 2026' }])).toBe(9);
    expect(fyeFromLabels([{ end: '2026-01-03', label: 'Q4 2025' }])).toBe(12);
    expect(fyeFromLabels([{ end: '2026-08-31', label: '2026-08-31' }])).toBeUndefined();
  });
});
