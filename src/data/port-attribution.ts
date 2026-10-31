import type { Bucket } from './port-intraday';

/**
 * PORT's Attribution tab: the portfolio's return against its benchmark's, split by bucket into Allocation and
 * Selection (the two-effect Brinson-Fachler model, interaction counted in selection), so the effects add up to the
 * outperformance exactly.
 *
 * - Allocation = (portfolio weight − benchmark weight) × (benchmark bucket return − benchmark return)
 * - Selection = portfolio weight × (portfolio bucket return − benchmark bucket return)
 *
 * Weights are fractions, returns percent, effects percentage points. A bucket the benchmark does not hold takes the
 * portfolio's own return as its benchmark return, so its whole difference is allocation; a bucket the portfolio does
 * not hold has no selection.
 */

export interface AttrRow {
  name: string;
  wPort: number;
  wBench: number;
  retPort: number;
  retBench: number;
  allocation: number;
  selection: number;
  total: number;
}

export interface Attribution {
  rows: AttrRow[];
  port: number;
  bench: number;
  /** Portfolio return less the benchmark's. */
  active: number;
  allocation: number;
  selection: number;
}

export function attribution(rows: Bucket[], total: Bucket): Attribution {
  const rb = total.retBench;
  const out: AttrRow[] = rows.map((r) => {
    const wp = r.wPort / 100;
    const wb = r.wBench / 100;
    const rps = wp > 0 ? r.retPort : NaN;
    const rbs = wb > 0 ? r.retBench : rps;
    const allocation = wp === 0 && wb === 0 ? 0 : (wp - wb) * ((Number.isFinite(rbs) ? rbs : rb) - rb);
    const selection = wp > 0 && Number.isFinite(rps) && Number.isFinite(rbs) ? wp * (rps - rbs) : 0;
    return { name: r.name, wPort: r.wPort, wBench: r.wBench, retPort: r.retPort, retBench: r.retBench, allocation, selection, total: allocation + selection };
  });
  return {
    rows: out,
    port: total.retPort,
    bench: rb,
    active: total.retPort - rb,
    allocation: out.reduce((a, r) => a + r.allocation, 0),
    selection: out.reduce((a, r) => a + r.selection, 0),
  };
}

/** Each holding's share of its bucket's selection effect: its weight × (its return − its bucket's benchmark return). */
export function securitySelection(rows: Bucket[]): { id?: string; name: string; bucket: string; effect: number }[] {
  return rows.flatMap((r) => {
    const rbs = r.wBench > 0 ? r.retBench : r.retPort;
    return r.lines.map((l) => ({ id: l.id, name: l.name, bucket: r.name, effect: (l.weight / 100) * (l.ret - rbs) })).filter((x) => Number.isFinite(x.effect));
  });
}
