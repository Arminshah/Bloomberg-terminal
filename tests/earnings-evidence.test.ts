import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { EarningsEvidence, ExpectationsTable } from '../src/components/EarningsExpectations';
import { announcementCutoff, appendEarningsEvidence, consecutiveEps, earningsEvidence, earningsVersions, sameEpsDefinition, type ObservationInput } from '../src/data/live/earnings-evidence';
import { archiveConsensus, earningsAuditState, earningsEvidenceExport, keepEstimates, keptEstimates, mergeConsensus, parseYahooEarnings, verifiedEpsSurprise, type Consensus, type KeptEstimate } from '../src/data/live/consensus';
import { historyData, loadHistory } from '../src/data/live/estimate-history';
import apld from './fixtures/yahoo-apld-summary.json';

const time = (s: string) => Date.parse(s.includes('T') ? s : `${s}T00:00:00Z`);
const definition = { basis: 'adjusted' as const, ccy: 'USD', shareBasis: 'listing' as const, splitBasis: 'same series', scope: 'issuer', epsType: 'diluted' as const, unit: 'per-share' as const };
const read = () => {
  const p = parseYahooEarnings(apld, 'APLD');
  if ('error' in p) throw new Error(p.error);
  return p.data;
};
const observation = (value: number, observedAt: number, role: 'estimate' | 'actual' = 'estimate'): ObservationInput => ({
  ...definition, security: 'TEST', source: 'publisher', dataset: 'earnings', periodEnd: '2026-08-31', fiscalLabel: 'Q1 2027',
  metric: 'eps', role, value, observedAt, currency: 'USD',
});

beforeEach(() => {
  earningsEvidence.set({ by: {} });
  keptEstimates.set({ by: {}, vintages: {} });
});

describe('immutable earnings observations', () => {
  it('preserves all three pre-release estimates and the post-release revision, and selects final eligible same-day consensus', () => {
    const y = read();
    const end = y.past[0].end;
    const at = [time('2026-10-05T14:00:00Z'), time('2026-10-06T14:00:00Z'), time('2026-10-07T13:00:00Z'), time('2026-10-07T22:00:00Z')];
    const estimates = [-0.4, -0.35, -0.3, -0.01];
    at.forEach((t, i) => keepEstimates('TEST', { ...y, next: { ...y.next!, end, eps: { ...y.next!.eps, est: estimates[i] } }, following: null }, t));
    expect(keptEstimates.get().vintages?.TEST[end].map((e) => e.epsEst)).toEqual(estimates);
    const q = mergeConsensus({ yahoo: { ...y, past: [{ ...y.past[0], announcedAt: time('2026-10-07T20:05:00Z') }] }, kept: keptEstimates.get().by.TEST, keptVintages: keptEstimates.get().vintages?.TEST }).past[0];
    expect(q.eps).toMatchObject({ est: -0.3, actual: -0.01, estimateObservedAt: at[2], estimateProvenance: 'pre-announcement-snapshot' });
    expect(q.cutoffKind).toBe('source-time');
    // A stale next-quarter payload arriving after the actual is retained as a revision, never selected for the event.
    expect(q.eps.est).not.toBe(estimates[3]);
  });

  it('uses an explicit conservative NY cutoff when exact publication time is unknown, including DST', () => {
    expect(announcementCutoff(time('2026-10-07'), 'Aft-mkt')).toEqual({ at: time('2026-10-07T20:00:00Z'), kind: 'session-boundary' });
    expect(announcementCutoff(time('2026-12-07'), 'Aft-mkt')?.at).toBe(time('2026-12-07T21:00:00Z'));
    expect(announcementCutoff(time('2026-10-07'), 'Bef-mkt')).toEqual({ at: time('2026-10-07T04:00:00Z'), kind: 'date-only' });
    const y = read();
    const base: KeptEstimate = { ...y.past[0], epsEst: -0.3, epsCcy: 'USD', revEst: NaN, revCcy: 'USD', revAnalysts: 3, at: time('2026-10-07T13:00:00Z') };
    const past = [{ ...y.past[0], date: time('2026-10-07'), announcedAt: undefined, epsEst: NaN }];
    const calendar = [{ date: '2026-10-07', hour: 'amc', quarter: 1, year: 2027, epsEstimate: NaN, epsActual: NaN, revenueEstimate: NaN, revenueActual: NaN }];
    expect(mergeConsensus({ yahoo: { ...y, past }, finnhubPast: calendar, kept: { [past[0].end]: base } }).past[0].eps.est).toBe(-0.3);
    expect(mergeConsensus({ yahoo: { ...y, past }, kept: { [past[0].end]: base } }).past[0].eps.est).toBeNaN();
    const latePublication = { ...base, publishedAt: time('2026-10-07T21:00:00Z') };
    expect(mergeConsensus({ yahoo: { ...y, past }, finnhubPast: calendar, kept: { [past[0].end]: latePublication } }).past[0].eps.est).toBeNaN();
  });

  it('keeps original local actual, corrections and local knowledge history reproducible without backdating', () => {
    const first = time('2026-10-08T12:00:00Z'), corrected = time('2026-11-01T12:00:00Z');
    appendEarningsEvidence('TEST', [observation(-0.01, first, 'actual')], first);
    appendEarningsEvidence('TEST', [observation(-0.01, first, 'actual')], first + 1000);
    appendEarningsEvidence('TEST', [observation(-0.05, corrected, 'actual')], corrected);
    const all = earningsEvidence.get().by.TEST;
    expect(all).toHaveLength(2);
    expect(all[1].revisionOf).toBe(all[0].id);
    expect(earningsVersions('TEST', 'first-observed')[0].value).toBe(-0.01);
    expect(earningsVersions('TEST', 'latest')[0].value).toBe(-0.05);
    expect(earningsVersions('TEST', 'as-of', first + 1000)[0].value).toBe(-0.01);
    expect(earningsVersions('TEST', 'as-of', first - 1)).toEqual([]);
    appendEarningsEvidence('TEST', [{ ...observation(1, first), observedAt: undefined }], corrected);
    expect(earningsVersions('TEST', 'as-of', Infinity)).toHaveLength(1);
  });

  it('retains the vintage archive beyond the disposable six-quarter cache', () => {
    const y = read();
    for (let n = 0; n < 8; n++) keepEstimates('TEST', { ...y, next: { ...y.next!, end: `${2020 + n}-11-30` }, following: null }, n + 1);
    expect(Object.keys(keptEstimates.get().by.TEST)).toHaveLength(6);
    expect(Object.keys(keptEstimates.get().vintages!.TEST)).toHaveLength(8);
  });
});

