import { describe, expect, it } from 'vitest';
import { companyName, parseNasdaqDividends, parseNasdaqSplits, splitRatio, weekdays } from '../src/data/live/corp-calendar';
import { inPeriod, ratioText } from '../src/functions/CACT';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import dividends from './fixtures/nasdaq-dividends-2026-10-30.json';
import none from './fixtures/nasdaq-dividends-none.json';
import splits from './fixtures/nasdaq-splits-2026-10-26.json';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

describe('Corporate Action Calendar (CACT)', () => {
  it("reads a day of Nasdaq's dividend calendar, as answered", () => {
    const r = parseNasdaqDividends(JSON.stringify(dividends));
    if ('error' in r) throw new Error(r.error);
    expect(r.data).toHaveLength(18);
    expect(r.data.find((d) => d.symbol === 'COST')).toEqual({
      symbol: 'COST', name: 'Costco Wholesale Corporation', ex: day('2026-10-30'), record: day('2026-10-30'), pay: day('2026-11-13'), announced: day('2026-10-14'), amount: 1.47, annual: 5.88,
    });
    expect(r.data.find((d) => d.symbol === 'PAA')?.name).toBe('Plains All American Pipeline, L.P.');
    // An annual dividend of zero is Nasdaq not knowing it.
    expect(r.data.find((d) => d.symbol === 'STRC')?.annual).toBeNaN();
  });

  it('reads a day without dividends as none, and anything else as a failure', () => {
    expect(parseNasdaqDividends(JSON.stringify(none))).toEqual({ data: [] });
    expect(parseNasdaqDividends('<html>')).toEqual({ error: 'Nasdaq returned a page that is not JSON.' });
    expect('error' in parseNasdaqDividends(JSON.stringify({ data: null, message: 'Service unavailable', status: { rCode: 400 } }))).toBe(true);
  });

  it("reads Nasdaq's split calendar: splits and reverse splits with their ratio", () => {
    const r = parseNasdaqSplits(JSON.stringify(splits));
    if ('error' in r) throw new Error(r.error);
    expect(r.data).toHaveLength(20);
    expect(r.data[0]).toEqual({ symbol: 'EFG', name: 'iShares MSCI EAFE Growth ETF', newShares: 3, oldShares: 1, effective: day('2026-11-05') });
    const sxtc = r.data.find((x) => x.symbol === 'SXTC')!;
    expect(ratioText(sxtc)).toBe('1-for-100');
    expect(r.data.find((x) => x.symbol === 'SOXX')).toMatchObject({ newShares: 3, oldShares: 1 });
    expect(splitRatio('1 : 1')).toBeNull();
    expect(splitRatio('two for one')).toBeNull();
  });

  it('keeps the company in a listed name', () => {
    expect(companyName('Texas Instruments Incorporated Common Stock')).toBe('Texas Instruments Incorporated');
    expect(companyName('Plains GP Holdings, L.P. Class A Units representing Limited Partner Interests')).toBe('Plains GP Holdings, L.P.');
    expect(companyName('First Merchants Corporation Depository Shares')).toBe('First Merchants Corporation Depository Shares');
  });

  it('asks for weekdays only, and keeps the events of the period for the companies asked for', () => {
    expect(weekdays('2026-10-23', '2026-10-27')).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']);
    const rows = [{ s: 'BRK.B', t: day('2026-10-28') }, { s: 'COST', t: day('2026-10-30') }, { s: 'AAPL', t: day('2026-11-20') }];
    expect(inPeriod(rows, (r) => r.t, (r) => r.s, day('2026-10-26'), day('2026-11-09'), undefined).map((r) => r.s)).toEqual(['BRK.B', 'COST']);
    expect(inPeriod(rows, (r) => r.t, (r) => r.s, day('2026-10-26'), day('2026-11-30'), new Set(['BRK.B', 'AAPL'])).map((r) => r.s)).toEqual(['BRK.B', 'AAPL']);
  });

  it('asks Nasdaq for a real day from a year back to four months ahead, and for the split calendar', () => {
    const now = day('2026-10-26');
    expect(nasdaqMain.nasdaqDividendRequest('2026-10-30', now)?.url).toBe('https://api.nasdaq.com/api/calendar/dividends?date=2026-10-30');
    expect(nasdaqMain.nasdaqDividendRequest('2026-02-30', now)).toBeNull();
    expect(nasdaqMain.nasdaqDividendRequest('2025-09-01', now)).toBeNull();
    expect(nasdaqMain.nasdaqDividendRequest('2027-04-01', now)).toBeNull();
    expect(nasdaqMain.nasdaqSplitsRequest().url).toBe('https://api.nasdaq.com/api/calendar/splits');
  });

  it('opens under CACT', () => {
    expect(parseCommand('CACT', lookupFn)).toEqual({ kind: 'route', fn: 'ACTIONCALENDAR' });
  });
});
