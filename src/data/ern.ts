import type { QuarterView } from './live/consensus';

/**
 * ERN's earnings history beside the analysts' figures: which consensus quarter a reported quarter is, and the
 * snapshot averages the terminal's ERN shows above its table. Figures stay on their own basis: the comparable
 * ("Comp") EPS is the analysts' basis the estimate is made on, which can differ from diluted EPS in the statements.
 */

const DAY_MS = 86_400_000;
const ok = (n: number | undefined | null): n is number => n != null && Number.isFinite(n);

/**
 * The consensus quarter reported on `reportDate` (ms): one whose report date is within a week of it, else the
 * latest quarter that ended in the 120 days before it.
 */
export function matchQuarter(reportDate: number, past: QuarterView[]): QuarterView | undefined {
  const byDate = past.find((q) => q.date != null && Math.abs(q.date - reportDate) <= 7 * DAY_MS);
  if (byDate) return byDate;
  let best: QuarterView | undefined;
  let bestEnd = -Infinity;
  for (const q of past) {
    const end = Date.parse(`${q.end}T00:00:00Z`);
    if (!Number.isFinite(end) || end > reportDate || reportDate - end > 120 * DAY_MS) continue;
    if (end > bestEnd) {
      best = q;
      bestEnd = end;
    }
  }
  return best;
}

export interface SurpriseStats {
  /** Average of the signed surprises, in percent, and of their sizes. */
  avgSurprise: number;
  avgAbsSurprise: number;
  /** How many reports had both an estimate and a comparable figure. */
  surprises: number;
  /** Average size of the price reactions, in percent, and how many there were. */
  avgAbsMove: number;
  moves: number;
}

/** ERN's snapshot averages over the reports given: surprises (percent) and price reactions (percent). */
export function surpriseStats(surprises: number[], moves: number[]): SurpriseStats {
  const s = surprises.filter(ok);
  const m = moves.filter(ok);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  return {
    avgSurprise: mean(s),
    avgAbsSurprise: mean(s.map(Math.abs)),
    surprises: s.length,
    avgAbsMove: mean(m.map(Math.abs)),
    moves: m.length,
  };
}
