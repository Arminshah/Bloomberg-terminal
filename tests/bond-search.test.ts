import { describe, expect, it } from 'vitest';
import { complete, describeSearch, matchesAfterEach, runSearch, treasuryInstruments, treasuryName, type Instrument } from '../src/data/bond-search';
import { initialCrits } from '../src/functions/SRCH';

const NOW = Date.UTC(2026, 9, 31);
const bond = (id: string, type: string, coupon: number, maturity: string, amountMM: number, extra: Partial<Instrument> = {}): Instrument => ({ id, name: id, type, coupon, maturity, amountMM, ...extra });
const LIST = [
  bond('A', 'Notes', 4.25, '2030-11-15', 80_000),
  bond('B', 'Bonds', 4.625, '2054-05-15', 120_000),
  bond('C', 'Bills', NaN, '2026-12-31', 60_000),
  bond('D', 'TIPS', 2.125, '2035-01-15', 40_000),
];

describe('SRCH: criteria joined by And, matches after each (TE07 02:23)', () => {
  it('applies each complete criterion in turn and counts what is left', () => {
    const crits = [
      { field: 'type' as const, boundary: 'include' as const, value: 'Notes, Bonds' },
      { field: 'maturity' as const, boundary: 'gt' as const, value: '10' },
      { field: 'coupon' as const, boundary: 'gt' as const, value: '' },
    ];
    expect(matchesAfterEach(LIST, crits, NOW)).toEqual([2, 1, null]);
    expect(runSearch(LIST, crits, NOW).map((i) => i.id)).toEqual(['B']);
  });

  it('reads Exclude, Less than, Between and amounts in millions', () => {
    expect(runSearch(LIST, [{ field: 'type', boundary: 'exclude', value: 'Bills' }], NOW).map((i) => i.id)).toEqual(['A', 'B', 'D']);
    expect(runSearch(LIST, [{ field: 'maturity', boundary: 'lt', value: '1' }], NOW).map((i) => i.id)).toEqual(['C']);
    expect(runSearch(LIST, [{ field: 'coupon', boundary: 'between', value: '4', to: '4.5' }], NOW).map((i) => i.id)).toEqual(['A']);
    expect(runSearch(LIST, [{ field: 'amount', boundary: 'gt', value: '100,000' }], NOW).map((i) => i.id)).toEqual(['B']);
    // A bill has no coupon: no coupon criterion keeps it.
    expect(runSearch(LIST, [{ field: 'coupon', boundary: 'lt', value: '10' }], NOW).map((i) => i.id)).toEqual(['A', 'B', 'D']);
  });

  it('keeps a rating and those above it, and skips criteria not filled in', () => {
    const rated = [bond('X', 'Corp', 5, '2030-01-01', 1000, { rating: 'A' }), bond('Y', 'Corp', 5, '2030-01-01', 1000, { rating: 'BB+' })];
    expect(runSearch(rated, [{ field: 'rating', boundary: 'gt', value: 'BBB-' }], NOW).map((i) => i.id)).toEqual(['X']);
    expect(complete({ field: 'rating', boundary: 'gt', value: 'ZZ' })).toBe(false);
    expect(complete({ field: 'coupon', boundary: 'between', value: '1' })).toBe(false);
  });

  it('echoes the search as the frame echoes the typed query', () => {
    expect(describeSearch('US Treasuries', [{ field: 'maturity', boundary: 'gt', value: '10' }, { field: 'type', boundary: 'include', value: 'Bonds' }])).toBe('US TREASURIES YEARS TO MATURITY > 10 SECURITY TYPE BONDS');
  });
});

describe("SRCH's universe and starting criteria", () => {
  it("names the statement's Treasuries as bond tickers are written", () => {
    expect(treasuryName(4.625, '2054-05-15')).toBe('T 4.625 05/15/54');
    const list = treasuryInstruments({ recordDate: '2026-09-30', statedByClass: {}, statedTotal: NaN, securities: [{ cusip: '912810TX6', cls: 'Bonds', rate: 4.625, maturity: '2054-05-15', outstanding: 119_000 }, { cusip: '912797AB1', cls: 'Bills', rate: NaN, maturity: '2026-12-31', outstanding: 60_000 }] } as never);
    expect(list.map((i) => [i.name, i.type, i.amountMM])).toEqual([['T 4.625 05/15/54', 'Bonds', 119_000], ['B 0 12/31/26', 'Bills', 60_000]]);
    expect(Number.isNaN(list[1].coupon)).toBe(true);
  });

  it('starts "AAPL CORP" on the demo with corporates by that issuer, and "T GOVT" with all Treasuries', () => {
    expect(initialCrits('AAPL CORP', undefined, false)).toEqual([{ field: 'type', boundary: 'include', value: 'Corp' }, { field: 'issuer', boundary: 'include', value: 'AAPL' }]);
    expect(initialCrits('T GOVT', undefined, true)).toEqual([]);
  });
});
