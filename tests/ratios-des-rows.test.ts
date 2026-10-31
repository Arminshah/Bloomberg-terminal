import { describe, expect, it } from 'vitest';
import type { FinPeriod } from '../src/data/fundamentals';
import { equityRatios } from '../src/data/ratios';

const period = (patch: Partial<FinPeriod>) => ({ label: 'LTM', end: 0, rev: 1000, cfo: 300, capex: -100, dps: 1, shares: 50, tax: 40, pretax: 200, opInc: 220, interest: -10, debt: 400, equity: 600, eps: 3, ...patch }) as FinPeriod;

// DES's Ratios rows the app works out with its own textbook definitions (the provider publishes none), by hand.
describe('the Ratios page rows the app defines', () => {
  it('works out CPS, cash generated over required, dividend cover, interest rate and return on capital', () => {
    const r = equityRatios(period({}), period({ debt: 400, equity: 600 }), period({ debt: 300, equity: 500 }), 5000);
    // 300 / 50 shares
    expect(r.cfoPerShare).toBeCloseTo(6, 10);
    // 300 / (100 capex + 1 x 50 dividends)
    expect(r.cashGenToReqd).toBeCloseTo(2, 10);
    // (300 - 100) / 50
    expect(r.cashDividendCover).toBeCloseTo(4, 10);
    // 10 / 400
    expect(r.effectiveInterest).toBeCloseTo(2.5, 10);
    // (400 + 600) / (300 + 500) - 1
    expect(r.capitalGrowth).toBeCloseTo(25, 10);
    // 220 x (1 - 40 / 200) / (400 + 600)
    expect(r.returnOnCapital).toBeCloseTo(17.6, 10);
  });

  it('leaves a row blank rather than guess', () => {
    const r = equityRatios(period({ dps: 0, pretax: -5 }), undefined, undefined, NaN);
    expect(r.cashDividendCover).toBeNaN();
    expect(r.returnOnCapital).toBeNaN();
    expect(r.capitalGrowth).toBeNaN();
  });
});
