import { describe, expect, it } from 'vitest';
import { betaStats, histogram, incompleteBeta, tCdf } from '../src/finance/beta-stats';
import { regress } from '../src/finance/stats';

describe('the t distribution', () => {
  it('gives the regularized incomplete beta function', () => {
    // I_0.5(2, 3) = 6/16 + 4/16 + 1/16.
    expect(incompleteBeta(0.5, 2, 3)).toBeCloseTo(11 / 16, 12);
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
  });

  it("gives the tables' values", () => {
    expect(tCdf(0, 5)).toBeCloseTo(0.5, 12);
    expect(tCdf(2, 10)).toBeCloseTo(0.963306, 5);
    // 2.228 is the two-tailed 5% critical value with 10 degrees of freedom.
    expect(tCdf(2.228139, 10)).toBeCloseTo(0.975, 5);
    expect(tCdf(-2.228139, 10)).toBeCloseTo(0.025, 5);
    // With many degrees of freedom it is the normal distribution.
    expect(tCdf(1.959964, 1e7)).toBeCloseTo(0.975, 5);
  });

  it("gives the frame's Last P-Value for its Last T-Value: 1.473 over 260 points, 0.929", () => {
    expect(tCdf(1.473, 258)).toBeCloseTo(0.929, 3);
  });
});

describe('BETA statistics', () => {
  const x = [-2.1, 0.4, 1.3, -0.8, 2.6, 0.9, -1.5, 1.8, -0.3, 0.7];
  const y = [-2.9, 0.2, 2.1, -0.4, 3.3, 1.6, -2.4, 1.9, 0.5, 1.4];
  const s = betaStats(x, y);

  it("fits the same line as the app's regression", () => {
    const r = regress(x, y);
    expect(s.beta).toBeCloseTo(r.beta, 12);
    expect(s.alpha).toBeCloseTo(r.alpha, 12);
    expect(s.r2).toBeCloseTo(r.r2, 12);
    expect(s.seBeta).toBeCloseTo(r.stdErr, 12);
    expect(s.adjusted).toBeCloseTo(0.67 * s.beta + 0.33, 12);
  });

  it('gives the standard errors, the t-test and its significance', () => {
    const n = x.length;
    const mx = x.reduce((a, v) => a + v, 0) / n;
    const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0);
    const sse = x.reduce((a, v, i) => a + (y[i] - s.alpha - s.beta * v) ** 2, 0);
    expect(s.sdError).toBeCloseTo(Math.sqrt(sse / (n - 2)), 12);
    expect(s.seAlpha).toBeCloseTo(s.sdError * Math.sqrt(1 / n + (mx * mx) / sxx), 12);
    expect(s.tTest).toBeCloseTo(s.beta / s.seBeta, 12);
    expect(s.significance).toBeCloseTo(2 * (1 - tCdf(Math.abs(s.tTest), n - 2)), 12);
    expect(s.significance).toBeLessThan(0.001);
  });

  it("places the last point: its residual over the errors' deviation, and the distribution below it", () => {
    const last = y[9] - s.alpha - s.beta * x[9];
    expect(s.lastT).toBeCloseTo(last / s.sdError, 12);
    expect(s.lastP).toBeCloseTo(tCdf(s.lastT, 8), 12);
  });

  it('needs three points', () => {
    expect(betaStats([1, 2], [1, 2]).beta).toBeNaN();
  });

  it('counts values into equal bins, the top edge in the last', () => {
    expect(histogram([0, 0.5, 1, 1.5, 2, 3], 0, 2, 4)).toEqual([1, 1, 1, 2]);
  });
});
