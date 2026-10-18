/** Black-Scholes-Merton pricing with continuous dividend yield. */

export type OptType = 'C' | 'P';

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  /** Per 1 vol point (0.01). */
  vega: number;
  /** Per calendar day. */
  theta: number;
  /** Per 1% rate move. */
  rho: number;
}

/** Standard normal CDF (Hart / West approximation, ~1e-15 accuracy). */
export function normCdf(x: number): number {
  const z = Math.abs(x);
  let c: number;
  if (z > 37) {
    c = 0;
  } else {
    const e = Math.exp(-(z * z) / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      c = (e * n) / d;
    } else {
      let f = z + 0.65;
      f = z + 4 / f;
      f = z + 3 / f;
      f = z + 2 / f;
      f = z + 1 / f;
      c = e / f / 2.506628274631;
    }
  }
  return x <= 0 ? c : 1 - c;
}

export const normPdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/**
 * @param S spot, K strike, T years, r rate (decimal), q dividend yield (decimal), v vol (decimal)
 */
export function blackScholes(type: OptType, S: number, K: number, T: number, r: number, q: number, v: number): Greeks {
  const missing = { price: NaN, delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN };
  if (!['C', 'P'].includes(type) || ![S, K, T, r, q, v].every(Number.isFinite) || S <= 0 || K <= 0 || T < 0 || v < 0) return missing;
  if (T === 0) {
    const intrinsic = type === 'C' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const itm = S === K ? 0.5 : intrinsic > 0 ? 1 : 0;
    return { price: intrinsic, delta: type === 'C' ? itm : -itm, gamma: S === K ? NaN : 0, vega: 0, theta: NaN, rho: 0 };
  }
  if (v === 0) {
    const a = S * Math.exp(-q * T);
    const b = K * Math.exp(-r * T);
    const diff = type === 'C' ? a - b : b - a;
    const weight = Math.abs(a - b) < 1e-12 * Math.max(a, b) ? 0.5 : diff > 0 ? 1 : 0;
    const sign = type === 'C' ? 1 : -1;
    return {
      price: Math.max(0, diff), delta: sign * Math.exp(-q * T) * weight,
      gamma: weight === 0.5 ? NaN : 0,
      vega: weight === 0.5 ? a * normPdf(0) * Math.sqrt(T) / 100 : 0,
      theta: sign * (q * a - r * b) * weight / 365,
      rho: sign * K * T * Math.exp(-r * T) * weight / 100,
    };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * v * v) * T) / (v * sq);
  const d2 = d1 - v * sq;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const pdf = normPdf(d1);
  const gamma = (dq * pdf) / (S * v * sq);
  const vega = (S * dq * pdf * sq) / 100;
  if (type === 'C') {
    const price = S * dq * normCdf(d1) - K * dr * normCdf(d2);
    const theta = (-(S * dq * pdf * v) / (2 * sq) - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1)) / 365;
    return { price, delta: dq * normCdf(d1), gamma, vega, theta, rho: (K * T * dr * normCdf(d2)) / 100 };
  }
  const price = K * dr * normCdf(-d2) - S * dq * normCdf(-d1);
  const theta = (-(S * dq * pdf * v) / (2 * sq) + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1)) / 365;
  return { price, delta: -dq * normCdf(-d1), gamma, vega, theta, rho: (-K * T * dr * normCdf(-d2)) / 100 };
}

/** Implied volatility by bisection; returns NaN when the price is outside no-arbitrage bounds. */
export function impliedVol(type: OptType, price: number, S: number, K: number, T: number, r: number, q: number): number {
  if (!['C', 'P'].includes(type) || ![price, S, K, T, r, q].every(Number.isFinite) || price < 0 || S <= 0 || K <= 0 || T <= 0) return NaN;
  const lower = type === 'C' ? Math.max(S * Math.exp(-q * T) - K * Math.exp(-r * T), 0) : Math.max(K * Math.exp(-r * T) - S * Math.exp(-q * T), 0);
  const upper = type === 'C' ? S * Math.exp(-q * T) : K * Math.exp(-r * T);
  const eps = 1e-10 * Math.max(1, upper);
  if (price < lower - eps || price >= upper) return NaN;
  if (Math.abs(price - lower) <= eps) return 0;
  let lo = 0;
  let hi = 1;
  while (hi < 64 && blackScholes(type, S, K, T, r, q, hi).price < price) hi *= 2;
  if (blackScholes(type, S, K, T, r, q, hi).price < price) return NaN;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (blackScholes(type, S, K, T, r, q, mid).price > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}
