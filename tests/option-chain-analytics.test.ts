import { describe, expect, it } from 'vitest';
import { black76, black76Greeks, black76Vol, chainImplied, continuousRate, impliedForward, mid, rateAt, standardRoot, type ChainQuote } from '../src/finance/option-chain-analytics';

const YEAR = 365 * 86_400_000;

describe("Black's formula on a forward", () => {
  it('keeps put-call parity, C − P = D(F − K)', () => {
    for (const [F, K, T, D, v] of [[100, 90, 0.5, 0.98, 0.3], [100, 120, 2, 0.9, 0.15], [523, 470, 0.05, 0.996, 0.35]]) {
      expect(black76('C', F, K, T, D, v) - black76('P', F, K, T, D, v)).toBeCloseTo(D * (F - K), 10);
    }
  });

  it('inverts its own prices across strikes, maturities and volatilities', () => {
    for (const type of ['C', 'P'] as const) {
      for (const K of [60, 95, 100, 105, 160]) {
        for (const T of [2 / 365, 0.25, 3]) {
          for (const v of [0.08, 0.3, 1.2]) {
            const price = black76(type, 100, K, T, 0.97, v);
            // Far from the money a price is all intrinsic value (or none): no time value left to invert.
            if (price - 0.97 * Math.max(0, type === 'C' ? 100 - K : K - 100) < 1e-6) continue;
            expect(black76Vol(type, price, 100, K, T, 0.97)).toBeCloseTo(v, 5);
          }
        }
      }
    }
  });

  it('gives no volatility for a premium at or beyond its no-arbitrage bounds', () => {
    // Below the discounted intrinsic value, at the cap, zero, or without a forward.
    expect(black76Vol('C', 0.98 * 10 - 0.01, 110, 100, 0.5, 0.98)).toBeNaN();
    expect(black76Vol('P', 0.98 * 100, 110, 100, 0.5, 0.98)).toBeNaN();
    expect(black76Vol('C', 0, 110, 100, 0.5, 0.98)).toBeNaN();
    expect(black76Vol('C', 5, NaN, 100, 0.5, 0.98)).toBeNaN();
  });

  it('gives spot delta and gamma that match a bumped spot, and vega per volatility point', () => {
    const S = 100;
    const T = 0.5;
    const r = 0.04;
    const q = 0.01;
    const D = Math.exp(-r * T);
    const F = (s: number) => s * Math.exp((r - q) * T);
    const v = 0.25;
    const g = black76Greeks('C', F(S), 105, T, D, v, S);
    const h = 0.01;
    const up = black76('C', F(S + h), 105, T, D, v);
    const down = black76('C', F(S - h), 105, T, D, v);
    expect(g.delta).toBeCloseTo((up - down) / (2 * h), 5);
    expect(g.gamma).toBeCloseTo((up - 2 * black76('C', F(S), 105, T, D, v) + down) / (h * h), 3);
    expect(g.vega).toBeCloseTo((black76('C', F(S), 105, T, D, v + 0.005) - black76('C', F(S), 105, T, D, v - 0.005)) / 1, 4);
    expect(black76Greeks('P', F(S), 105, T, D, v, S).delta).toBeCloseTo(g.delta - Math.exp(-q * T), 10);
    // Without the underlying's price there is no spot delta or gamma; vega needs none.
    const blind = black76Greeks('C', F(S), 105, T, D, v, NaN);
    expect(blind.delta).toBeNaN();
    expect(blind.vega).toBeCloseTo(g.vega, 12);
  });
});

