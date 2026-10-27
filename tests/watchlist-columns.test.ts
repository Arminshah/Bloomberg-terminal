import { describe, expect, it } from 'vitest';
import { toCsv } from '../src/core/csv';
import { averageVolume, marketCap, range52w } from '../src/data/analytics';
import { DEFAULT_WATCHLIST_COLUMNS, onPreviousDefault, PREVIOUS_DEFAULT_COLUMNS, placeInOrder, sortWatchlistRows, watchlistColumns, watchlistExport, watchlistRow, withExtendedColumns } from '../src/data/watchlist-columns';
import { extendedSessions, lastPostTrade, yahooQuotes } from '../src/data/live/yahoo';
import { engine } from '../src/data/market';
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

  it('places a moved line directly before or after its target, in either direction', () => {
    const order = ['A', 'B', 'C', 'D'];
    expect(placeInOrder(order, 'D', 'A', false)).toEqual(['D', 'A', 'B', 'C']);
    expect(placeInOrder(order, 'A', 'C', true)).toEqual(['B', 'C', 'A', 'D']);
    expect(placeInOrder(order, 'A', 'C', false)).toEqual(['B', 'A', 'C', 'D']);
    expect(placeInOrder(order, 'C', 'B', false)).toEqual(['A', 'C', 'B', 'D']);
    expect(placeInOrder(order, 'B', 'D', true)).toEqual(['A', 'C', 'D', 'B']);
    for (const [id, target] of [['B', 'B'], ['X', 'B'], ['B', 'X']]) expect(placeInOrder(order, id, target, true)).toEqual(order);
    expect(order).toEqual(['A', 'B', 'C', 'D']);
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

describe('pre-market and after-hours columns', () => {
  it('shows each session with its change against the regular close, and nothing for a session the source does not give', () => {
    const r = watchlistRow(sec.id, sec, quote(), NOW, { ytd: 1, today: [], extended: { pre: { price: 106.5, pct: 1.43, time: NOW - 3_600_000, source: 'Fixture extended' } } });
    expect(r.fields.get('ARMIN_PRE_MARKET')).toMatchObject({ value: 1.43, unit: '%', status: 'EXTENDED HOURS', asOf: NOW - 3_600_000, source: 'Fixture extended' });
    expect(r.fields.get('ARMIN_PRE_PX')).toMatchObject({ value: 106.5, unit: 'USD' });
    expect(r.fields.get('ARMIN_AFTER_HOURS')).toMatchObject({ value: null, status: 'UNAVAILABLE' });
  });

  it('are on by default and join lists saved with their own columns after %Chg, once', () => {
    expect(DEFAULT_WATCHLIST_COLUMNS.slice(2, 6)).toEqual(['CHG_PCT_1D', 'CHG_NET_1D', 'ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS']);
    expect(withExtendedColumns(['NAME', 'PX_LAST', 'CHG_PCT_1D', 'BID'])).toEqual(['NAME', 'PX_LAST', 'CHG_PCT_1D', 'ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS', 'BID']);
    expect(withExtendedColumns(['PX_LAST'])).toEqual(['PX_LAST', 'ARMIN_PRE_MARKET', 'ARMIN_AFTER_HOURS']);
    // A list that already chose one of them (or removed the other) is left as it is.
    expect(withExtendedColumns(['PX_LAST', 'ARMIN_AFTER_HOURS'])).toEqual(['PX_LAST', 'ARMIN_AFTER_HOURS']);
  });

  it("reads today's pre-market and the after-hours session after the latest close from Yahoo's quote", () => {
    const at = (iso: string) => Date.parse(iso) / 1000;
    const now = Date.parse('2026-10-19T08:31:00Z');
    yahooQuotes.set('AAPL US Equity', {
      marketState: 'PRE', regularMarketPrice: 343.46, regularMarketTime: at('2026-10-16T20:00:00Z'),
      preMarketPrice: 343.25, preMarketChangePercent: -0.0611, preMarketTime: at('2026-10-19T08:30:00Z'),
      postMarketPrice: 344.1, postMarketChangePercent: 0.1863, postMarketTime: at('2026-10-16T23:59:00Z'),
    });
    const x = extendedSessions('AAPL US Equity', now);
    expect(x.pre).toMatchObject({ price: 343.25, pct: -0.0611 });
    expect(x.post).toMatchObject({ price: 344.1, pct: 0.1863 });
    // After the regular session has traded again, the latest evening the quote has stays, frozen, until another
    // evening trades (the owner's rule of 27 October 2026); yesterday's pre-market is gone.
    yahooQuotes.set('AAPL US Equity', { ...yahooQuotes.get('AAPL US Equity'), marketState: 'REGULAR', regularMarketTime: at('2026-10-19T14:00:00Z') });
    const later = extendedSessions('AAPL US Equity', Date.parse('2026-10-20T08:00:00Z'));
    expect(later.pre).toBeUndefined();
    expect(later.post).toMatchObject({ price: 344.1, pct: 0.1863 });
    yahooQuotes.delete('AAPL US Equity');
  });

  it("takes the evening's last after-hours trade from the chart: after the close, within the four-hour session", () => {
    const close = Date.parse('2026-10-16T20:00:00Z');
    const t = (iso: string) => Date.parse(iso) / 1000;
    const bars = { t: [t('2026-10-16T19:45:00Z'), t('2026-10-16T21:00:00Z'), t('2026-10-16T23:45:00Z'), t('2026-10-19T08:00:00Z')], c: [342, 342.4, 342.62, 343.7] };
    expect(lastPostTrade(bars, close)).toEqual({ price: 342.62, time: Date.parse('2026-10-16T23:45:00Z') });
    expect(lastPostTrade({ t: bars.t, c: [342, null, null, 343.7] }, close)).toBeNull();
  });
});

describe('the pre-market column once the session is over', () => {
  it('says N/A, with the reason, rather than a blank', () => {
    const id = 'AAPL US Equity';
    const row = watchlistRow(id, engine.get(id), engine.quote(id), Date.now(), { ytd: NaN, today: [], extended: { preOver: true, post: { price: 344.1, pct: 0.19, time: Date.now() - 3_600_000, source: 'Yahoo Finance extended-hours quote' } } });
    expect(row.fields.get('ARMIN_PRE_MARKET')).toMatchObject({ value: null, status: 'OUT OF SESSION' });
    expect(row.fields.get('ARMIN_PRE_MARKET')!.note).toContain('04:00 New York time');
    expect(row.fields.get('ARMIN_PRE_PX')).toMatchObject({ value: null, status: 'OUT OF SESSION' });
    expect(row.fields.get('ARMIN_AFTER_HOURS')).toMatchObject({ value: 0.19, status: 'EXTENDED HOURS' });
  });
});

describe("the owner's watchlist layout (27 October 2026)", () => {
  it('is Security, Name, Last Price, Change (%), Change, Pre-mkt, After-hrs, Volume, Avg Vol (3M), YTD, 52-Wk %, Day Range, 52-Wk Range, Day Chart, Market Cap', () => {
    expect(watchlistColumns(undefined).map((c) => c.label)).toEqual(['Name', 'Last Price', 'Change (%)', 'Change', 'Pre-mkt', 'After-hrs', 'Volume', 'Avg Vol (3M)', 'YTD', '52-Wk %', 'Day Range', '52-Wk Range', 'Day Chart', 'Market Cap']);
    // Bid, Ask and Time stay in the column picker.
    for (const id of ['BID', 'ASK', 'ARMIN_SOURCE_TIME']) expect(watchlistColumns([id]).map((c) => c.id)).toEqual([id]);
  });

  it('moves lists that carry exactly the previous default, in any order, and leaves lists with their own columns', () => {
    expect(onPreviousDefault(PREVIOUS_DEFAULT_COLUMNS)).toBe(true);
    expect(onPreviousDefault([...PREVIOUS_DEFAULT_COLUMNS].reverse())).toBe(true);
    expect(onPreviousDefault(PREVIOUS_DEFAULT_COLUMNS.filter((c) => c !== 'BID'))).toBe(false);
    expect(onPreviousDefault([...PREVIOUS_DEFAULT_COLUMNS, 'PX_OPEN'])).toBe(false);
    expect(onPreviousDefault(undefined)).toBe(false);
  });

  it("gives the day and 52-week ranges, average volume and market value, each with its source, and nothing it lacks", () => {
    const id = 'AAPL US Equity';
    const q = engine.quote(id)!;
    const row = watchlistRow(id, engine.get(id), q, Date.now(), { ytd: NaN, today: [], avgVolume: averageVolume(id), range52: range52w(id), marketCap: marketCap(id) });
    // The day: low to high, the marker at the last price, the move from the open filled.
    expect(row.day).toMatchObject({ low: q.low, high: q.high, at: q.last, from: Math.min(q.open, q.last), to: Math.max(q.open, q.last) });
    expect(row.fields.get('ARMIN_DAY_RANGE')!.value).toBe(`${q.low.toFixed(2)} - ${q.high.toFixed(2)}`);
    // The year contains the day, and today's range is the filled part.
    const year = row.year!;
    expect(year.low).toBeLessThanOrEqual(q.low);
    expect(year.high).toBeGreaterThanOrEqual(q.high);
    expect([year.from, year.to]).toEqual([q.low, q.high]);
    expect(row.base).toBe(q.prevClose);
    expect(row.fields.get('ARMIN_AVG_VOL_3M')).toMatchObject({ value: averageVolume(id), unit: 'shares' });
    expect(row.fields.get('CUR_MKT_CAP')).toMatchObject({ value: marketCap(id), unit: 'USD' });
    // A currency trades no volume and has no market value: blank, with the reason.
    const fx = watchlistRow('EURUSD Curncy', engine.get('EURUSD Curncy'), engine.quote('EURUSD Curncy'), Date.now(), { ytd: NaN, today: [], avgVolume: averageVolume('EURUSD Curncy'), range52: range52w('EURUSD Curncy'), marketCap: marketCap('EURUSD Curncy') });
    expect(fx.fields.get('ARMIN_AVG_VOL_3M')).toMatchObject({ value: null, status: 'UNAVAILABLE' });
    expect(fx.fields.get('CUR_MKT_CAP')).toMatchObject({ value: null, status: 'UNAVAILABLE' });
  });

  it('averages the last 63 completed sessions, and takes the 52-week range from the daily history and the quote', () => {
    const id = 'MSFT US Equity';
    const s = engine.daily(id);
    const today = Math.floor(engine.now() / 86_400_000) * 86_400_000;
    const done = Array.from(s.v.subarray(0, s.length)).filter((_, i) => s.t[i] < today).slice(-63);
    expect(averageVolume(id)).toBeCloseTo(done.reduce((a, v) => a + v, 0) / 63, 6);
    const r = range52w(id)!;
    expect(r.low).toBeGreaterThan(0);
    expect(r.high).toBeGreaterThan(r.low);
    expect(r.low).toBeLessThanOrEqual(engine.quote(id)!.last);
    expect(r.high).toBeGreaterThanOrEqual(engine.quote(id)!.last);
  });
});
