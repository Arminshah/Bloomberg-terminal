import { describe, expect, it } from 'vitest';
import { blackScholes, impliedVol, normCdf } from '../src/finance/options';
import { accruedInterest, analytics, cleanFromYield, couponFraction, couponSchedule, to32nds, yieldFromClean } from '../src/finance/bonds';
import { bollinger, ema, macd, rsi, sma } from '../src/finance/indicators';
import { correlation, maxDrawdown, percentile, regress } from '../src/finance/stats';

describe('Black-Scholes', () => {
  it('matches the textbook example (Hull 15.6)', () => {
    // S=42, K=40, r=10%, sigma=20%, T=0.5 -> call 4.76, put 0.81
    const c = blackScholes('C', 42, 40, 0.5, 0.1, 0, 0.2);
    const p = blackScholes('P', 42, 40, 0.5, 0.1, 0, 0.2);
    expect(c.price).toBeCloseTo(4.76, 2);
    expect(p.price).toBeCloseTo(0.81, 2);
  });

  it('satisfies put-call parity with dividends', () => {
    const S = 230;
    const K = 240;
    const T = 0.75;
    const r = 0.04;
    const q = 0.012;
    const c = blackScholes('C', S, K, T, r, q, 0.33).price;
    const p = blackScholes('P', S, K, T, r, q, 0.33).price;
    expect(c - p).toBeCloseTo(S * Math.exp(-q * T) - K * Math.exp(-r * T), 8);
  });

  it('recovers the input volatility', () => {
    const px = blackScholes('P', 100, 95, 0.3, 0.03, 0.01, 0.27).price;
    expect(impliedVol('P', px, 100, 95, 0.3, 0.03, 0.01)).toBeCloseTo(0.27, 6);
  });

  it('has a normal CDF accurate in the tails', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(1.959963985)).toBeCloseTo(0.975, 8);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301, 12);
  });

  it('has delta between 0 and 1 for calls and gamma > 0', () => {
    const g = blackScholes('C', 100, 100, 1, 0.05, 0, 0.2);
    expect(g.delta).toBeGreaterThan(0.5);
    expect(g.delta).toBeLessThan(1);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
  });
});

describe('Treasury math', () => {
  const terms = { coupon: 4.25, maturity: new Date('2035-11-15T00:00:00Z'), freq: 2 };
  const settle = new Date('2026-01-20T00:00:00Z');

  it('prices at par when yield equals coupon on a coupon date', () => {
    const onCoupon = new Date('2025-11-15T00:00:00Z');
    expect(cleanFromYield(terms, onCoupon, 4.25)).toBeCloseTo(100, 8);
  });

  it('round-trips price and yield', () => {
    const p = cleanFromYield(terms, settle, 4.61);
    expect(yieldFromClean(terms, settle, p)).toBeCloseTo(4.61, 8);
  });

  it('computes actual/actual accrued interest', () => {
    // 66 days from Nov 15 to Jan 20 out of a 181-day period.
    expect(accruedInterest(terms, settle)).toBeCloseTo((4.25 / 2) * (66 / 181), 10);
  });

  it('handles end-of-month schedules', () => {
    const eom = { coupon: 3.5, maturity: new Date('2028-09-30T00:00:00Z'), freq: 2 };
    const s = couponSchedule(eom, new Date('2026-10-12T00:00:00Z'));
    expect(s[0].toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(s[1].toISOString().slice(0, 10)).toBe('2027-03-31');
  });

  it('produces consistent duration and DV01', () => {
    const a = analytics(terms, settle, 4.5);
    const up = cleanFromYield(terms, settle, 4.51);
    const dn = cleanFromYield(terms, settle, 4.49);
    expect((dn - up) / 2).toBeCloseTo(a.dv01, 4);
    expect(a.modified).toBeLessThan(a.macaulay);
    expect(a.convexity).toBeGreaterThan(0);
  });

  it('formats coupons and 32nds', () => {
    expect(couponFraction(4.125)).toBe('4 1/8');
    expect(couponFraction(5)).toBe('5');
    expect(to32nds(99.515625)).toBe('99-16+');
    expect(to32nds(101)).toBe('101-00');
  });
});

describe('indicators', () => {
  const xs = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];

  it('computes SMA and EMA', () => {
    expect(sma([1, 2, 3, 4, 5], 3)[4]).toBe(4);
    expect(Number.isNaN(sma([1, 2, 3], 3)[1])).toBe(true);
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e[2]).toBe(2);
    expect(e[3]).toBe(3);
  });

  it('computes Wilder RSI (StockCharts example, unrounded averages)', () => {
    const r = rsi(xs, 14);
    // Average gain 3.34/14, average loss 1.40/14 -> RSI 70.46 (70.53 with rounded averages).
    expect(r[14]).toBeCloseTo(70.464, 2);
  });

  it('keeps Bollinger bands symmetric around the mean', () => {
    const b = bollinger(xs, 10, 2);
    const i = xs.length - 1;
    expect(b.upper[i] - b.mid[i]).toBeCloseTo(b.mid[i] - b.lower[i], 10);
  });

  it('computes MACD histogram as line minus signal', () => {
    const series = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.1);
    const m = macd(series);
    const i = 79;
    expect(m.hist[i]).toBeCloseTo(m.macd[i] - m.signal[i], 10);
  });
});

describe('statistics', () => {
  it('regresses a known line', () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = x.map((v) => 0.5 + 2 * v);
    const r = regress(x, y);
    expect(r.beta).toBeCloseTo(2, 10);
    expect(r.alpha).toBeCloseTo(0.5, 10);
    expect(r.r2).toBeCloseTo(1, 10);
  });

  it('computes correlation, percentiles and drawdowns', () => {
    expect(correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 10);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(maxDrawdown([100, 120, 90, 130, 117])).toBeCloseTo(-0.25, 10);
  });
});
