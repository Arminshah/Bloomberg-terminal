// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { Bucket } from './port-intraday';

/**
 * PORT's Attribution tab: the portfolio's return against its benchmark's, split by bucket into Allocation and
 * Selection (the two-effect Brinson-Fachler model, interaction counted in selection), so the effects add up to the
 * outperformance exactly.
 *
 * - Allocation = (portfolio weight − benchmark weight) × (benchmark bucket return − benchmark return)
 * - Selection = portfolio weight × (portfolio bucket return − benchmark bucket return)
 *
 * Weights are fractions, returns percent, effects percentage points. Both are worked from the bucket's contribution
 * (portfolio weight × portfolio bucket return), so they add up whatever the weights' signs. A bucket the benchmark does
 * not hold is all allocation (its contribution less its weight × the benchmark return); a bucket the portfolio does
 * not hold has no selection. The portfolio's weights add to 100 with cash, so the effects add to the outperformance.
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
    let allocation = 0;
    let selection = 0;
    if (wb > 0) {
      // From the bucket's contribution rather than its return, so a short or a hedge (a weight below zero) adds up too.
      selection = wp !== 0 ? r.ctrPort - wp * r.retBench : 0;
      allocation = (wp - wb) * (r.retBench - rb);
    } else if (wp !== 0) {
      allocation = r.ctrPort - wp * rb;
    }
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

/**
 * Each holding's share of its bucket's selection effect: its weight × (its return − its bucket's benchmark return). A
 * bucket the benchmark does not hold is all allocation, so its holdings have no selection share.
 */
export function securitySelection(rows: Bucket[]): { id?: string; name: string; bucket: string; effect: number }[] {
  return rows.flatMap((r) =>
    r.wBench > 0 ? r.lines.map((l) => ({ id: l.id, name: l.name, bucket: r.name, effect: (l.weight / 100) * (l.ret - r.retBench) })).filter((x) => Number.isFinite(x.effect)) : [],
  );
}
