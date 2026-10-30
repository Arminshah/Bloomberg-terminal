import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { backtest, metricsOf, mpcWeights, type BacktestInput, type Policy } from '../src/finance/mpc';
import { solveQP } from '../src/finance/qp';

const ref = JSON.parse(readFileSync('tests/fixtures/mpc-cvxpy-steps.json', 'utf8')) as {
  cases: { spec: { H: number; risk: number; trade: number; hold: number; lev: number | null; lo: boolean; dn: boolean }; w: number[]; excess: number[]; sigma: number[][]; halfSpread: number; borrowPerDay: number; y: number[]; plan: number[] }[];
};

describe('the quadratic program solver', () => {
  it('solves a small problem with equality, bounds and an inequality', () => {
    // min x² + y² − 4x − 2y s.t. x + y ≤ 2, x ≥ 0: (2, 1) projected on x + y = 2 is (1.5, 0.5).
    let r = solveQP({ P: [[2, 0], [0, 2]], q: [-4, -2], A: [[1, 1], [1, 0]], l: [-Infinity, 0], u: [2, Infinity] });
    expect(r.status).toBe('solved');
    expect(r.x[0]).toBeCloseTo(1.5, 7);
    expect(r.x[1]).toBeCloseTo(0.5, 7);
    // min x² + y² − 2x − 6y with the same constraints: (1, 3) projected is (0, 2), on the bound x ≥ 0.
    r = solveQP({ P: [[2, 0], [0, 2]], q: [-2, -6], A: [[1, 1], [1, 0]], l: [-Infinity, 0], u: [2, Infinity] });
    expect(r.x[0]).toBeCloseTo(0, 7);
    expect(r.x[1]).toBeCloseTo(2, 7);
  });
});

describe("the MPC policy's daily problem, against cvxpy's full H-period plan", () => {
  for (const [k, c] of ref.cases.entries()) {
    const s = c.spec;
    it(`case ${k + 1}: horizon ${s.H}, risk ${s.risk}, trading ${s.trade}, holding ${s.hold}${s.lev ? `, leverage ${s.lev}` : ''}${s.lo ? ', long only' : ''}${s.dn ? ', dollar neutral' : ''}`, () => {
      const policy: Extract<Policy, { kind: 'mpc' }> = { kind: 'mpc', horizon: s.H, riskAversion: s.risk, tradingAversion: s.trade, holdingAversion: s.hold, leverage: s.lev ?? undefined, longOnly: s.lo, dollarNeutral: s.dn };
      const { y, qp } = mpcWeights({ w: c.w, excess: c.excess, sigma: c.sigma, costs: { halfSpread: c.halfSpread, borrowPerDay: c.borrowPerDay }, policy });
      expect(qp.status).toBe('solved');
      for (let i = 0; i < y.length; i++) {
        expect(Math.abs(y[i] - c.plan[i])).toBeLessThan(2e-6);
        expect(Math.abs(y[i] - c.y[i])).toBeLessThan(2e-6);
      }
      if (s.lev) expect(y.reduce((a, v) => a + Math.abs(v), 0)).toBeLessThanOrEqual(s.lev + 1e-6);
      if (s.lo) expect(Math.min(...y)).toBeGreaterThanOrEqual(-1e-7);
      if (s.dn) expect(Math.abs(y.reduce((a, v) => a + v, 0))).toBeLessThan(1e-6);
    });
  }
});

/** Two stocks over a fortnight (Thursday 1 to Friday 16 January 2015), a 3-day window. */
function sample(policy: Policy, rf = 0): BacktestInput {
  const dates = ['2015-01-01', '2015-01-02', '2015-01-05', '2015-01-06', '2015-01-07', '2015-01-08', '2015-01-09', '2015-01-12', '2015-01-13', '2015-01-14', '2015-01-15', '2015-01-16'];
  const a = [100, 101, 99, 102, 104, 103, 105, 107, 106, 108, 110, 109];
  const b = [50, 50.5, 51, 50, 49.5, 50.5, 51, 50.5, 52, 51.5, 52.5, 53];
  return { dates, prices: [a, b], rf: dates.map(() => rf), start: '2015-01-06', end: '2015-01-16', window: 3, initial: [10_000, 10_000], costs: { halfSpread: 0.0005, borrowPerDay: 0.0001 }, policy };
}

