import { describe, expect, it } from 'vitest';
import { closeOnOrBefore, CURVE_COMMODITIES, sparkCloses } from '../src/data/live/futures-curve';
import { curveRows, curveShape, thin } from '../src/functions/CCRV';
import { contractSymbols } from '../src/data/live/yquotes';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import spark from './fixtures/yahoo-spark-cl-2026-10.json';

const now = Date.UTC(2026, 9, 26, 12);

describe('Commodity Forward Curves (CCRV)', () => {
  it("reads each contract's daily closes from Yahoo's spark answer, and the close on or before a day", () => {
    const dec = sparkCloses(spark['CLZ26.NYM']);
    expect(dec.c).toHaveLength(21);
    expect(dec.c.at(-1)).toBe(100.9);
    // A week before 26 October: the 19 October close.
    expect(closeOnOrBefore(dec, now - 7 * 86_400_000)).toBe(98.54);
    // A month before: this one-month answer starts on 28 September, so there is none (the app asks for three months).
    expect(closeOnOrBefore(dec, now - 30 * 86_400_000)).toBeNaN();
    expect(closeOnOrBefore(null, now)).toBeNaN();
  });

  it('keeps the months still trading with a price, by expiry, each with its own past closes', () => {
    const contracts = contractSymbols('CL', 'NYM', 'All months', 4, new Date(Date.UTC(2026, 10, 1)));
    expect(contracts.map((c) => c.symbol)).toEqual(['CLX26.NYM', 'CLZ26.NYM', 'CLF27.NYM', 'CLG27.NYM']);
    // Quotes as Yahoo's quote answer names its fields (made-up figures): November has expired, February has no price.
    const quotes: Record<string, object> = {
      'CLX26.NYM': { regularMarketPrice: 99, expireIsoDate: '2026-10-20T00:00:00Z' },
      'CLZ26.NYM': { regularMarketPrice: 100.9, regularMarketChange: -2.37, expireIsoDate: '2026-11-19T00:00:00Z', openInterest: 250000 },
      'CLF27.NYM': { regularMarketPrice: 98.77, expireIsoDate: '2026-12-17T00:00:00Z' },
      'CLG27.NYM': { expireIsoDate: '2027-01-20T00:00:00Z' },
    };
    const history = { 'CLZ26.NYM': sparkCloses(spark['CLZ26.NYM']), 'CLF27.NYM': sparkCloses(spark['CLF27.NYM']) };
    const rows = curveRows('CL', contracts, (s) => quotes[s], history, now);
    expect(rows.map((r) => r.label)).toEqual(['CL Dec 26', 'CL Jan 27']);
    expect(rows[0]).toMatchObject({ last: 100.9, change: -2.37, weekAgo: 98.54, openInterest: 250000 });
    expect(rows[1].weekAgo).toBe(spark['CLF27.NYM'].close[15]);
    expect(curveShape(rows)).toBe('Backwardation');
    expect(curveShape([{ last: 1 }, { last: 2 }])).toBe('Contango');
    expect(curveShape([{ last: 1 }])).toBe('');
    // A month with little open interest is marked; one without a figure is not.
    expect(thin({ openInterest: 4 })).toBe(true);
    expect(thin({ openInterest: 250000 })).toBe(false);
    expect(thin({ openInterest: NaN })).toBe(false);
  });

  it('offers the commodities with contract months, and opens under CCRV', () => {
    expect(CURVE_COMMODITIES.map((c) => c.ticker)).toContain('CL1');
    expect(CURVE_COMMODITIES.some((c) => c.cmd?.group === 'Rates')).toBe(false);
    expect(parseCommand('CL1 COMDTY CCRV', lookupFn)).toMatchObject({ kind: 'route', fn: 'FUTURESCURVE', sec: { id: 'CL1 Comdty' } });
    expect(parseCommand('CCRV', lookupFn)).toEqual({ kind: 'route', fn: 'FUTURESCURVE' });
  });
});
