import { describe, expect, it } from 'vitest';
import { americanImpliedVol, americanOption, americanPrice, deterministicAmerican } from '../src/finance/american-options';
import { blackScholes, type OptType } from '../src/finance/options';
import { equityExpiryTimestamp, expiries } from '../src/data/options';
import reference from './fixtures/american-options.json';

describe('American option values against an independent finite-difference PDE solver', () => {
  for (const c of reference.cases) it(`${c.type} S=${c.spot} K=${c.strike}, ${c.days} days, r=${c.rate}, q=${c.dividend}, vol=${c.vol}`, () => {
    const input = [c.type as OptType, c.spot, c.strike, c.days / 365, c.rate, c.dividend, c.vol] as const;
    expect(Math.abs(americanPrice(...input, 800) - c.price)).toBeLessThan(0.008);
    expect(Math.abs(americanPrice(...input) - c.price)).toBeLessThan(0.025);
    const g = americanOption(...input, 800);
    expect(Math.abs(g.delta - c.delta)).toBeLessThan(0.006);
    expect(Math.abs(g.gamma - c.gamma)).toBeLessThan(0.0015);
  });

  it('agrees with PDE delta/theta and reports finite grid risk diagnostics', () => {
    const c = reference.cases[1];
    const g = americanOption('P', c.spot, c.strike, c.days / 365, c.rate, c.dividend, c.vol, 800);
    expect(Math.abs(g.delta - c.delta)).toBeLessThan(0.005);
    expect(Math.abs(g.gamma - c.gamma)).toBeLessThan(0.001);
    expect(Math.abs(g.theta - c.theta)).toBeLessThan(0.0005);
    expect(g.vega).toBeGreaterThan(0);
    expect(g.rho).toBeLessThan(0);
    expect(g.gridDifference).toBeGreaterThanOrEqual(0);
    expect(g.earlyExercisePremium).toBeGreaterThan(0);
    // In particular, default-resolution gamma must not reproduce lattice strike-alignment spikes.
    expect(Math.abs(americanOption('P', c.spot, c.strike, c.days / 365, c.rate, c.dividend, c.vol).gamma - c.gamma)).toBeLessThan(0.001);
  });
});

describe('exercise boundaries, dividends and invalid inputs', () => {
  it('uses exact European values when early exercise is never optimal', () => {
    for (const [type, r, q] of [['C', 0.05, 0], ['C', 0.05, -0.02], ['P', -0.02, 0.01]] as const) {
      expect(americanOption(type, 100, 100, 1, r, q, 0.2)).toMatchObject(blackScholes(type, 100, 100, 1, r, q, 0.2));
    }
  });

  it('finds a deterministic interior exercise optimum as well as immediate and terminal exercise', () => {
    // Discounted deterministic put = 100 exp(-0.1t) - 100 exp(-0.2t), maximum 25 at t=log(2)/0.1.
    expect(deterministicAmerican('P', 100, 100, 10, 0.1, 0.2)).toBeCloseTo(25, 10);
    expect(americanPrice('P', 100, 100, 10, 0.1, 0.2, 0)).toBeCloseTo(25, 10);
    expect(americanPrice('P', 50, 100, 1, 0.05, 0, 0)).toBe(50);
    expect(americanPrice('C', 100, 100, 1, 0.05, 0, 0)).toBeCloseTo(100 - 100 * Math.exp(-0.05), 10);
    expect(americanPrice('P', 100, 100, 10, 0.1, 0.2, 1e-7)).toBeCloseTo(25, 3);
  });

  it('recognises immediate exercise, expiry and bounded zero-volatility Greeks', () => {
    const g = americanOption('P', 50, 100, 1, 0.05, 0, 0.2);
    expect(g.price).toBeCloseTo(50, 10);
    expect(g.exerciseNow).toBe(true);
    expect(g.delta).toBeCloseTo(-1, 10);
    expect(g.gamma).toBeCloseTo(0, 10);
    expect(americanPrice('C', 110, 100, 0, 0.05, 0.02, 0.2)).toBe(10);
    expect(americanPrice('P', 90, 100, 0, 0.05, 0.02, 0.2)).toBe(10);
    expect(americanOption('P', 100, 100, 1, 0.05, 0, 0).gamma).toBeNaN();
  });

  it('respects model bounds and homogeneity under dividends and negative rates', () => {
    for (const c of reference.cases) {
      const type = c.type as OptType;
      const p = americanPrice(type, c.spot, c.strike, c.days / 365, c.rate, c.dividend, c.vol);
      const eur = blackScholes(type, c.spot, c.strike, c.days / 365, c.rate, c.dividend, c.vol).price;
      expect(p).toBeGreaterThanOrEqual(eur);
      expect(p).toBeGreaterThanOrEqual(Math.max(0, type === 'C' ? c.spot - c.strike : c.strike - c.spot));
      expect(americanPrice(type, c.spot * 10, c.strike * 10, c.days / 365, c.rate, c.dividend, c.vol)).toBeCloseTo(p * 10, 8);
    }
  });

  it('rejects invalid model inputs and overflowing grids without clamping', () => {
    for (const [s, k, t, r, q, v, n] of [[0, 100, 1, .05, 0, .2, 400], [100, -1, 1, .05, 0, .2, 400], [100, 100, -1, .05, 0, .2, 400], [100, 100, 1, NaN, 0, .2, 400], [100, 100, 1, .05, 0, -.1, 400], [100, 100, 1, .05, 0, .2, 1], [100, 100, 100, .05, 0, 64, 400]]) expect(americanPrice('P', s, k, t, r, q, v, n)).toBeNaN();
  });
});

describe('American implied volatility and expiry clocks', () => {
  it('recovers volatility from independent PDE premiums, rather than a European inversion', () => {
    for (const c of [reference.cases[0], reference.cases[1], reference.cases[2]]) {
      const iv = americanImpliedVol(c.type as OptType, c.price, c.spot, c.strike, c.days / 365, c.rate, c.dividend, 800);
      expect(Math.abs(iv - c.vol)).toBeLessThan(0.0005);
    }
  });

  it('rejects ambiguous exercise-floor, out-of-bounds and expired premiums', () => {
    for (const premium of [49, 50, 100, 101, NaN]) expect(americanImpliedVol('P', premium, 50, 100, 1, .05, 0)).toBeNaN();
    expect(americanImpliedVol('P', 5, 100, 100, 0, .05, 0)).toBeNaN();
    const price = americanPrice('P', 100, 100, 1, .05, 0, .35);
    expect(americanImpliedVol('P', price, 100, 100, 1, .05, 0)).toBeCloseTo(.35, 7);
  });

  it('uses 16:00 New York with winter and summer offsets and rejects rolled calendar dates', () => {
    expect(new Date(equityExpiryTimestamp('2026-01-16')).toISOString()).toBe('2026-01-16T21:00:00.000Z');
    expect(new Date(equityExpiryTimestamp('2026-07-17')).toISOString()).toBe('2026-07-17T20:00:00.000Z');
    expect(equityExpiryTimestamp('2026-02-31')).toBeNaN();
    const list = expiries(Date.parse('2026-11-06T20:30:00Z'));
    expect(list[0]).toBe(Date.parse('2026-11-06T21:00:00Z'));
  });
});
