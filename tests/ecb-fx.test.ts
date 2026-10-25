import { describe, expect, it } from 'vitest';
import { ecbCross, ecbRateOn, parseEcbRates } from '../src/data/live/ecb-fx';
import { adjustPosition } from '../src/terminal/portfolio';
import exr from './fixtures/ecb-exr-2026-06.csv?raw';

// The ECB's reference rates as published for 25 to 30 June 2026 (dataset EXR, CSV), for CHF, GBP, JPY and USD.
describe("the ECB's reference rates", () => {
  const rates = parseEcbRates(exr)!;

  it('reads each day and currency against the euro', () => {
    expect([...rates.keys()]).toEqual(['2026-06-25', '2026-06-26', '2026-06-29', '2026-06-30']);
    expect(rates.get('2026-06-30')!.get('USD')).toBe(1.1394);
    expect(rates.get('2026-06-30')!.get('GBP')).toBe(0.86178);
    expect(parseEcbRates('')).toBeNull();
    expect(parseEcbRates('a,b\n1,2')).toBeNull();
  });

  it('crosses two currencies through the euro on a date', () => {
    // US dollars per pound on 30 June: 1.1394 / 0.86178.
    expect(ecbCross(rates, '2026-06-30', 'GBP', 'USD')).toEqual({ rate: 1.1394 / 0.86178, asOf: '2026-06-30' });
    expect(ecbCross(rates, '2026-06-30', 'USD', 'EUR')).toEqual({ rate: 1 / 1.1394, asOf: '2026-06-30' });
    expect(ecbCross(rates, '2026-06-30', 'EUR', 'JPY')).toEqual({ rate: 185.08, asOf: '2026-06-30' });
  });

  it('takes the last day with rates before a weekend or holiday, and says which', () => {
    // Sunday 28 June: Friday's rates.
    expect(ecbCross(rates, '2026-06-28', 'USD', 'CHF')).toEqual({ rate: 0.9218 / 1.1401, asOf: '2026-06-26' });
    expect(ecbCross(rates, '2026-06-24', 'USD', 'CHF')).toBeNull();
  });

  it('gives no rate for a currency the ECB does not publish', () => {
    expect(ecbCross(rates, '2026-06-30', 'TWD', 'USD')).toEqual({ missing: 'TWD' });
  });

  it('asks nothing for a date out of range or the same currency', async () => {
    expect(await ecbRateOn('2026-06-30', 'USD', 'USD', '2026-10-25')).toEqual({ rate: 1, asOf: '2026-06-30' });
    expect(await ecbRateOn('1998-12-31', 'USD', 'EUR', '2026-10-25')).toEqual({ error: expect.stringContaining('4 January 1999') });
    expect(await ecbRateOn('2026-11-01', 'USD', 'EUR', '2026-10-25')).toEqual({ error: expect.stringContaining('to today') });
    // Outside the desktop app there is no ECB source.
    expect(await ecbRateOn('2026-06-30', 'GBP', 'USD', '2026-10-25')).toEqual({ error: expect.stringContaining('desktop app') });
  });
});

describe("a position's entry rate and where it comes from", () => {
  it('keeps the note of a lot, and says when lots are averaged', () => {
    const first = adjustPosition(undefined, 'HSBA LN Equity', 100, 1000, { fx: 1.1394 / 0.86178, base: 'USD', note: 'ECB reference rate of 2026-06-30' })!;
    expect(first).toMatchObject({ entryFx: 1.1394 / 0.86178, entryBase: 'USD', entryFxNote: 'ECB reference rate of 2026-06-30' });
    const more = adjustPosition(first, 'HSBA LN Equity', 100, 1000, { fx: 1.35, base: 'USD', note: 'market rate when entered, 2026-10-25' })!;
    expect(more.entryFx).toBeCloseTo((1.1394 / 0.86178 + 1.35) / 2, 12);
    expect(more.entryFxNote).toBe("average of the lots' entry rates, weighted by cost");
    // Selling part keeps the rate and its note.
    expect(adjustPosition(more, 'HSBA LN Equity', -50, 1100)!.entryFxNote).toBe("average of the lots' entry rates, weighted by cost");
  });
});
