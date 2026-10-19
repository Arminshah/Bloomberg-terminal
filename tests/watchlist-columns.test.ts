import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/core/csv';
import { DEFAULT_WATCHLIST_COLUMNS, sortWatchlistRows, watchlistColumns, watchlistExport, watchlistRow } from '../src/data/watchlist-columns';
import type { Quote, SecurityDef } from '../src/data/types';

const NOW = Date.parse('2026-10-16T15:00:00Z');
const sec: SecurityDef = { id: 'TEST US Equity', ticker: 'TEST US', yk: 'Equity', name: 'Test, Inc.', cls: 'equity', ccy: 'USD', country: 'US', region: 'Americas', exch: 'NASDAQ', px: 10, vol: 0.2, dec: 2, quote: 'price' };
const quote = (id = sec.id, patch: Partial<Quote> = {}): Quote => ({ id, last: 105, bid: 104, ask: 106, open: 100, high: 107, low: 99, prevClose: 100, volume: 0, chg: 5, pct: 5, time: NOW - 5_000, fetched: NOW, tick: 1, src: 'LIVE', provider: 'Fixture feed', chgCheck: 'verified', ...patch });
const row = (id = sec.id, patch: Partial<Quote> = {}) => watchlistRow(id, { ...sec, id }, quote(id, patch), NOW, { ytd: 12.345, today: [100, NaN, 101], intradayTime: NOW - 60_000 });

describe('custom watchlist fields', () => {
  it('keeps older lists usable and accepts only known, unique fields in saved order', () => {
    for (const saved of [undefined, null, 'PX_LAST', [], ['unknown', 1]]) expect(watchlistColumns(saved).map((c) => c.id)).toEqual(DEFAULT_WATCHLIST_COLUMNS);
    expect(watchlistColumns(['ARMIN_PROVIDER', 'PX_LAST', 'unknown', 'ARMIN_PROVIDER']).map((c) => c.id)).toEqual(['ARMIN_PROVIDER', 'PX_LAST']);
  });

  it('sorts actual numbers, keeps missing values last in either direction, and retains manual order on ties', () => {
    const rows = [row('A', { last: 100 }), row('B', { last: NaN }), row('C', { last: 9 }), row('D', { last: 100 })];
    const columns = watchlistColumns(['PX_LAST']);
    expect(sortWatchlistRows(rows, { column: 'PX_LAST', direction: 'asc' }, columns).map((r) => r.id)).toEqual(['C', 'A', 'D', 'B']);
    expect(sortWatchlistRows(rows, { column: 'PX_LAST', direction: 'desc' }, columns).map((r) => r.id)).toEqual(['A', 'D', 'C', 'B']);
    expect(sortWatchlistRows(rows, { column: 'BID', direction: 'desc' }, columns)).toEqual(rows);
    expect(rows.map((r) => r.id)).toEqual(['A', 'B', 'C', 'D']);
    const changes = [row('unverified', { pct: 999, chgCheck: 'unverified' }), row('verified', { pct: 1 })];
    expect(sortWatchlistRows(changes, { column: 'CHG_PCT_1D', direction: 'desc' }, watchlistColumns(['CHG_PCT_1D'])).map((r) => r.id)).toEqual(['verified', 'unverified']);
  });

  it('exports selected columns and row order, preserving zeros and independent bid/ask timestamp limits', () => {
    const columns = watchlistColumns(['ARMIN_PROVIDER', 'PX_VOLUME', 'BID']);
    const exported = watchlistExport([row('B'), row('A', { bid: NaN })], columns, NOW);
    expect(exported[0]).toEqual(['Security', 'Provider', 'Volume', 'Bid']);
    expect(exported[1]).toEqual(['B', 'Fixture feed', 0, 104]);
    expect(exported[2]).toEqual(['A', 'Fixture feed', 0, null]);
    const bid = exported.find((r) => r[0] === 'B' && r[1] === 'BID')!;
    expect(bid.slice(2, 6)).toEqual(['USD', 'Fixture feed', 'TIMESTAMP UNAVAILABLE', null]);
    expect(toCsv(exported)).not.toContain('PX_LAST');
  });

  it('does not substitute quote prices for absent securities or market fields', () => {
    const missing = watchlistRow('OLD', undefined, undefined, NOW, { ytd: NaN, today: [] });
    const noQuote = watchlistRow(sec.id, sec, undefined, NOW, { ytd: 123, today: [] });
    expect(noQuote.fields.get('NAME')?.value).toBe(sec.name);
    expect(noQuote.fields.get('PX_LAST')?.value).toBeNull();
    expect(noQuote.fields.get('ARMIN_YTD')?.value).toBeNull();
    expect(watchlistExport([missing], watchlistColumns(['PX_LAST', 'NAME']), NOW)[1]).toEqual(['OLD', null, null]);
    expect(watchlistExport([missing], watchlistColumns(['PX_LAST']), NOW).flat()).toContain('UNAVAILABLE');
  });

  it('keeps yield changes in explicit raw units and separates history observations from quote timestamps', () => {
    const rate = { ...sec, quote: 'yield' as const, cls: 'rate' as const };
    const r = watchlistRow(sec.id, rate, quote(sec.id, { chg: 0.02, src: 'SIM' }), NOW, { ytd: 0.1, today: [4.1, 4.2], intradayTime: NOW - 60_000 });
    expect(r.fields.get('CHG_NET_1D')).toMatchObject({ value: 0.02, unit: 'percentage points' });
    expect(r.fields.get('CHG_PCT_1D')?.value).toBeNull();
    expect(r.fields.get('ARMIN_YTD')).toMatchObject({ value: 0.1, unit: 'percentage points', asOf: NOW - 5_000, status: 'DEMO DATA' });
    expect(r.fields.get('ARMIN_TODAY')).toMatchObject({ value: '4.1;4.2', asOf: NOW - 60_000, status: 'DEMO DATA' });
    expect(row().today).toEqual([100, 101]);
  });
});
