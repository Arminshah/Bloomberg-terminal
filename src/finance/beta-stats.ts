// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * BETA's statistics panel (Babson's "WACC Components in Bloomberg" p.5, March 2022): the ordinary least squares fit
 * of the security's returns (Y) on the index's (X), in percent, with the standard errors, the t-test on beta and its
 * two-tailed significance, and where the last point sits: its residual in standard deviations of the errors (Last
 * T-Value) and the share of the t distribution below that (Last P-Value). The frame's Last T-Value of 1.473 with a Last
 * P-Value of 0.929 over 260 points is that distribution function.
 */

/** ln Γ(z), Lanczos approximation (g = 7, nine terms). */
function lnGamma(z: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The continued fraction of the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** The regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (!(x > 0)) return 0;
  if (!(x < 1)) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaContinuedFraction(x, a, b)) / a : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Student's t distribution function: P(T ≤ t) with `df` degrees of freedom. */
export function tCdf(t: number, df: number): number {
  if (!Number.isFinite(t) || !(df > 0)) return NaN;
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}

export interface BetaStats {
  beta: number;
  adjusted: number;
  /** Intercept, percent per period. */
  alpha: number;
  r2: number;
  r: number;
  /** Standard deviation of the residuals, percent. */
  sdError: number;
  seAlpha: number;
  seBeta: number;
  /** beta / its standard error. */
  tTest: number;
  /** Two-tailed p-value of the t-test. */
  significance: number;
  /** The last point's residual in standard deviations of the errors. */
  lastT: number;
  /** P(T ≤ Last T-Value). */
  lastP: number;
  n: number;
}

/** OLS of y on x (both percent returns, aligned), with the panel's statistics. */
export function betaStats(x: readonly number[], y: readonly number[]): BetaStats {
  const n = Math.min(x.length, y.length);
  const none: BetaStats = { beta: NaN, adjusted: NaN, alpha: NaN, r2: NaN, r: NaN, sdError: NaN, seAlpha: NaN, seBeta: NaN, tTest: NaN, significance: NaN, lastT: NaN, lastP: NaN, n };
  if (n < 3) return none;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  if (!(sxx > 0)) return none;
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - alpha - beta * x[i]) ** 2;
  const df = n - 2;
  const s = Math.sqrt(sse / df);
  const seBeta = s / Math.sqrt(sxx);
  const seAlpha = s * Math.sqrt(1 / n + (mx * mx) / sxx);
  const tTest = beta / seBeta;
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  const lastT = s > 0 ? (y[n - 1] - alpha - beta * x[n - 1]) / s : NaN;
  return {
    beta,
    adjusted: 0.67 * beta + 0.33,
    alpha,
    r2: r * r,
    r,
    sdError: s,
    seAlpha,
    seBeta,
    tTest,
    significance: Number.isFinite(tTest) ? 2 * (1 - tCdf(Math.abs(tTest), df)) : NaN,
    lastT,
    lastP: tCdf(lastT, df),
    n,
  };
}

/** Counts of values in `bins` equal bins from lo to hi (the top edge in the last bin). */
export function histogram(values: readonly number[], lo: number, hi: number, bins: number): number[] {
  const out = new Array<number>(bins).fill(0);
  if (!(hi > lo) || bins < 1) return out;
  for (const v of values) {
    if (!Number.isFinite(v) || v < lo || v > hi) continue;
    out[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
  }
  return out;
}
