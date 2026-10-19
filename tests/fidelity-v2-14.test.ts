import { describe, expect, it } from 'vitest';
import { fmtFieldDate, parseFieldDate, windowBars } from '../src/terminal/daterange';
import { equityRatios } from '../src/data/ratios';
import { emptyPeriod, type FinPeriod } from '../src/data/fundamentals';

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('range boxes (GP, HP)', () => {
  it('reads the date forms the terminal fields take', () => {
    expect(parseFieldDate('10/19/2026')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('10/19/26')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('1/2/26')).toBe(D(2026, 1, 2));
    expect(parseFieldDate('2026-10-19')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('20261019')).toBe(D(2026, 10, 19));
    // Two-digit years from 70 are the 1900s, as on a ten-year history they would be.
    expect(parseFieldDate('12/31/99')).toBe(D(1999, 12, 31));
  });

  it('refuses what is not a calendar date', () => {
    for (const bad of ['', 'today', '13/01/2026', '02/30/2026', '2026-02-29', '1/2', '10/19/202']) expect(parseFieldDate(bad), bad).toBeUndefined();
    expect(parseFieldDate('02/29/2028')).toBe(D(2028, 2, 29));
  });

  it('shows dates as MM/DD/YYYY and nothing for no date', () => {
    expect(fmtFieldDate(D(2026, 3, 5))).toBe('03/05/2026');
    expect(fmtFieldDate(NaN)).toBe('');
  });

  it('counts the bars inside a typed window and those after it', () => {
    const t = [D(2026, 1, 5), D(2026, 1, 6), D(2026, 1, 7), D(2026, 1, 8), D(2026, 1, 9)];
    expect(windowBars(t, D(2026, 1, 6), D(2026, 1, 8))).toEqual({ count: 3, after: 1 });
    // A window wider than the history takes all of it.
    expect(windowBars(t, D(2025, 1, 1), D(2027, 1, 1))).toEqual({ count: 5, after: 0 });
    // A weekend window holds no bar.
    expect(windowBars(t, D(2026, 1, 10), D(2026, 1, 11)).count).toBe(0);
  });
});

function period(over: Partial<FinPeriod>): FinPeriod {
  return { ...emptyPeriod('FY', D(2025, 12, 31)), ...over };
}

describe('DES ratios page', () => {
  const ltm = period({
    rev: 1000, cogs: 600, gp: 400, rnd: 50, opInc: 200, interest: 20, pretax: 180, ni: 150, shares: 100, eps: 1.5, dps: 0.5,
    cash: 120, recv: 100, inv: 80, curAssets: 400, curLiab: 200, totAssets: 2000, debt: 500, equity: 1000, cfo: 250, capex: 50, fcf: 200,
  });
  const latest = period({ rev: 1000, eps: 1.5, equity: 1000, totAssets: 2000 });
  const prior = period({ rev: 800, eps: 1.2, equity: 900, totAssets: 1600 });

  it('works each ratio out from the statements', () => {
    const r = equityRatios(ltm, latest, prior, 3000);
    expect(r.pcf).toBeCloseTo(12);
    expect(r.pfcf).toBeCloseTo(15);
    expect(r.cfToNi).toBeCloseTo(250 / 150);
    expect(r.bookPerShare).toBeCloseTo(10);
    expect(r.revPerShare).toBeCloseTo(10);
    expect(r.cashPerShare).toBeCloseTo(1.2);
    expect(r.fcfPerShare).toBeCloseTo(2);
    expect(r.revGrowth).toBeCloseTo(25);
    expect(r.epsGrowth).toBeCloseTo(25);
    expect(r.bookGrowth).toBeCloseTo(100 / 9);
    expect(r.assetGrowth).toBeCloseTo(25);
    expect(r.rndToSales).toBeCloseTo(5);
    expect(r.retention).toBeCloseTo(100 * (1 - 0.5 / 1.5));
    expect(r.grossMargin).toBeCloseTo(40);
    expect(r.opMargin).toBeCloseTo(20);
    expect(r.pretaxMargin).toBeCloseTo(18);
    expect(r.netMargin).toBeCloseTo(15);
    expect(r.roa).toBeCloseTo(7.5);
    expect(r.roe).toBeCloseTo(15);
    expect(r.assetTurnover).toBeCloseTo(0.5);
    expect(r.currentRatio).toBeCloseTo(2);
    expect(r.quickRatio).toBeCloseTo(1.6);
    expect(r.debtToAssets).toBeCloseTo(25);
    expect(r.debtToEquity).toBeCloseTo(50);
    expect(r.interestCover).toBeCloseTo(10);
    expect(r.invTurnover).toBeCloseTo(7.5);
    expect(r.recvTurnover).toBeCloseTo(10);
  });

  it('treats costs by their size, whichever sign the statements give them', () => {
    const negative = equityRatios({ ...ltm, cogs: -600, rnd: -50, capex: -50 }, latest, prior, 3000);
    expect(negative.rndToSales).toBeCloseTo(5);
    expect(negative.invTurnover).toBeCloseTo(7.5);
    expect(negative.capexToSales).toBeCloseTo(5);
  });

  it('leaves a ratio out rather than divide by nothing or by a loss', () => {
    const r = equityRatios({ ...ltm, equity: -10, cfo: NaN, shares: 0, eps: -1 }, latest, period({ rev: 0, eps: -2 }), 3000);
    expect(r.roe).toBeNaN();
    expect(r.debtToEquity).toBeNaN();
    expect(r.pcf).toBeNaN();
    expect(r.bookPerShare).toBeNaN();
    expect(r.revGrowth).toBeNaN();
    expect(r.epsGrowth).toBeNaN();
    expect(r.retention).toBeNaN();
    expect(equityRatios(ltm, latest, undefined, 3000).revGrowth).toBeNaN();
  });
});
