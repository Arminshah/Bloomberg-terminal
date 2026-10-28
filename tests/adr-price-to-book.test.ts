import { afterEach, describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { emptyPeriod, keyStats } from '../src/data/fundamentals';
import { realFund, type RealFund } from '../src/data/live/yfund';

// PEERS for JPMorgan on 28 October 2026 showed HSBC's receipt at a price to book of 8.31: the source divided the
// receipt's price ($86.01, five ordinary shares) by one ordinary share's book value. Its P/E (11.2) and ROE (13.1%)
// put price to book near 1.5.
const fund = (stats: RealFund['stats']): RealFund => ({
  // Statements without a balance sheet, as for a peer: the ratios are the source's.
  fetched: 0, annual: [{ ...emptyPeriod('FY 2025', Date.parse('2025-12-31')), rev: 70_000 }], quarterly: [], ltm: emptyPeriod('LTM', Date.parse('2026-09-30')), earnings: [], holders: [], breakdown: null, stats, nextDividend: null,
  float: { float: NaN, short: NaN, shortPctFloat: NaN, daysToCover: NaN, asOf: NaN, shortPrior: NaN, priorAsOf: NaN }, officers: [],
});
const def = engine.get('JPM US Equity')!;

describe("a source's price to book on two share bases", () => {
  afterEach(() => realFund.delete(def.id));

  it('is left blank when it is far from P/E times ROE', () => {
    realFund.set(def.id, fund({ pe: 11.2, roe: 13.1, pb: 8.31 }));
    expect(keyStats(def).pb).toBeNaN();
  });

  it('is kept when it agrees with them', () => {
    realFund.set(def.id, fund({ pe: 14.1, roe: 18.0, pb: 2.54 }));
    expect(keyStats(def).pb).toBe(2.54);
  });
});
