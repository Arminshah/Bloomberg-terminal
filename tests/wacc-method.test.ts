import { describe, expect, it } from 'vitest';
import { UNRATED_AF, capitalStructure, costOfDebtFallback, costOfEquity, costOfPreferred, economicValueAdded, waccOf } from '../src/finance/wacc';
import { engine } from '../src/data/market';
import { DAY_MS } from '../src/data/calendar';
import { closeNear, usdPerUnitAt } from '../src/functions/WACC';

// The screens' figures as the owner's reference pack quotes them (METHODOLOGY.md, sections 1 and 4).
describe('WACC weights and the cost of capital', () => {
  it("gives Apple's 2022 Q1 capital structure and WACC", () => {
    const cap = capitalStructure(2_880_565.2, 16_169.0, 106_629.0, 0);
    expect(cap.total).toBeCloseTo(3_003_363.2, 6);
    expect(cap.we * 100).toBeCloseTo(95.9, 1);
    expect(cap.wst * 100).toBeCloseTo(0.5, 1);
    expect(cap.wlt * 100).toBeCloseTo(3.6, 1);
    // Equity at 9.6%, debt at 2.3% after tax: WACC 9.3%.
    expect(waccOf(cap, 9.6, 2.3, NaN).wacc).toBeCloseTo(9.3, 1);
  });

  it("gives IBM's 2012 Q2 WACC from its rounded inputs: equity 87.3% at 9.7%, debt 12.7% at 1.3%", () => {
    const cap = capitalStructure(87.3, 0, 12.7, 0);
    // The screen shows 8.7% (8.6718% behind its capital charge); one-decimal inputs land within 0.05 of it.
    expect(Math.abs(waccOf(cap, 9.7, 1.3, NaN).wacc - 8.6718)).toBeLessThan(0.05);
  });

  it('prices equity by CAPM and leaves preferred without a cost out of the capital', () => {
    expect(costOfEquity(4, 1.2, 5)).toBeCloseTo(10, 12);
    const cap = capitalStructure(900, 0, 50, 50);
    const { cap: used, wacc } = waccOf(cap, 10, 4, NaN);
    expect(used.wp).toBe(0);
    expect(used.we).toBeCloseTo(900 / 950, 12);
    expect(wacc).toBeCloseTo((900 / 950) * 10 + (50 / 950) * 4, 12);
    expect(costOfPreferred(5, 100)).toBe(5);
    expect(costOfPreferred(0, 100)).toBeNaN();
    expect(costOfPreferred(5, 0)).toBeNaN();
  });
});

describe('cost of debt without a fair market curve', () => {
  it('blends the government short and long rates by the debt split, times the adjustment factor, after tax', () => {
    // 100 short at 4% and 300 long at 5%: 4.75%, × 1.38 = 6.555%, after 20% tax 5.244%.
    const kd = costOfDebtFallback(100, 300, 4, 5, UNRATED_AF, 0.2);
    expect(kd.pre).toBeCloseTo(6.555, 12);
    expect(kd.after).toBeCloseTo(5.244, 12);
    expect(costOfDebtFallback(0, 0, 4, 5, UNRATED_AF, 0.2).pre).toBeNaN();
    expect(costOfDebtFallback(0, 300, NaN, 5, UNRATED_AF, 0).pre).toBeCloseTo(6.9, 12);
  });
});

describe('Economic Value Added', () => {
  it("matches Apple's 2022 Q1 screen", () => {
    // WACC behind the screen's capital charge: 18,170.67 / 194,730.00.
    const wacc = (18_170.67 / 194_730) * 100;
    const e = economicValueAdded(116_903.0, 11_402.75, 194_730.0, wacc);
    expect(e.nopat).toBeCloseTo(105_500.25, 6);
    expect(e.charge).toBeCloseTo(18_170.67, 6);
    expect(e.eva).toBeCloseTo(87_329.58, 2);
    expect(e.roic).toBeCloseTo(54.18, 2);
    expect(e.spread).toBeCloseTo(44.85, 2);
  });

  it("matches Apple's and IBM's 2012 screens: ROIC = NOPAT / TIC, capital charge = TIC × WACC", () => {
    const apple = economicValueAdded(42_086.87, 0, 125_035.0, 10.0586);
    expect(apple.roic).toBeCloseTo(33.66, 2);
    expect(apple.charge).toBeCloseTo(12_576.8, 0);
    expect(apple.eva).toBeCloseTo(29_510.07, 0);
    const ibm = economicValueAdded(15_299.53, 0, 69_502.0, 8.6718);
    expect(ibm.roic).toBeCloseTo(22.01, 2);
    expect(ibm.charge).toBeCloseTo(6_027.07, 1);
  });
});

describe("WACC's history: a close only within ten days of the year-end", () => {
  it('takes the last close at or before the day, and none from further back', () => {
    const id = 'AAPL US Equity';
    const sr = engine.daily(id);
    const last = sr.t[sr.length - 1];
    expect(closeNear(id, last)).toBe(sr.c[sr.length - 1]);
    expect(closeNear(id, last + 10 * DAY_MS)).toBe(sr.c[sr.length - 1]);
    expect(closeNear(id, last + 11 * DAY_MS)).toBeNaN();
    expect(closeNear(id, sr.t[0] - DAY_MS)).toBeNaN();
  });

  it('turns a pair quoted either way into dollars per unit', () => {
    const t = engine.daily('EURUSD Curncy').t.at(-1)!;
    expect(usdPerUnitAt('USD', t)).toBe(1);
    expect(usdPerUnitAt('EUR', t)).toBeCloseTo(closeNear('EURUSD Curncy', t), 12);
    expect(usdPerUnitAt('JPY', t)).toBeCloseTo(1 / closeNear('USDJPY Curncy', t), 12);
    expect(usdPerUnitAt('XYZ', t)).toBeNaN();
  });
});
