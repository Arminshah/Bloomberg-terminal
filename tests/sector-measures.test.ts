import { describe, expect, it } from 'vitest';
import { measureStats, measureValue, SECTOR_MEASURES, type Measure } from '../src/data/sector-measures';
import { sectorContracts } from '../src/functions/CMDSECTOR';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

const DAY = 86_400_000;
const m = (id: string): Measure => Object.values(SECTOR_MEASURES).flat().find((x) => x.id === id)!;

describe('the commodity sector measures', () => {
  it('works out ratios, spreads, and crack spreads with gallons put in barrels', () => {
    expect(measureValue(m('gold-silver'), 4000, 48)).toBeCloseTo(83.3333333, 6);
    expect(measureValue(m('brent-wti'), 66.4, 62.1)).toBeCloseTo(4.3, 9);
    // Heating oil at $2.30 a gallon is $96.60 a barrel: $34.60 over crude at $62.
    expect(measureValue(m('crack-ho'), 2.3, 62)).toBeCloseTo(34.6, 9);
    expect(measureValue(m('oil-gas'), 62, 3.1)).toBeCloseTo(20, 9);
    expect(measureValue(m('soy-corn'), 1020, 420)).toBeCloseTo(2.4285714, 6);
    expect(measureValue(m('gold-silver'), 4000, 0)).toBeNaN();
  });

  it("takes the year's range from the days both contracts closed, never a day one lacks", () => {
    const t0 = Date.UTC(2026, 0, 5);
    const a = [100, 102, 104, 106].map((c, i) => ({ t: t0 + i * DAY, c }));
    // B has no close on the third day, and an extra one the day after A's last.
    const b = [{ t: t0, c: 50 }, { t: t0 + DAY, c: 51 }, { t: t0 + 3 * DAY, c: 50 }, { t: t0 + 4 * DAY, c: 60 }];
    const s = measureStats(m('gold-silver'), { a: 105, b: 50, prevA: 106, prevB: 50 }, a, b);
    expect(s.days).toBe(3);
    expect(s.low).toBe(2);
    expect(s.high).toBeCloseTo(2.12, 12);
    expect(s.mean).toBeCloseTo((2 + 2 + 2.12) / 3, 12);
    expect(s.last).toBe(2.1);
    expect(s.previous).toBeCloseTo(2.12, 12);
    expect(s.position).toBeCloseTo(0.1 / 0.12, 12);
  });

  it('keeps only the last year before the latest shared day', () => {
    const old = { t: Date.UTC(2025, 0, 2), c: 10 };
    const recent = { t: Date.UTC(2026, 5, 1), c: 20 };
    const s = measureStats(m('brent-wti'), { a: 70, b: 65, prevA: 70, prevB: 65 }, [old, recent], [{ ...old, c: 5 }, { ...recent, c: 15 }]);
    expect(s.days).toBe(1);
    expect(s.low).toBe(5);
    expect(s.high).toBe(5);
  });
});

describe('the sector pages', () => {
  it('show their own contracts', () => {
    const tickers = (code: string) => sectorContracts(code).map((d) => d.ticker);
    expect(tickers('OILMARKET')).toEqual(['CL1', 'CO1', 'HO1', 'XB1']);
    expect(tickers('NATURALGAS')).toEqual(['NG1']);
    expect(tickers('METALS')).toEqual(['GC1', 'SI1', 'PL1', 'PA1', 'HG1']);
    expect(tickers('AGRICULTURE')).toEqual(['W 1', 'C 1', 'S 1', 'KC1', 'SB1', 'CC1', 'CT1', 'LC1', 'LH1']);
  });

  it('open under OIL, GAS, MINE and AGS, while WTI, CRUDE and NATGAS still open the contracts', () => {
    const lookup = (c: string) => lookupFn(c);
    expect(parseCommand('OIL', lookup)).toEqual({ kind: 'route', fn: 'OILMARKET' });
    expect(parseCommand('GAS', lookup)).toEqual({ kind: 'route', fn: 'NATURALGAS' });
    expect(parseCommand('MINE', lookup)).toEqual({ kind: 'route', fn: 'METALS' });
    expect(parseCommand('AGS', lookup)).toEqual({ kind: 'route', fn: 'AGRICULTURE' });
    for (const [word, id] of [['WTI', 'CL1 Comdty'], ['CRUDE', 'CL1 Comdty'], ['NATGAS', 'NG1 Comdty']]) expect(parseCommand(word, lookup)).toMatchObject({ kind: 'route', sec: expect.objectContaining({ id }) });
  });
});
