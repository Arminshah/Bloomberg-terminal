import { describe, expect, it } from 'vitest';
import { bondSpreadValue } from '../src/finance/bond-spreads';
import { accruedInterest, couponSchedule } from '../src/finance/bonds';
import { contractDate, parseZeroCurve } from '../src/finance/contracts';
import { parseStrategyLegs, strategyValue, type StrategyInputs } from '../src/finance/option-strategy';
import { blackScholes } from '../src/finance/options';

const date = contractDate;
const base: StrategyInputs = { spot: 100, days: 90, rate: 0.05, dividend: 0.02, multiplier: 100, shares: 0, stockCost: 0,
  legs: parseStrategyLegs('C,100,1,8,25\nC,110,-1,4,25') };

describe('option strategy payoff, extrema and breakevens', () => {
  it('prices a debit vertical independently of the chosen graph range', () => {
    const r = strategyValue(base);
    expect(r.entryDebit).toBe(400);
    expect(r.maxLoss).toBe(400);
    expect(r.maxProfit).toBe(600);
    expect(r.breakEvens).toEqual([104]);
    expect([0, 100, 104, 105, 110, 1000000].map(r.atExpiry)).toEqual([-400, -400, 0, 100, 600, 600]);
  });
  it('finds both straddle breakevens and its unlimited profit', () => {
    const r = strategyValue({ ...base, legs: parseStrategyLegs('C,100,1,6,25\nP,100,1,5,25') });
    expect(r.maxLoss).toBe(1100);
    expect(r.maxProfit).toBe(Infinity);
    expect(r.breakEvens).toEqual([89, 111]);
  });
  it('finds a short naked call’s unlimited loss and keeps short-put loss bounded at zero spot', () => {
    const call = strategyValue({ ...base, legs: parseStrategyLegs('C,100,-1,5,25') });
    expect(call.maxLoss).toBe(Infinity);
    expect(call.maxProfit).toBe(500);
    expect(call.breakEvens).toEqual([105]);
    const put = strategyValue({ ...base, legs: parseStrategyLegs('P,100,-1,5,25') });
    expect(put.maxLoss).toBe(9500);
    expect(put.maxProfit).toBe(500);
    expect(put.breakEvens).toEqual([95]);
  });
  it('recognises covered calls, protective puts, credit condors and signed stock', () => {
    const covered = strategyValue({ ...base, shares: 100, stockCost: 100, legs: parseStrategyLegs('C,110,-1,4,25') });
    expect(covered.maxProfit).toBe(1400);
    expect(covered.maxLoss).toBe(9600);
    expect(covered.breakEvens).toEqual([96]);
    const protective = strategyValue({ ...base, shares: 100, stockCost: 100, legs: parseStrategyLegs('P,95,1,3,25') });
    expect(protective.maxLoss).toBe(800);
    expect(protective.maxProfit).toBe(Infinity);
    const condor = strategyValue({ ...base, legs: parseStrategyLegs('P,90,1,1,25\nP,95,-1,2,25\nC,105,-1,2,25\nC,110,1,1,25') });
    expect(condor.maxProfit).toBe(200);
    expect(condor.maxLoss).toBe(300);
    expect(condor.breakEvens).toEqual([93, 107]);
    const short = strategyValue({ ...base, shares: -100, stockCost: 100, legs: parseStrategyLegs('C,110,1,4,25') });
    expect(short.maxLoss).toBe(1400);
    expect(short.maxProfit).toBe(9600);
  });
  it('reports zero-payoff intervals for offsetting positions', () => {
    const r = strategyValue({ ...base, legs: parseStrategyLegs('C,100,1,5,25\nC,100,-1,5,25') });
    expect(r.maxProfit).toBe(0);
    expect(r.maxLoss).toBe(0);
    expect(r.zeroRanges).toEqual([[0, 100], [100, Infinity]]);
  });
  it('aggregates signed model Greeks and values with the contract multiplier and stock position', () => {
    const r = strategyValue({ ...base, shares: 15, stockCost: 90 });
    const a = blackScholes('C', 100, 100, 90 / 365, 0.05, 0.02, 0.25);
    const b = blackScholes('C', 100, 110, 90 / 365, 0.05, 0.02, 0.25);
    expect(r.modelValue).toBeCloseTo(1500 + 100 * (a.price - b.price), 10);
    expect(r.greeks.delta).toBeCloseTo(15 + 100 * (a.delta - b.delta), 10);
    expect(r.greeks.vega).toBeCloseTo(100 * (a.vega - b.vega), 10);
    expect(r.scenario(100)).toBeCloseTo(r.modelPnl, 10);
    expect(r.scenario(105, 90)).toBeCloseTo(r.atExpiry(105), 10);
  });
  it('uses remaining time and a decimal volatility shift for scenarios', () => {
    const r = strategyValue(base);
    const expected = 100 * (blackScholes('C', 110, 100, 60 / 365, 0.05, 0.02, 0.3).price - blackScholes('C', 110, 110, 60 / 365, 0.05, 0.02, 0.3).price) - 400;
    expect(r.scenario(110, 30, 0.05)).toBeCloseTo(expected, 10);
    expect(r.scenario(110, 91)).toBeNaN();
    expect(r.scenario(110, 0, -0.3)).toBeNaN();
    expect(r.scenario(-1)).toBeNaN();
  });
  it.each(['', 'C,100,1,,25', 'C,100,0,1,25', 'X,100,1,1,25', 'P,100,0.5,1,25', 'C,100,1,-2,25', 'C,100,1,2,-1', 'C,100,1,2,1001'])('rejects invalid/missing leg data: %s', (text) => {
    expect(() => parseStrategyLegs(text)).toThrow();
  });
  it('rejects invalid source/model inputs instead of inventing defaults', () => {
    expect(() => strategyValue({ ...base, rate: NaN })).toThrow();
    expect(() => strategyValue({ ...base, days: -1 })).toThrow();
    expect(() => strategyValue({ ...base, multiplier: 0 })).toThrow();
  });
});