describe('the back-test', () => {
  it('holds: values follow the prices, with no trades and no costs', () => {
    const r = backtest(sample({ kind: 'hold' }))!;
    // The first day is 6 January (a full 3-day window before it), the last value is struck on 16 January.
    expect(r.days[0]).toBe('2015-01-06');
    expect(r.days.at(-1)).toBe('2015-01-16');
    // $10,000 in each stock on the first day, then each grows with its price.
    expect(r.value[0]).toBe(20_000);
    expect(r.value.at(-1)).toBeCloseTo(10_000 * (109 / 102) + 10_000 * (53 / 50), 9);
    expect(r.turnover.every((x) => x === 0)).toBe(true);
    expect(r.metrics.annualTurnover).toBe(0);
  });

  it('accrues the risk-free rate by calendar day, so a weekend earns three days', () => {
    const r = backtest({ ...sample({ kind: 'hold' }, 3.6), initial: [0, 0] })!;
    // All cash is zero, so nothing accrues; with cash, Friday 9 to Monday 12 January is three days at 3.6%/360.
    expect(r.value.every((v) => v === 0)).toBe(true);
    const withCash = backtest({ ...sample({ kind: 'hold' }, 3.6), initial: [10_000, 0] })!;
    const fri = withCash.days.indexOf('2015-01-09');
    expect(withCash.excess[fri]).toBeCloseTo(withCash.returns[fri] - 0.036 / 360 * 3, 15);
  });

  it('charges half the spread on each dollar traded and the borrow fee on shorts for each calendar day', () => {
    // A dollar-neutral policy must sell half the long book on the first day and go short.
    const r = backtest(sample({ kind: 'mpc', horizon: 1, riskAversion: 1, tradingAversion: 1, holdingAversion: 1, leverage: 2, dollarNeutral: true }))!;
    expect(r.weights[0].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
    expect(r.turnover[0]).toBeGreaterThan(0.99);
    // Cash after the first trades equals the sales less half the spread on everything traded and a day's borrow fee.
    const v0 = r.value[0];
    const traded = r.turnover[0] * v0;
    const short = r.weights[0].reduce((a, w) => a + Math.max(-w, 0), 0) * v0;
    const sales = -r.weights[0].reduce((a, w) => a + w * v0 - 10_000, 0);
    expect(r.cash[0] * v0).toBeCloseTo(sales - 0.0005 * traded - 0.0001 * 1 * short, 6);
  });

  it('computes the dissertation\'s metrics on 250 periods a year', () => {
    const m = metricsOf([100, 110, 99, 120], [0.1, -0.1, 0.2121212121], [0.09, -0.11, 0.2021212121], [0.5, 0, 0.25]);
    expect(m.annualReturn).toBeCloseTo(((0.1 - 0.1 + 0.2121212121) / 3) * 250 * 100, 9);
    expect(m.annualExcessReturn).toBeCloseTo(((0.09 - 0.11 + 0.2021212121) / 3) * 250 * 100, 9);
    const mean = (0.09 - 0.11 + 0.2021212121) / 3;
    const sd = Math.sqrt(([0.09, -0.11, 0.2021212121].reduce((s, x) => s + (x - mean) ** 2, 0)) / 2);
    expect(m.annualExcessRisk).toBeCloseTo(sd * Math.sqrt(250) * 100, 9);
    expect(m.sharpe).toBeCloseTo(m.annualExcessReturn / m.annualExcessRisk, 12);
    expect(m.maxDrawdown).toBeCloseTo(10, 9);
    expect(m.annualTurnover).toBeCloseTo((0.75 / 3) * 250 * 100, 9);
  });

  it('keeps long-only weights at zero or more and within the leverage limit', () => {
    const r = backtest(sample({ kind: 'mpc', horizon: 10, riskAversion: 5, tradingAversion: 1, holdingAversion: 1, leverage: 1, longOnly: true }))!;
    for (const w of r.weights) {
      expect(Math.min(...w)).toBeGreaterThanOrEqual(-1e-7);
      expect(w.reduce((a, b) => a + Math.abs(b), 0)).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(r.unsolved).toEqual([]);
  });
});