describe('rates and forwards', () => {
  const curve = [{ years: 0.25, pct: 4.16 }, { years: 0.5, pct: 4.25 }, { years: 2, pct: 4.56 }, { years: 30, pct: 5.31 }];

  it('interpolates the par curve linearly and holds it flat beyond its ends', () => {
    expect(rateAt(curve, 0.02)).toBe(4.16);
    expect(rateAt(curve, 0.375)).toBeCloseTo(4.205, 10);
    expect(rateAt(curve, 1.25)).toBeCloseTo(4.405, 10);
    expect(rateAt(curve, 40)).toBe(5.31);
    expect(rateAt([{ years: 1, pct: NaN }], 1)).toBeNaN();
    // A semiannual par yield of 4% is 2·ln(1.02) continuously compounded.
    expect(continuousRate(4)).toBeCloseTo(2 * Math.log(1.02), 12);
  });

  it('recovers the forward from call and put mids at the money and ignores strikes without both', () => {
    const D = 0.99;
    const F = 101.3;
    const pairs = [80, 95, 100, 105, 120].map((K) => ({ strike: K, call: black76('C', F, K, 0.25, D, 0.3), put: black76('P', F, K, 0.25, D, 0.3) }));
    expect(impliedForward([...pairs, { strike: 101, call: NaN, put: 3 }], D)).toEqual({ forward: expect.closeTo(F, 8), pairs: 3 });
    // A stale far strike does not move the median of the three nearest the money.
    pairs[0].call += 5;
    expect(impliedForward(pairs, D).forward).toBeCloseTo(F, 8);
    expect(impliedForward([], D)).toEqual({ forward: NaN, pairs: 0 });
    expect(impliedForward(pairs, NaN)).toEqual({ forward: NaN, pairs: 0 });
  });

  it('takes a mid only from a two-sided quote', () => {
    expect(mid({ bid: 1.2, ask: 1.4 })).toBeCloseTo(1.3, 12);
    expect(mid({ bid: 0, ask: 0.05 })).toBeNaN();
    expect(mid({ bid: NaN, ask: 1 })).toBeNaN();
    expect(mid({ bid: 1.5, ask: 1.4 })).toBeNaN();
  });

  it("knows a standard root from an adjusted one", () => {
    expect(standardRoot('BRKB', 'BRK.B')).toBe(true);
    expect(standardRoot('NDXP', 'NDX')).toBe(true);
    expect(standardRoot('AAPL1', 'AAPL')).toBe(false);
  });
});

describe('a whole chain', () => {
  const valuedAt = Date.UTC(2026, 9, 30, 20);
  const expiryAt = (expiry: string) => Date.parse(`${expiry}T21:00:00Z`);
  const curve = [{ years: 0.25, pct: 4.16 }, { years: 1, pct: 4.36 }];
  // A synthetic chain priced at a 30% smile-free volatility on a forward of 252, quoted a cent either side.
  const chain = (expiry: string, F: number, vol: number, root = 'XYZ'): ChainQuote[] => {
    const years = (expiryAt(expiry) - valuedAt) / YEAR;
    const D = Math.exp(-continuousRate(rateAt(curve, years)) * years);
    return [200, 230, 245, 250, 255, 260, 280, 320].flatMap((strike) => (['C', 'P'] as const).map((type) => {
      const value = black76(type, F, strike, years, D, vol);
      return { symbol: `${root}${expiry}${type}${strike}`, root, expiry, type, strike, bid: Math.max(0, value - 0.01), ask: value + 0.01 };
    }));
  };

  it('finds each expiry forward and every two-sided contract volatility', () => {
    const out = chainImplied([...chain('2026-11-20', 252, 0.3), ...chain('2027-01-15', 254, 0.28)], { underlying: 'XYZ', valuedAt, spot: 251, curve, expiryAt });
    expect(out.expiries.map((e) => [e.expiry, e.pairs])).toEqual([['2026-11-20', 3], ['2027-01-15', 3]]);
    expect(out.expiries[0].forward).toBeCloseTo(252, 1);
    expect(out.expiries[1].forward).toBeCloseTo(254, 1);
    expect(out.expiries[0].ratePct).toBe(4.16); // shorter than three months: the 3-month yield
    for (const [symbol, x] of out.contracts) {
      const near = /C2[45]\d$|P2[45]\d$/.test(symbol);
      if (near) expect(Math.abs(x.iv - (symbol.includes('2026-11') ? 0.3 : 0.28))).toBeLessThan(0.003);
    }
    const atm = out.contracts.get('XYZ2026-11-20C250')!;
    expect(atm.delta).toBeGreaterThan(0.5);
    expect(atm.delta).toBeLessThan(0.6);
  });

  it('leaves out adjusted roots, expired contracts and every volatility when there is no rate', () => {
    const adjusted = chain('2026-11-20', 252, 0.3, 'XYZ1');
    const expired = chain('2026-10-30', 252, 0.3).map((q) => ({ ...q, expiry: '2026-10-29' }));
    const out = chainImplied([...adjusted, ...expired, ...chain('2026-11-20', 252, 0.3)], { underlying: 'XYZ', valuedAt, spot: 251, curve, expiryAt });
    expect(out.expiries.map((e) => e.key)).toEqual(['2026-11-20|XYZ']);
    expect([...out.contracts.keys()].some((k) => k.startsWith('XYZ1'))).toBe(false);
    const blind = chainImplied(chain('2026-11-20', 252, 0.3), { underlying: 'XYZ', valuedAt, spot: 251, curve: [], expiryAt });
    expect(blind.expiries[0].forward).toBeNaN();
    expect(blind.contracts.size).toBe(0);
  });
});
