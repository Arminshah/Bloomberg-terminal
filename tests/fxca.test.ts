import { describe, expect, it } from 'vitest';
import { ecbCross, parseEcbRates } from '../src/data/live/ecb-fx';
import { convertArgs, rateDec, rateNow } from '../src/functions/FXCA';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import exr from './fixtures/ecb-exr-2026-06.csv?raw';

// The ECB's reference rates as published for 25 to 30 June 2026 (CHF, GBP, JPY and USD per euro).
const ecb = parseEcbRates(exr)!;

describe('Currency conversion (FXCA)', () => {
  it('reads the amount and the two currencies from the command or the loaded pair', () => {
    expect(convertArgs('1000 EUR JPY')).toEqual({ amount: 1000, from: 'EUR', to: 'JPY' });
    expect(convertArgs('250.5 gbp usd')).toEqual({ amount: 250.5, from: 'GBP', to: 'USD' });
    expect(convertArgs('', 'EURJPY Curncy')).toEqual({ amount: 1000, from: 'EUR', to: 'JPY' });
    expect(convertArgs('CHF')).toEqual({ amount: 1000, from: 'CHF', to: 'USD' });
    expect(convertArgs('USD')).toEqual({ amount: 1000, from: 'USD', to: 'EUR' });
    expect(convertArgs(undefined)).toEqual({ amount: 1000, from: 'EUR', to: 'USD' });
  });

  it('crosses two live dollar rates, and gives none when either is missing', () => {
    const usd: Record<string, number> = { USD: 1, EUR: 1.16, JPY: 1 / 152 };
    const v = (c: string) => usd[c] ?? NaN;
    expect(rateNow(v, 'EUR', 'JPY')).toBeCloseTo(1.16 * 152, 9);
    expect(rateNow(v, 'EUR', 'EUR')).toBe(1);
    expect(rateNow(v, 'EUR', 'SEK')).toBeNaN();
  });

  it("takes a past day's rate from the ECB, crossed through the euro, from the last day with rates", () => {
    // Sunday 28 June: Friday's rates. GBP into USD is the dollar's rate over the pound's.
    const r = ecbCross(ecb, '2026-06-28', 'GBP', 'USD');
    expect(r).toEqual({ rate: 1.1401 / 0.86253, asOf: '2026-06-26' });
    expect(1000 * (r as { rate: number }).rate).toBeCloseTo(1321.809, 3);
    expect(ecbCross(ecb, '2026-06-30', 'USD', 'JPY')).toEqual({ rate: 185.08 / 1.1394, asOf: '2026-06-30' });
    expect(ecbCross(ecb, '2026-06-30', 'EUR', 'CHF')).toEqual({ rate: 0.9224, asOf: '2026-06-30' });
    // A currency the ECB does not publish (the offshore renminbi) has no rate, not a guessed one.
    expect(ecbCross(ecb, '2026-06-30', 'CNH', 'USD')).toEqual({ missing: 'CNH' });
  });

  it('shows a rate with fewer decimals as it grows', () => {
    expect([rateDec(1.3218), rateDec(16.2), rateDec(162.4)]).toEqual([5, 3, 2]);
  });

  it('opens under FXCA', () => {
    expect(parseCommand('FXCA', lookupFn)).toEqual({ kind: 'route', fn: 'CONVERT' });
  });
});
