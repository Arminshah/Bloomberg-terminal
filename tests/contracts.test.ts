import { describe, expect, it } from 'vitest';
import { analytics, cleanFromYield, couponSchedule, to32nds, yieldFromClean } from '../src/finance/bonds';
import { blackScholes, impliedVol } from '../src/finance/options';
import { contractDate, discountAt, forwardValue, parseZeroCurve, swapValue, type ForwardInputs, type SwapInputs } from '../src/finance/contracts';
import { addMonths } from '../src/data/calendar';

const date = contractDate;

describe('bond calculations across the full yield domain', () => {
  const terms = { coupon: 5, maturity: date('2030-01-01'), freq: 2 };
  const settle = date('2025-01-01');
  it.each([-25, -8, 0, 4, 61, 125, 500])('recovers a nominal yield of %s percent', (yieldPct) => {
    const price = cleanFromYield(terms, settle, yieldPct);
    expect(yieldFromClean(terms, settle, price)).toBeCloseTo(yieldPct, 6);
  });
  it('prices and solves a zero-coupon instrument independently of the coupon loop', () => {
    const zero = { ...terms, coupon: 0, freq: 1 };
    expect(cleanFromYield(zero, settle, 7)).toBeCloseTo(100 / 1.07 ** 5, 9);
    expect(yieldFromClean(zero, settle, 100 / 0.9 ** 5)).toBeCloseTo(-10, 7);
  });
  it('agrees with independently bumped prices for duration, convexity and DV01', () => {
    const s = date('2025-03-15');
    const a = analytics(terms, s, 4.2);
    const down = cleanFromYield(terms, s, 4.19);
    const up = cleanFromYield(terms, s, 4.21);
    expect(a.dv01).toBeCloseTo((down - up) / 2, 7);
    expect(a.modified).toBeCloseTo((down - up) / (0.0002 * a.dirty), 5);
    expect(a.convexity).toBeCloseTo((down + up - 2 * a.clean) / (a.dirty * 0.0001 ** 2), 4);
  });
  it('rejects invalid/matured schedules without looping and does not clamp impossible prices', () => {
    expect(couponSchedule({ ...terms, freq: 0 }, settle)).toEqual([]);
    expect(couponSchedule(terms, date('2030-01-01'))).toEqual([]);
    expect(couponSchedule({ ...terms, maturity: new Date(NaN) }, settle)).toEqual([]);
    expect(yieldFromClean(terms, settle, -1)).toBeNaN();
    expect(yieldFromClean(terms, date('2035-01-01'), 100)).toBeNaN();
    expect(cleanFromYield(terms, settle, -200)).toBeNaN();
  });
  it('rounds Treasury 64ths and carries into the next whole price', () => {
    expect(to32nds(99.515625)).toBe('99-16+');
    expect(to32nds(99.9999)).toBe('100-00');
    expect(to32nds(99.51)).toBe('99-16+');
    expect(to32nds(NaN)).toBe('--');
  });
  it('keeps literal years below 100 and end-of-month schedules finite', () => {
    expect(addMonths(date('0099-01-31'), 1).toISOString().slice(0, 10)).toBe('0099-02-28');
    const schedule = couponSchedule({ coupon: 5, maturity: date('0099-12-31'), freq: 2 }, date('0098-12-31'));
    expect(schedule.map((d) => d.toISOString().slice(0, 10))).toEqual(['0098-12-31', '0099-06-30', '0099-12-31']);
  });
});

describe('deterministic European option boundaries', () => {
  it('discounts the deterministic payoff at zero volatility', () => {
    const result = blackScholes('C', 100, 100, 1, 0.05, 0.02, 0);
    expect(result.price).toBeCloseTo(100 * Math.exp(-0.02) - 100 * Math.exp(-0.05), 12);
    expect(result.delta).toBeCloseTo(Math.exp(-0.02), 12);
    const limit = blackScholes('C', 100, 100, 1, 0.05, 0.02, 0.00001);
    expect(result.price).toBeCloseTo(limit.price, 9);
    expect(result.rho).toBeCloseTo(limit.rho, 9);
    expect(result.theta).toBeCloseTo(limit.theta, 9);
  });
  it('preserves put-call parity at zero volatility including negative rates', () => {
    const call = blackScholes('C', 100, 110, 2, -0.02, 0.01, 0).price;
    const put = blackScholes('P', 100, 110, 2, -0.02, 0.01, 0).price;
    expect(call - put).toBeCloseTo(100 * Math.exp(-0.02) - 110 * Math.exp(0.04), 10);
  });
  it('keeps expiry and impossible volatility inputs separate', () => {
    expect(blackScholes('C', 110, 100, 0, 0.05, 0, 0.2).price).toBe(10);
    expect(blackScholes('C', 100, 100, 1, 0.05, 0, -0.1).price).toBeNaN();
    expect(blackScholes('C', 0, 100, 1, 0.05, 0, 0.1).price).toBeNaN();
    expect(impliedVol('C', 10, 110, 100, 0, 0.05, 0)).toBeNaN();
  });
  it('returns zero IV at the discounted lower bound, rejects upper violations, and adapts above 500%', () => {
    const lower = 100 * Math.exp(-0.02) - 100 * Math.exp(-0.05);
    expect(impliedVol('C', lower, 100, 100, 1, 0.05, 0.02)).toBe(0);
    expect(impliedVol('C', 101, 100, 100, 1, 0.05, 0)).toBeNaN();
    const price = blackScholes('C', 100, 90, 0.1, 0.03, 0, 6.5).price;
    expect(impliedVol('C', price, 100, 90, 0.1, 0.03, 0)).toBeCloseTo(6.5, 8);
  });
});

