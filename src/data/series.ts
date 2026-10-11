/** Struct-of-arrays OHLCV series. `length` may be less than the capacity. */
export interface Series {
  t: Float64Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
  length: number;
  /** Nominal bar duration in ms. */
  span: number;
}

export function makeSeries(capacity: number, span: number): Series {
  return {
    t: new Float64Array(capacity),
    o: new Float64Array(capacity),
    h: new Float64Array(capacity),
    l: new Float64Array(capacity),
    c: new Float64Array(capacity),
    v: new Float64Array(capacity),
    length: 0,
    span,
  };
}

/** Copy of the window [from, to) as a compact series. */
export function sliceSeries(s: Series, from: number, to = s.length): Series {
  const a = Math.max(0, from);
  const b = Math.min(s.length, to);
  const n = Math.max(0, b - a);
  const out = makeSeries(n, s.span);
  out.t.set(s.t.subarray(a, b));
  out.o.set(s.o.subarray(a, b));
  out.h.set(s.h.subarray(a, b));
  out.l.set(s.l.subarray(a, b));
  out.c.set(s.c.subarray(a, b));
  out.v.set(s.v.subarray(a, b));
  out.length = n;
  return out;
}

/** Index of the last bar with t <= time, or -1. */
export function indexAtOrBefore(s: Series, time: number): number {
  let lo = 0;
  let hi = s.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (s.t[mid] <= time) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export type Periodicity = 'D' | 'W' | 'M' | 'Q' | 'Y';

function bucketKey(t: number, p: Periodicity): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (p) {
    case 'W': {
      // Monday-based week number from the epoch (day 4 was a Monday).
      const day = Math.floor(t / 86_400_000);
      return Math.floor((day - 4) / 7);
    }
    case 'M':
      return y * 12 + m;
    case 'Q':
      return y * 4 + Math.floor(m / 3);
    case 'Y':
      return y;
    default:
      return Math.floor(t / 86_400_000);
  }
}

/** Aggregates daily bars into weekly/monthly/quarterly/yearly bars. */
export function aggregate(s: Series, p: Periodicity): Series {
  if (p === 'D') return s;
  const out = makeSeries(s.length, s.span * (p === 'W' ? 7 : p === 'M' ? 30 : p === 'Q' ? 91 : 365));
  let key = NaN;
  let n = -1;
  for (let i = 0; i < s.length; i++) {
    const k = bucketKey(s.t[i], p);
    if (k !== key) {
      n++;
      key = k;
      out.t[n] = s.t[i];
      out.o[n] = s.o[i];
      out.h[n] = s.h[i];
      out.l[n] = s.l[i];
      out.v[n] = 0;
    }
    out.h[n] = Math.max(out.h[n], s.h[i]);
    out.l[n] = Math.min(out.l[n], s.l[i]);
    out.c[n] = s.c[i];
    out.v[n] += s.v[i];
  }
  out.length = n + 1;
  return out;
}