describe('bond benchmark-curve Z-spread', () => {
  it('solves the independently known spread of a zero-coupon bond', () => {
    const terms = { coupon: 0, maturity: date('2027-01-01'), freq: 1 };
    const curve = parseZeroCurve('1,3\n2,3');
    const r = bondSpreadValue(terms, date('2025-01-01'), 100 * Math.exp(-0.05 * 2), curve);
    expect(r.spreadBp).toBeCloseTo(200, 7);
    expect(r.zeroSpreadClean).toBeCloseTo(100 * Math.exp(-0.06), 9);
    expect(r.spreadDuration).toBeCloseTo(2, 6);
    expect(r.z01).toBeCloseTo(100 * Math.exp(-0.1) * Math.sinh(0.0002), 10);
  });
  it.each([-250, 0, 175, 1200])('recovers %s bp on a coupon bond with accrued interest from explicit nonflat-curve cash flows', (spreadBp) => {
    const settle = date('2025-03-15');
    const terms = { coupon: 5, maturity: date('2027-01-01'), freq: 2 };
    // ln DF is linear here because r(t)=.02+.01*t on the two curve nodes.
    const curve = parseZeroCurve('1,3\n2,4');
    const dates = couponSchedule(terms, settle).slice(1);
    const dirty = dates.reduce((sum, d, k) => {
      const t = (d.getTime() - settle.getTime()) / 86_400_000 / 365;
      const logDf = t <= 1 ? -0.03 * t : -0.03 - (t - 1) * 0.05;
      return sum + (2.5 + (k === dates.length - 1 ? 100 : 0)) * Math.exp(logDf - spreadBp / 10000 * t);
    }, 0);
    const r = bondSpreadValue(terms, settle, dirty - accruedInterest(terms, settle), curve);
    expect(r.spreadBp).toBeCloseTo(spreadBp, 6);
    expect(r.flows.reduce((sum, f) => sum + f.pv, 0)).toBeCloseTo(dirty, 8);
    expect(r.scenarios.find((s) => s.bp === 25)!.clean).toBeLessThan(dirty - accruedInterest(terms, settle));
  });
  it('rejects uncovered dates, invalid curves and nonpositive clean prices', () => {
    const terms = { coupon: 5, maturity: date('2030-01-01'), freq: 2 };
    expect(() => bondSpreadValue(terms, date('2025-01-01'), 100, parseZeroCurve('1,3'))).toThrow('cover every payment date');
    expect(() => bondSpreadValue(terms, date('2025-01-01'), 0, parseZeroCurve('10,3'))).toThrow();
    expect(() => bondSpreadValue(terms, date('2025-01-01'), 100, [])).toThrow();
  });
});