describe('definition-safe EPS and evidence', () => {
  const periods = ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31'].map((end) => ({ ...definition, end, value: 1, source: 'provider', dataset: 'one comparison series' }));
  it('requires consecutive fiscal quarters with compatible currency, share and split conventions', () => {
    expect(consecutiveEps(periods)).toMatchObject({ value: 4, basis: 'adjusted', ccy: 'USD' });
    for (const change of [{ end: '2025-09-30' }, { ccy: 'EUR' }, { basis: 'gaap' as const }, { shareBasis: 'ordinary' as const }, { splitBasis: 'pre split' }, { epsType: 'basic' as const }]) {
      expect(consecutiveEps(periods.map((p, i) => i === 2 ? { ...p, ...change } : p)).value).toBeNaN();
    }
    expect(consecutiveEps(periods.map((p) => ({ ...p, shareBasis: undefined }))).value).toBeNaN();
    expect(consecutiveEps(periods, '2026-12-31').value).toBeNaN();
    expect(sameEpsDefinition(definition, { ...definition, ccy: undefined })).toBe(false);
  });

  it('shows and exports the same basis, alternatives, revisions, cutoff and stale status', () => {
    const c: Consensus = { ...mergeConsensus({ yahoo: read(), sourceMeta: { 'Yahoo Finance': { observedAt: time('2026-10-28'), lastSuccessfulAt: time('2026-10-28'), attemptedAt: time('2026-10-29'), stale: true, error: 'offline' } } }), loading: false, problems: [] };
    c.past[0].alternativeEps = { ...c.past[0].eps, estFrom: 'Other provider', actualFrom: 'Other provider', basis: 'gaap', actual: -0.82 };
    archiveConsensus('TEST', c, time('2026-10-29'));
    const html = renderToStaticMarkup(createElement(ExpectationsTable, { c }));
    expect(html).toContain('Adjusted');
    expect(html).toContain('stale');
    expect(html).toContain('GAAP');
    expect(html).not.toContain('Sources disagree');
    const details = renderToStaticMarkup(createElement(EarningsEvidence, { c, security: 'TEST' }));
    expect(details).toContain('First observed locally');
    expect(details).toContain('cannot reconstruct');
    expect(details).toContain('latest source check failed');
    const capture = earningsAuditState(c, 'TEST', time('2026-10-29'));
    expect(capture.quarters[0]).toMatchObject({ status: 'stale', actual: { basis: 'adjusted', currency: 'USD', stale: true }, estimateProvenance: 'provider-history' });
    expect(capture.quarters[0].surprisePct).toBeCloseTo(96.7, 1);
    const csv = JSON.stringify(earningsEvidenceExport(c, 'TEST'));
    expect(csv).toContain('Saved immutable version');
    expect(csv).toContain('Yahoo earnings comparison');
    expect(csv).toContain('adjusted');
    expect(csv).toContain('https://finance.yahoo.com/quote/APLD/analysis/');
    expect(verifiedEpsSurprise({ ...c.past[0].eps, basis: 'unknown' })).toBeNaN();
  });
});

describe('failed history refresh', () => {
  it('retains values and last success, records a failed attempt, and does not immediately retry', async () => {
    const first = time('2026-10-28T10:00:00Z'), attempt = first + 13 * 3600_000;
    historyData.set({ v: 0, by: { TEST: { state: 'ok', kind: 'earnings', at: first, lastSuccessfulAt: first, data: [{ source: 'Finviz', eps: [], sales: [], gaap: [] }] } } });
    vi.useFakeTimers();
    vi.setSystemTime(attempt);
    const estimateHistory = vi.fn(async () => ({ status: 503, error: 'offline' }));
    vi.stubGlobal('window', { arminDesktop: { estimateHistory } });
    try {
      await loadHistory('TEST');
      expect(historyData.get().by.TEST).toMatchObject({ state: 'error', at: first, lastSuccessfulAt: first, attemptedAt: attempt, stale: true, message: 'offline' });
      expect(historyData.get().by.TEST.data).toHaveLength(1);
      await loadHistory('TEST');
      expect(estimateHistory).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
