/**
 * Mean-variance analysis on a set of return series (Markowitz): the efficient frontier, the global minimum-variance
 * portfolio, the equally weighted portfolio, the tangency portfolio, the capital market line and the Sharpe ratio, in
 * the closed forms with A = 1′Σ⁻¹1, B = 1′Σ⁻¹µ, C = µ′Σ⁻¹µ and D = AC − B². Returns, rates and results are per period
 * (monthly returns give monthly figures). Σ is the sample covariance (n − 1), as a spreadsheet's COVARIANCE.S.
 */

export interface PortfolioStats {
  /** Expected return per period, w′µ. */
  ret: number;
  /** Variance per period, w′Σw. */
  variance: number;
  /** Standard deviation per period. */
  sd: number;
}

export interface MeanVariance {
  /** Mean return of each series. */
  mu: number[];
  /** Sample covariance matrix. */
  sigma: number[][];
  A: number;
  B: number;
  C: number;
  D: number;
  /** Global minimum-variance portfolio, Σ⁻¹1 / A. */
  gmvp: number[];
  /** Equal weights, 1/n each. */
  ewp: number[];
  /** Number of return periods. */
  periods: number;
}

/** Sample covariance of equally long series (n − 1 in the denominator). */
export function covariance(series: number[][]): number[][] {
  const k = series.length;
  const n = series[0]?.length ?? 0;
  const means = series.map((s) => s.reduce((a, b) => a + b, 0) / n);
  const out = series.map(() => new Array<number>(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += (series[i][t] - means[i]) * (series[j][t] - means[j]);
      out[i][j] = out[j][i] = s / (n - 1);
    }
  }
  return out;
}

/** Solves M·x = b by Gaussian elimination with partial pivoting; null when M is singular. */
export function solve(m: number[][], b: number[]): number[] | null {
  const n = b.length;
  const a = m.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    const scale = Math.max(...a.map((row) => Math.abs(row[c])));
    if (!(Math.abs(a[p][c]) > 1e-14 * Math.max(1, scale))) return null;
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      if (f) for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let k = r + 1; k < n; k++) s -= a[r][k] * x[k];
    x[r] = s / a[r][r];
  }
  return x;
}

const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const times = (m: number[][], v: number[]) => m.map((row) => dot(row, v));

/** Return, variance and standard deviation of a portfolio with weights w. */
export function portfolioStats(w: number[], mu: number[], sigma: number[][]): PortfolioStats {
  const variance = dot(w, times(sigma, w));
  return { ret: dot(w, mu), variance, sd: Math.sqrt(variance) };
}

/**
 * The analysis of return series of equal length (one per asset): null when there are fewer than two assets, fewer
 * periods than assets plus one, a gap, or a covariance matrix that cannot be inverted (one asset a combination of
 * the others), since none of the closed forms then exists.
 */
export function meanVariance(returns: number[][]): MeanVariance | null {
  const k = returns.length;
  const n = returns[0]?.length ?? 0;
  if (k < 2 || n < k + 1 || returns.some((r) => r.length !== n || r.some((v) => !Number.isFinite(v)))) return null;
  const mu = returns.map((r) => r.reduce((a, b) => a + b, 0) / n);
  const sigma = covariance(returns);
  const one = new Array<number>(k).fill(1);
  const s1 = solve(sigma, one);
  const sMu = solve(sigma, mu);
  if (!s1 || !sMu) return null;
  const A = dot(one, s1);
  const B = dot(one, sMu);
  const C = dot(mu, sMu);
  const D = A * C - B * B;
  if (!(A > 0) || !(D > 0)) return null;
  return { mu, sigma, A, B, C, D, gmvp: s1.map((v) => v / A), ewp: one.map(() => 1 / k), periods: n };
}

/** The frontier's standard deviation at an expected return µp: √((A·µp² − 2·B·µp + C) / D). */
export function frontierSd(mv: MeanVariance, ret: number): number {
  return Math.sqrt((mv.A * ret * ret - 2 * mv.B * ret + mv.C) / mv.D);
}

/**
 * The tangency portfolio for a risk-free rate rf, Σ⁻¹(µ − rf·1) / (B − A·rf). It is the frontier's maximum-Sharpe
 * portfolio only when rf is below the minimum-variance portfolio's return (B/A); otherwise null.
 */
export function tangency(mv: MeanVariance, rf: number): number[] | null {
  const denom = mv.B - mv.A * rf;
  if (!(denom > 0)) return null;
  const x = solve(mv.sigma, mv.mu.map((m) => m - rf));
  return x ? x.map((v) => v / denom) : null;
}

/** The slope of the capital market line, √(C − 2·rf·B + rf²·A): the tangency portfolio's Sharpe ratio. */
export function cmlSlope(mv: MeanVariance, rf: number): number {
  return Math.sqrt(mv.C - 2 * rf * mv.B + rf * rf * mv.A);
}

/** Sharpe ratio, (µp − rf) / σp. */
export function sharpe(stats: PortfolioStats, rf: number): number {
  return (stats.ret - rf) / stats.sd;
}

/**
 * The minimum-variance portfolio with no short positions (weights at least zero, summing to one), as a spreadsheet
 * solver gives with non-negative weights: an active-set method that frees or fixes one asset at a time until the
 * Kuhn-Tucker conditions hold. Null when Σ cannot be inverted on the assets kept.
 */
export function minVarianceLongOnly(sigma: number[][]): number[] | null {
  const k = sigma.length;
  const free = new Set(Array.from({ length: k }, (_, i) => i));
  for (let iter = 0; iter < 4 * k + 10; iter++) {
    const idx = [...free].sort((a, b) => a - b);
    const sub = idx.map((i) => idx.map((j) => sigma[i][j]));
    const x = solve(sub, idx.map(() => 1));
    if (!x) return null;
    const a = x.reduce((s, v) => s + v, 0);
    const w = new Array<number>(k).fill(0);
    idx.forEach((i, n) => (w[i] = x[n] / a));
    // A free asset below zero leaves first (the most negative).
    let worst = -1;
    for (const i of idx) if (w[i] < -1e-12 && (worst < 0 || w[i] < w[worst])) worst = i;
    if (worst >= 0) {
      free.delete(worst);
      continue;
    }
    // A fixed asset whose marginal variance is below the free assets' would lower the variance: it comes back in.
    const g = times(sigma, w);
    const lambda = idx.length ? g[idx[0]] : 0;
    let enter = -1;
    for (let i = 0; i < k; i++) if (!free.has(i) && g[i] < lambda - 1e-14 && (enter < 0 || g[i] < g[enter])) enter = i;
    if (enter < 0) return w;
    free.add(enter);
  }
  return null;
}

/** Simple returns of a price series, p[t] / p[t − 1] − 1. */
export function periodReturns(prices: number[]): number[] {
  return prices.slice(1).map((p, i) => p / prices[i] - 1);
}
