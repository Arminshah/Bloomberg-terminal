import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cmlSlope, frontierSd, meanVariance, minVarianceLongOnly, periodReturns, portfolioStats, sharpe, tangency } from '../src/finance/mean-variance';

/** Yahoo's month-end closes, January 2009 to January 2019 (see the fixture's source line). */
const fixture = JSON.parse(readFileSync('tests/fixtures/ftse-month-end-2009-2019.json', 'utf8')) as { closes: Record<string, Record<string, [string, number]>> };
const months = Object.keys(fixture.closes['BATS.L']).filter((m) => m >= '2009-02' && m <= '2019-01');
const returnsOf = (symbol: string) => periodReturns(months.map((m) => fixture.closes[symbol][m][1]));

describe("the first paper's mean-variance figures (Feb 2009 to Jan 2019, monthly, rf 0.25% a month)", () => {
  // The paper's column headed "BATS LN Equity" holds Berkeley Group's prices (Yahoo's BKG.L divided by a constant
  // 1.0364), and the one headed "BKG LN Equity" holds British American Tobacco's. Its results reproduce on Berkeley's
  // prices in the BATS slot: this checks the maths against the spreadsheet, not British American Tobacco.
  const mv = meanVariance(['BKG.L', 'GSK.L', 'RKT.L', 'DGE.L'].map(returnsOf))!;
  const rf = 0.0025;

  it('uses 119 monthly returns', () => {
    expect(mv.periods).toBe(119);
  });

  it('reproduces the global minimum-variance portfolio (Figure 3.2)', () => {
    expect(mv.gmvp.map((w) => Number((w * 100).toFixed(2)))).toEqual([17.36, 22.1, 24.02, 36.52]);
    const s = portfolioStats(mv.gmvp, mv.mu, mv.sigma);
    expect(s.ret).toBeCloseTo(0.00944575, 7);
    expect(s.variance).toBeCloseTo(0.000959241, 8);
    expect(s.sd).toBeCloseTo(0.030971611, 6);
  });

  it('reproduces the equally weighted portfolio (Figure 3.4)', () => {
    const s = portfolioStats(mv.ewp, mv.mu, mv.sigma);
    expect((s.ret * 100).toFixed(3)).toBe('0.943');
    expect((s.variance * 100).toFixed(3)).toBe('0.100');
    expect((s.sd * 100).toFixed(3)).toBe('3.155');
  });

  it('reproduces the tangency portfolio and its Sharpe ratio (Figure 3.6)', () => {
    const tp = tangency(mv, rf)!;
    expect(tp.map((w) => (w * 100).toFixed(3))).toEqual(['29.592', '-26.544', '28.258', '68.694']);
    const s = portfolioStats(tp, mv.mu, mv.sigma);
    expect(s.ret).toBeCloseTo(0.013423543, 6);
    expect(s.variance).toBeCloseTo(0.001508593, 7);
    expect(s.sd).toBeCloseTo(0.038840605, 6);
    expect(s.ret - rf).toBeCloseTo(0.010923543, 6);
    expect(sharpe(s, rf)).toBeCloseTo(0.28124029, 5);
  });

  it("puts the tangency portfolio on the frontier, with the capital market line's slope as its Sharpe ratio", () => {
    const tp = portfolioStats(tangency(mv, rf)!, mv.mu, mv.sigma);
    expect(frontierSd(mv, tp.ret)).toBeCloseTo(tp.sd, 12);
    expect(cmlSlope(mv, rf)).toBeCloseTo(sharpe(tp, rf), 12);
    const g = portfolioStats(mv.gmvp, mv.mu, mv.sigma);
    expect(frontierSd(mv, g.ret)).toBeCloseTo(g.sd, 12);
    expect(g.ret).toBeCloseTo(mv.B / mv.A, 14);
  });
});

describe("British American Tobacco's own prices in the same window", () => {
  const mv = meanVariance(['BATS.L', 'GSK.L', 'RKT.L', 'DGE.L'].map(returnsOf))!;

  it('gives a different minimum-variance portfolio, short British American Tobacco', () => {
    expect(mv.gmvp.map((w) => Number((w * 100).toFixed(2)))).toEqual([-7.85, 26.43, 27.29, 54.13]);
    expect((portfolioStats(mv.gmvp, mv.mu, mv.sigma).sd * 100).toFixed(3)).toBe('3.326');
  });

  it('without short positions, holds no British American Tobacco and only the other three', () => {
    const w = minVarianceLongOnly(mv.sigma)!;
    expect(w[0]).toBe(0);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(w.every((v) => v >= 0)).toBe(true);
    // The three left are their own minimum-variance portfolio, and no other mix of the four does better.
    const three = meanVariance(['GSK.L', 'RKT.L', 'DGE.L'].map(returnsOf))!;
    expect(w.slice(1).map((v) => v.toFixed(10))).toEqual(three.gmvp.map((v) => v.toFixed(10)));
    const best = portfolioStats(w, mv.mu, mv.sigma).variance;
    for (const a of [0, 0.01, 0.05]) for (const b of [0.2, 0.3]) {
      const c = 1 - a - b - 0.4;
      expect(portfolioStats([a, b, 0.4, c], mv.mu, mv.sigma).variance).toBeGreaterThanOrEqual(best - 1e-15);
    }
  });
});

describe('the closed forms', () => {
  it('equal the unconstrained portfolio when no weight is negative', () => {
    const r = [[0.01, -0.02, 0.03, 0.0, 0.01, -0.01], [0.02, 0.01, -0.01, 0.01, 0.0, 0.02], [0.0, 0.01, 0.02, -0.02, 0.01, 0.0]];
    const mv = meanVariance(r)!;
    const lo = minVarianceLongOnly(mv.sigma)!;
    expect(mv.gmvp.every((w) => w > 0)).toBe(true);
    expect(lo.map((v) => v.toFixed(12))).toEqual(mv.gmvp.map((v) => v.toFixed(12)));
    expect(mv.gmvp.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('refuse a set where one series repeats another, or too few periods', () => {
    expect(meanVariance([[0.01, 0.02, -0.01, 0.0], [0.01, 0.02, -0.01, 0.0]])).toBeNull();
    expect(meanVariance([[0.01, 0.02], [0.0, 0.01]])).toBeNull();
    expect(meanVariance([[0.01, NaN, 0.0, 0.02], [0.0, 0.01, 0.02, 0.01]])).toBeNull();
  });

  it('give no tangency portfolio when the risk-free rate is at or above the minimum-variance return', () => {
    const r = [[0.01, -0.02, 0.03, 0.0, 0.01, -0.01], [0.02, 0.01, -0.01, 0.01, 0.0, 0.02]];
    const mv = meanVariance(r)!;
    expect(tangency(mv, mv.B / mv.A)).toBeNull();
    expect(tangency(mv, mv.B / mv.A + 0.01)).toBeNull();
  });
});
