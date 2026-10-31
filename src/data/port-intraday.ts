/**
 * PORT's Intraday tab (PT_PORT_Enterprise_attribution 0:09): the portfolio against its benchmark by GICS sector, as
 * counts, weights and contributions to the day's return, with the differences. A weight is a share of market value
 * in percent; a contribution is weight × the day's return, in percentage points; a bucket's return is its
 * contribution over its weight.
 */

export interface PortLine {
  id?: string;
  name: string;
  bucket: string;
  /** Percent of the side's total. */
  weight: number;
  /** The day's return, percent. */
  ret: number;
}

export interface Bucket {
  name: string;
  nPort: number;
  nBench: number;
  wPort: number;
  wBench: number;
  wDiff: number;
  ctrPort: number;
  ctrBench: number;
  ctrDiff: number;
  retPort: number;
  retBench: number;
  retDiff: number;
  /** The portfolio's own lines in the bucket, largest weight first. */
  lines: (PortLine & { ctr: number; wBench: number })[];
}

/** The eleven GICS sectors, in the order the frame lists them. */
export const GICS_SECTORS = [
  'Communication Services',
  'Consumer Discretionary',
  'Consumer Staples',
  'Energy',
  'Financials',
  'Health Care',
  'Industrials',
  'Information Technology',
  'Materials',
  'Real Estate',
  'Utilities',
];

const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/** Weights in percent from market values; lines without one are left at NaN and out of the total. */
export function toWeights<T extends { mv: number }>(rows: T[]): (T & { weight: number })[] {
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.mv) ? r.mv : 0), 0);
  return rows.map((r) => ({ ...r, weight: total > 0 && Number.isFinite(r.mv) ? (r.mv / total) * 100 : NaN }));
}

/** One bucket per name in `order`, then any others the two sides use, and the total. */
export function buckets(port: PortLine[], bench: PortLine[], order: string[] = GICS_SECTORS): { rows: Bucket[]; total: Bucket } {
  const names = [...order, ...[...new Set([...port, ...bench].map((l) => l.bucket))].filter((n) => !order.includes(n)).sort()];
  const benchById = new Map(bench.filter((b) => b.id).map((b) => [b.id!, b.weight]));
  const make = (name: string, p: PortLine[], b: PortLine[]): Bucket => {
    const wPort = p.reduce((a, l) => a + finite(l.weight), 0);
    const wBench = b.reduce((a, l) => a + finite(l.weight), 0);
    const ctrPort = p.reduce((a, l) => a + finite((l.weight * l.ret) / 100), 0);
    const ctrBench = b.reduce((a, l) => a + finite((l.weight * l.ret) / 100), 0);
    const retPort = wPort > 0 ? (ctrPort / wPort) * 100 : NaN;
    const retBench = wBench > 0 ? (ctrBench / wBench) * 100 : NaN;
    return {
      name,
      nPort: p.length,
      nBench: b.length,
      wPort,
      wBench,
      wDiff: wPort - wBench,
      ctrPort,
      ctrBench,
      ctrDiff: ctrPort - ctrBench,
      retPort,
      retBench,
      retDiff: retPort - retBench,
      lines: p
        .map((l) => ({ ...l, ctr: (l.weight * l.ret) / 100, wBench: l.id ? benchById.get(l.id) ?? 0 : 0 }))
        .sort((x, y) => finite(y.weight) - finite(x.weight)),
    };
  };
  const rows = names
    .map((n) => make(n, port.filter((l) => l.bucket === n), bench.filter((l) => l.bucket === n)))
    .filter((r) => r.nPort > 0 || r.nBench > 0 || order.includes(r.name));
  return { rows, total: make('Total', port, bench) };
}

/** The largest moves first, either way: CTR Movers. */
export function movers<T>(items: T[], value: (t: T) => number, n = 5): T[] {
  return items.filter((t) => Number.isFinite(value(t)) && value(t) !== 0).sort((a, b) => Math.abs(value(b)) - Math.abs(value(a))).slice(0, n);
}
