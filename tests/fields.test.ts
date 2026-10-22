import { describe, expect, it } from 'vitest';
import { fieldTime, fieldsCsv, filterFields, securityFields } from '../src/data/fields';
import type { Quote, SecurityDef } from '../src/data/types';

const NOW = Date.parse('2026-10-16T15:00:00Z');
const SEC: SecurityDef = { id: 'TEST US Equity', ticker: 'TEST US', yk: 'Equity', name: 'Test, Inc.', cls: 'equity', ccy: 'USD', country: 'US', region: 'Americas', exch: 'NASDAQ', px: 10, vol: 0.2, dec: 2, quote: 'price' };
const quote = (extra: Partial<Quote> = {}): Quote => ({ id: SEC.id, last: 105, bid: 104, ask: 106, open: 100, high: 107, low: 99, prevClose: 100, volume: 1234, chg: 5, pct: 5, time: NOW - 5_000, fetched: NOW, tick: 1, src: 'LIVE', provider: 'Fixture feed', chgCheck: 'verified', prevCloseDay: Date.parse('2026-10-15') / 86_400_000, ...extra });
const inspect = (q: Quote | undefined = quote(), sec = SEC) => new Map(securityFields(sec, q, NOW).map((f) => [f.id, f]));

describe('field inspection and provenance', () => {
  it('calculates a coherent bid/ask pair without borrowing the trade timestamp or claiming NBBO', () => {
    const f = inspect();
    expect(f.get('ARMIN_BID_ASK_SPREAD')).toMatchObject({ value: 2, unit: 'USD', asOf: null, status: 'TIMESTAMP UNAVAILABLE' });
    expect(f.get('ARMIN_BID_ASK_MID')?.value).toBe(105);
    expect(f.get('ARMIN_SPREAD_PCT')?.value).toBeCloseTo(2 / 105 * 100, 12);
    expect(f.get('PX_LAST')).toMatchObject({ value: 105, asOf: NOW - 5_000, status: 'REAL-TIME', source: 'Fixture feed' });
    expect(f.get('BID')?.note).toContain('does not verify');
    expect(f.get('ARMIN_RECEIVED_AT')).toMatchObject({ value: new Date(NOW).toISOString(), asOf: NOW });
  });

  it('refuses crossed or missing bid/ask calculations and retains a legitimate zero locked spread', () => {
    for (const patch of [{ bid: NaN }, { ask: NaN }, { bid: 0 }, { ask: 100, bid: 101 }]) {
      const f = inspect(quote(patch));
      expect(f.get('ARMIN_BID_ASK_SPREAD')).toMatchObject({ value: null, status: 'UNAVAILABLE', asOf: null });
      expect(f.get('ARMIN_BID_ASK_MID')?.value).toBeNull();
    }
    expect(inspect(quote({ bid: 100, ask: 100 })).get('ARMIN_BID_ASK_SPREAD')?.value).toBe(0);
  });

  it('never turns absent, wrong-security, or nonfinite source values into zero or live data', () => {
    for (const q of [undefined, quote({ src: 'NONE', last: 0 }), quote({ id: 'WRONG' }), quote({ last: NaN })]) {
      const f = new Map(securityFields(SEC, q, NOW).map((r) => [r.id, r]));
      expect(f.get('PX_LAST')).toMatchObject({ value: null, status: 'UNAVAILABLE', asOf: null });
      expect(f.get('NAME')).toMatchObject({ value: SEC.name, status: 'REFERENCE', asOf: null });
    }
    expect(inspect(quote({ volume: 0 })).get('PX_VOLUME')?.value).toBe(0);
    expect(inspect(quote({ src: 'SIM' })).get('PX_LAST')?.status).toBe('DEMO DATA');
  });

  it('separates previous-close dates, unverified changes, reference yields, and minor currency units', () => {
    const verified = inspect().get('PX_PREV_CLOSE')!;
    expect(fieldTime(verified)).toBe('2026-10-15');
    expect(verified.status).toBe('VERIFIED CLOSE');
    const unverified = inspect(quote({ chgCheck: 'unverified', prevCloseDay: undefined }));
    expect(unverified.get('CHG_NET_1D')?.status).toBe('REAL-TIME · UNVERIFIED BASE');
    expect(inspect(quote({ chgCheck: 'unverified', src: 'STALE' })).get('CHG_NET_1D')?.status).toBe('STALE · UNVERIFIED BASE');
    expect(unverified.get('PX_PREV_CLOSE')?.asOf).toBeNull();
    const rate = inspect(quote({ src: 'EOD', provider: 'US Treasury', time: NOW - 86_400_000 }), { ...SEC, cls: 'rate', quote: 'yield' });
    expect(rate.get('PX_LAST')).toMatchObject({ unit: 'yield %', status: 'REFERENCE', dateOnly: true });
    expect(rate.get('CHG_NET_1D')?.unit).toBe('percentage points');
    expect(inspect(quote(), { ...SEC, ccy: 'GBp' }).get('PX_LAST')?.unit).toBe('GBp');
  });

  it('preserves stale IEX provenance and labels its quote event time as unavailable', () => {
    const f = inspect(quote({ provider: 'Alpaca · IEX only', time: NOW - 61_000, fetched: NOW }));
    expect(f.get('PX_LAST')?.status).toBe('STALE');
    expect(f.get('BID')).toMatchObject({ status: 'TIMESTAMP UNAVAILABLE', asOf: null });
    expect(inspect(quote({ src: 'STALE' })).get('BID')).toMatchObject({ status: 'SOURCE STALE · TIMESTAMP UNAVAILABLE', asOf: null });
    expect(f.get('ARMIN_RECEIVED_AT')?.asOf).toBe(NOW);
  });

  it('filters definitions by all search terms and exports only the selected rows with raw values and provenance', () => {
    const all = securityFields(SEC, quote({ ask: NaN }), NOW);
    expect(new Set(all.map((f) => f.id)).size).toBe(all.length);
    expect(filterFields(all, 'previous close', 'Market').map((f) => f.id)).toContain('PX_PREV_CLOSE');
    expect(filterFields(all, 'bid', 'Calculated', true)).toEqual([]);
    const fields = filterFields(all, 'PX_LAST');
    const csv = fieldsCsv(SEC.id, fields, NOW);
    expect(csv).toContain('PX_LAST,Last price / yield,Market,105,USD,Fixture feed,REAL-TIME,2026-10-16T14:59:55.000Z');
    expect(csv).not.toContain('PX_VOLUME,');
    expect(csv).toContain('no other vendor’s field/API compatibility');
    expect(fieldTime(inspect(quote({ time: NaN })).get('PX_LAST')!)).toBe('');
    expect(inspect(quote({ prevCloseDay: NaN })).get('ARMIN_PREV_CLOSE_DATE')?.value).toBeNull();
  });
});