describe('FX covered interest parity', () => {
  const i: ForwardInputs = { spot: 1.1, baseRate: 2, quoteRate: 5, days: 90, baseBasis: 360, quoteBasis: 360, pointSize: 0.0001, notional: 1e6 };
  it('prices quote currency per base with the correct carry direction and point scale', () => {
    const r = forwardValue(i);
    const expected = 1.1 * 1.0125 / 1.005;
    expect(r.outright).toBeCloseTo(expected, 12);
    expect(r.points).toBeCloseTo((expected - 1.1) * 10000, 8);
    expect(forwardValue({ ...i, quoteRate: 1 }).points).toBeLessThan(0);
  });
  it('uses separate day bases and discounts a long-base contract in quote currency', () => {
    const r = forwardValue({ ...i, baseBasis: 365, strike: 1.09 });
    const expected = 1.1 * (1 + 0.05 * 90 / 360) / (1 + 0.02 * 90 / 365);
    expect(r.pv).toBeCloseTo(1e6 * (expected - 1.09) / 1.0125, 7);
    expect(forwardValue({ ...i, strike: forwardValue(i).outright }).pv).toBeCloseTo(0, 12);
  });
  it('supports negative rates and zero days; rejects singular factors and missing inputs', () => {
    expect(forwardValue({ ...i, days: 0 }).outright).toBe(i.spot);
    expect(forwardValue({ ...i, baseRate: -1 }).outright).toBeGreaterThan(i.spot);
    expect(() => forwardValue({ ...i, baseRate: -400 })).toThrow(/factor/);
    expect(() => forwardValue({ ...i, days: NaN })).toThrow();
    expect(() => forwardValue({ ...i, spot: 10, notional: 1e308 })).toThrow(/numerical range/);
  });
});

describe('input zero curves and fixed/float swaps', () => {
  const i: SwapInputs = { valuation: date('2025-01-01'), start: date('2025-01-01'), maturity: date('2027-01-01'), frequency: 1, notional: 1e6,
    fixedBasis: 365, floatBasis: 365, payFixed: true, nodes: parseZeroCurve('1,5\n2,5\n5,5') };
  it('log-interpolates discount factors and never silently extrapolates', () => {
    const nodes = parseZeroCurve('1,4\n2,6');
    expect(discountAt(nodes, 1.5)).toBeCloseTo(Math.exp(-0.08), 12);
    expect(discountAt(nodes, 0)).toBe(1);
    expect(discountAt(nodes, 3)).toBeNaN();
    expect(discountAt(parseZeroCurve('1,-1'), 1)).toBeGreaterThan(1);
  });
  it('rejects duplicate tenors, missing CSV cells and nonnumeric input', () => {
    for (const text of ['1,4\n1,5', '1,,5', '1,', '1,abc', '0,5', '1,4,', '']) expect(() => parseZeroCurve(text)).toThrow();
    expect(contractDate('2025-02-31').getTime()).toBeNaN();
  });
  it('matches the independent flat-curve par rate and telescoping floating PV', () => {
    const r = swapValue(i);
    expect(r.parPct).toBeCloseTo(Math.expm1(0.05) * 100, 10);
    expect(r.floatPV).toBeCloseTo(1e6 * (1 - Math.exp(-0.1)), 7);
    expect(r.npv).toBeCloseTo(0, 7);
    expect(r.flows.reduce((sum, f) => sum + f.netPV, 0)).toBeCloseTo(r.npv, 7);
  });
  it('values both sides with opposite signs and distinguishes coupon sensitivity from curve risk', () => {
    const r = swapValue({ ...i, fixedPct: 3 });
    const expected = 1e6 * ((1 - Math.exp(-0.1)) - 0.03 * (Math.exp(-0.05) + Math.exp(-0.1)));
    expect(r.npv).toBeCloseTo(expected, 7);
    expect(swapValue({ ...i, fixedPct: 3, payFixed: false }).npv).toBeCloseTo(-r.npv, 7);
    const couponBump = swapValue({ ...i, fixedPct: 3.01 }).npv - r.npv;
    expect(couponBump).toBeCloseTo(r.couponBpPnl, 7);
    const shifted = i.nodes.map((n) => ({ ...n, discountPct: n.discountPct + 0.01, projectionPct: n.projectionPct + 0.01 }));
    expect(swapValue({ ...i, fixedPct: 3, nodes: shifted }).npv - r.npv).toBeGreaterThan(0);
  });
  it('supports separate projection/discount curves and a forward start', () => {
    const dual = swapValue({ ...i, nodes: parseZeroCurve('1,4,6\n5,4,6') });
    expect(dual.parPct).toBeCloseTo(Math.expm1(0.06) * 100, 9);
    const forward = swapValue({ ...i, start: date('2026-01-01'), maturity: date('2028-01-01') });
    expect(forward.floatPV).toBeCloseTo(1e6 * (Math.exp(-0.05) - Math.exp(-0.15)), 7);
  });
  it('handles stub accruals and rejects dates outside curve coverage', () => {
    const stub = swapValue({ ...i, start: date('2025-03-01'), frequency: 2, fixedBasis: 360 });
    expect(stub.flows[0].days).toBe(122);
    expect(stub.flows[0].alphaFixed).toBeCloseTo(122 / 360, 12);
    expect(stub.npv).toBeCloseTo(0, 7);
    expect(() => swapValue({ ...i, nodes: parseZeroCurve('1,5') })).toThrow(/cover/);
    expect(() => swapValue({ ...i, start: date('2024-01-01') })).toThrow(/Start/);
  });
});
