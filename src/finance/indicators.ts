/** Technical studies. Outputs are aligned with the input; warm-up entries are NaN. */

export function sma(xs: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= n) s -= xs[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function ema(xs: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN);
  if (xs.length < n) return out;
  const k = 2 / (n + 1);
  let s = 0;
  for (let i = 0; i < n; i++) s += xs[i];
  let e = s / n;
  out[n - 1] = e;
  for (let i = n; i < xs.length; i++) {
    e = xs[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

export function bollinger(xs: ArrayLike<number>, n = 20, mult = 2): { mid: Float64Array; upper: Float64Array; lower: Float64Array } {
  const mid = sma(xs, n);
  const upper = new Float64Array(xs.length).fill(NaN);
  const lower = new Float64Array(xs.length).fill(NaN);
  for (let i = n - 1; i < xs.length; i++) {
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (xs[j] - mid[i]) ** 2;
    const sd = Math.sqrt(v / n);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's RSI. */
export function rsi(xs: ArrayLike<number>, n = 14): Float64Array {
  const out = new Float64Array(xs.length).fill(NaN);
  if (xs.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = xs[i] - xs[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(xs: ArrayLike<number>, fast = 12, slow = 26, signal = 9): { macd: Float64Array; signal: Float64Array; hist: Float64Array } {
  const ef = ema(xs, fast);
  const es = ema(xs, slow);
  const line = new Float64Array(xs.length).fill(NaN);
  for (let i = 0; i < xs.length; i++) line[i] = ef[i] - es[i];
  const start = slow - 1;
  const sig = new Float64Array(xs.length).fill(NaN);
  if (xs.length > start + signal) {
    const tail = line.subarray(start);
    const e = ema(tail, signal);
    sig.set(e, start);
  }
  const hist = new Float64Array(xs.length).fill(NaN);
  for (let i = 0; i < xs.length; i++) hist[i] = line[i] - sig[i];
  return { macd: line, signal: sig, hist };
}
