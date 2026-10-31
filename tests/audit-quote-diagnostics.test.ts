/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { quoteProbeDays, quoteProbe, withQuoteDiagnostics } = require('../scripts/live/audit/references.cjs');
const { validateFinancials } = require('../scripts/live/audit/domains.cjs');

// Structural publisher-shaped inputs test the audit pipeline, not actual live prices.
const bars = [
  { date: '2026-10-27T00:00:00Z', open: 95, high: 100, low: 90, close: 98, volume: 100 },
  { date: '2026-10-28T00:00:00Z', open: 100, high: 110, low: 90, close: 105, volume: 1000 },
  { date: '2026-10-29T00:00:00Z', open: 105, high: 112, low: 100, close: 110, volume: 1200 },
];

describe('failed quote comparison diagnostics', () => {
  it('retains the same date and previous available date, including the earlier handover session', () => {
    expect(quoteProbeDays(bars, '2026-10-29')).toEqual(['2026-10-28', '2026-10-29']);
    expect(quoteProbeDays(bars, '')).toEqual([]);
    expect(quoteProbeDays(bars, '2026-02-30')).toEqual([]);
  });
  it('normalizes only the requested dated observations from each provider', () => {
    const days = quoteProbeDays(bars, '2026-10-29');
    const expected = bars.slice(1).map(({ date, ...row }) => ({ day: date.slice(0, 10), ...row }));
    expect(quoteProbe('Tiingo', bars, days)).toMatchObject({ status: 'available', observations: expected });
    const massive = { results: bars.map((row) => ({ t: Date.parse(row.date), o: row.open, h: row.high, l: row.low, c: row.close, v: row.volume, ignored: 'not copied' })) };
    expect(quoteProbe('Massive', massive, days)).toMatchObject({ status: 'available', observations: expected });
    const nasdaq = { data: { tradesTable: { rows: [{ date: '10/29/2026', open: '$105.00', high: '$112.00', low: '$100.00', close: '$110.00', volume: '1,200', token: 'not copied' }] } } };
    expect(quoteProbe('Nasdaq', nasdaq, days)).toEqual({ status: 'partial', observations: [expected[1]], missingDates: ['2026-10-28'] });
  });
  it('does not substitute another day or declare malformed observations complete', () => {
    expect(quoteProbe('Tiingo', bars, ['2026-10-30'])).toEqual({ status: 'no-data', observations: [], missingDates: ['2026-10-30'] });
    expect(quoteProbe('Tiingo', [bars[1], bars[1]], ['2026-10-28']).status).toBe('malformed');
    expect(quoteProbe('Tiingo', [{ ...bars[1], volume: 'N/A' }], ['2026-10-28']).status).toBe('partial');
    expect(quoteProbe('Tiingo', [{ ...bars[1], high: 99 }], ['2026-10-28']).status).toBe('partial');
    expect(quoteProbe('Massive', { results: 'invalid' }, ['2026-10-28']).status).toBe('malformed');
  });
  it('rejects a declared different security without inventing missing response identity', () => {
    const row = { t: Date.parse('2026-10-28'), o: 100, h: 110, l: 90, c: 105, v: 1000 };
    expect(quoteProbe('Massive', { ticker: 'KO', results: [row] }, ['2026-10-28'], 'WMT')).toMatchObject({ status: 'malformed', observations: [] });
    expect(quoteProbe('Massive', { ticker: 'WMT', results: [row] }, ['2026-10-28'], 'WMT')).toMatchObject({ status: 'available', identity: 'response-confirmed', ticker: 'WMT' });
    expect(quoteProbe('Massive', { results: [row] }, ['2026-10-28'], 'WMT')).toMatchObject({ status: 'available', identity: 'request-only', ticker: 'WMT' });
    expect(quoteProbe('Nasdaq', { data: { symbol: 'KO', tradesTable: { rows: [] } } }, ['2026-10-28'], 'WMT')).toMatchObject({ status: 'malformed', observations: [] });
  });
  it('retains the original failure, comparison values and tolerance when another source agrees', () => {
    const failed = { status: 'FAIL', app: 100, ref: 102, diff: -2, allowed: 1, field: 'Open', refName: 'Original reference', detail: 'Original evidence' };
    const diagnostics = { days: ['2026-10-28'], sources: [{ source: 'Massive', observations: [{ day: '2026-10-28', open: 100 }] }] };
    expect(withQuoteDiagnostics(failed, diagnostics)).toMatchObject({ ...failed, detail: expect.stringContaining('Original evidence'), diagnostics });
    expect(withQuoteDiagnostics(failed, diagnostics).detail).toContain('diagnostic only');
    expect(failed).not.toHaveProperty('diagnostics');
  });
});

describe('financial audit source-basis capture', () => {
  const now = Date.parse('2026-10-30T08:00:00Z');
  const snapshot = { schema: 1, domain: 'financials', capturedAt: now, periods: [{ label: '2024 Y', niTotal: 7091, rev: 97690, niTotalBasisConflict: true, parentIncomeMargin: null }] };
  it('retains unresolved financial source bases even when a dollar figure is corroborated', () => {
    expect(validateFinancials(snapshot, 'TSLA', now)).toMatchObject([{ status: 'INCOMPLETE', area: 'financials', field: 'parent income basis 2024 Y' }]);
    expect(validateFinancials({ ...snapshot, periods: [{ ...snapshot.periods[0], niTotalBasisConflict: false }] }, 'TSLA', now)).toEqual([]);
  });
  it('fails a numerical margin across an unresolved source basis and rejects absent captures', () => {
    expect(validateFinancials({ ...snapshot, periods: [{ ...snapshot.periods[0], parentIncomeMargin: 7.3 }] }, 'TSLA', now)).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'FAIL', field: 'parent income margin 2024 Y' })]));
    expect(validateFinancials(null, 'TSLA', now)[0].status).toBe('BLOCKED');
  });
  it('reports the exact conflicting line and preserves raw observations without inventing a revenue discrepancy', () => {
    const differences = [{ field: 'NetIncomeCommonStockholders', currency: 'USD', unit: 'raw monetary units', observations: [
      { source: 'Yahoo Finance statement time series', value: 25e6, end: Date.parse('2025-12-31') },
      { source: 'SEC EDGAR 10-K', value: 22e6, end: Date.parse('2025-12-31'), start: '2025-01-01', filed: '2026-02-15', concept: 'us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic', sourceUrl: 'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json' },
    ] }];
    const result = validateFinancials({ ...snapshot, periods: [{ ...snapshot.periods[0], niTotalBasisDetails: differences }] }, 'TSLA', now);
    expect(result).toMatchObject([{ status: 'INCOMPLETE', basisDifferences: differences }]);
    expect(result[0].detail).toContain('NetIncomeCommonStockholders: Yahoo Finance statement time series=25000000 at 2025-12-31 vs SEC EDGAR 10-K=22000000');
    expect(result[0].detail).not.toContain('revenue basis have not been reconciled');
  });
});
