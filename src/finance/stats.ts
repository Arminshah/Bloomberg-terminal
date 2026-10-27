/** Statistics on numeric arrays. NaN entries are the caller's responsibility. */

export function mean(xs: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return xs.length ? s / xs.length : NaN;
}

export function stdev(xs: ArrayLike<number>): number {
  const n = xs.length;
  if (n < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - m) ** 2;
  return Math.sqrt(s / (n - 1));
}

export function logReturns(closes: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(Math.log(closes[i] / closes[i - 1]));
  return out;
}

export function simpleReturns(closes: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] / closes[i - 1] - 1);
  return out;
}

export function correlation(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return cov / Math.sqrt(va * vb);
}

export interface Regression {
  beta: number;
  alpha: number;
  r2: number;
  stdErr: number;
  n: number;
  corr: number;
}

/** OLS of y on x (y = alpha + beta x). */
export function regress(x: ArrayLike<number>, y: ArrayLike<number>): Regression {
  const n = Math.min(x.length, y.length);
  const mx = mean(Array.from({ length: n }, (_, i) => x[i]));
  const my = mean(Array.from({ length: n }, (_, i) => y[i]));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (y[i] - alpha - beta * x[i]) ** 2;
  const r2 = 1 - sse / syy;
  const stdErr = Math.sqrt(sse / (n - 2) / sxx);
  return { beta, alpha, r2, stdErr, n, corr: sxy / Math.sqrt(sxx * syy) };
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/**
 * Where a value ranks in a set that holds it, as Excel's PERCENTRANK.INC: the share of the other values below it,
 * (values below) / (count − 1), from 0 (the lowest) to 1 (the highest); equal values share a rank. NaN for a value
 * not in the set or a set of one. Values that are not finite are left out.
 */
export function percentRank(xs: readonly number[], v: number): number {
  const s = xs.filter((x) => Number.isFinite(x));
  if (!Number.isFinite(v) || s.length < 2 || !s.includes(v)) return NaN;
  return s.filter((x) => x < v).length / (s.length - 1);
}

export function median(xs: number[]): number {
  return percentile(xs.filter((x) => Number.isFinite(x)), 0.5);
}

/** Maximum peak-to-trough decline as a negative fraction. */
export function maxDrawdown(closes: ArrayLike<number>): number {
  let peak = -Infinity;
  let dd = 0;
  for (let i = 0; i < closes.length; i++) {
    peak = Math.max(peak, closes[i]);
    dd = Math.min(dd, closes[i] / peak - 1);
  }
  return dd;
}
