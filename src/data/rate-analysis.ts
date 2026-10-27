import { levelOn, type PolicySeries } from './live/policy';

/**
 * Central bank rate analysis (CBRT): a policy series' moves, each with its size and the meeting that decided it, its
 * changes over a period, and its path as steps for a chart. A series' first entry is its level at the start of the
 * history read, not a move.
 */

const DAY_MS = 86_400_000;

export interface RateMove {
  /** When the new level took effect. */
  date: string;
  level: number;
  /** In percentage points. */
  change: number;
  /** The meeting that decided it: the last one on or before it, within eight days. */
  meeting?: string;
  /** Days since the move before it (NaN for the first). */
  gapDays: number;
}

export function rateMoves(s: PolicySeries, meetings: readonly string[]): RateMove[] {
  const out: RateMove[] = [];
  for (let i = 1; i < s.changes.length; i++) {
    const [date, level] = s.changes[i];
    const change = Math.round((level - s.changes[i - 1][1]) * 10_000) / 10_000;
    const meeting = [...meetings].reverse().find((m) => m <= date && Date.parse(date) - Date.parse(m) <= 8 * DAY_MS);
    const prev = out.length ? out[out.length - 1].date : undefined;
    out.push({ date, level, change, ...(meeting ? { meeting } : {}), gapDays: prev ? Math.round((Date.parse(date) - Date.parse(prev)) / DAY_MS) : NaN });
  }
  return out;
}

/** The change in the level from a day to the latest, in percentage points; NaN when the history starts after that day. */
export function changeSince(s: PolicySeries, fromIso: string): number {
  if (!s.changes.length || s.changes[0][0] > fromIso) return NaN;
  return Math.round((s.last - levelOn(s, fromIso)) * 10_000) / 10_000;
}

/** Rises and cuts from a day on. */
export function movesSince(moves: readonly RateMove[], fromIso: string): { up: number; down: number } {
  const after = moves.filter((m) => m.date >= fromIso);
  return { up: after.filter((m) => m.change > 0).length, down: after.filter((m) => m.change < 0).length };
}

/** The level as steps (x in ms) from the start of the history to `until`: each move a vertical step on its day. */
export function stepPoints(s: PolicySeries, until: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  s.changes.forEach(([d, v], i) => {
    const x = Date.parse(`${d}T00:00:00Z`);
    if (i > 0) pts.push({ x, y: s.changes[i - 1][1] });
    pts.push({ x, y: v });
  });
  if (pts.length && until > pts[pts.length - 1].x) pts.push({ x: until, y: s.last });
  return pts;
}
