import { levelOn, type PolicySeries } from './live/policy';
import type { PolicyDecision } from './live/policy-decisions';

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
  /** Statement-linked decision date. A nearby calendar date alone does not establish this. */
  meeting?: string;
  /** Nearby scheduled date, useful for comparison but not confirmed event linkage. */
  scheduledCandidate?: string;
  sourceUrl?: string;
  /** Days since the move before it (NaN for the first). */
  gapDays: number;
}

export function rateMoves(s: PolicySeries, meetings: readonly string[], decisions: readonly PolicyDecision[] = []): RateMove[] {
  const out: RateMove[] = [];
  for (let i = 1; i < s.changes.length; i++) {
    const [date, level] = s.changes[i];
    const change = Math.round((level - s.changes[i - 1][1]) * 10_000) / 10_000;
    if (change === 0 || date > s.asOf) continue;
    const scheduledCandidate = [...meetings].sort().reverse().find((m) => m <= date && Date.parse(date) - Date.parse(m) <= 8 * DAY_MS);
    const decision = decisions.findLast((d) => d.effectiveDate === date && d.upper === level && (d.action === 'cut' || d.action === 'hike'));
    const prev = out.length ? out[out.length - 1].date : undefined;
    out.push({ date, level, change, ...(scheduledCandidate ? { scheduledCandidate } : {}), ...(decision ? { meeting: decision.date, sourceUrl: decision.sourceUrl } : {}), gapDays: prev ? Math.round((Date.parse(date) - Date.parse(prev)) / DAY_MS) : NaN });
  }
  // An explicit statement amount can establish a move even when it is the first level in a lagging data window.
  for (const decision of decisions) {
    const date = decision.effectiveDate;
    if (!date || date > s.asOf || !Number.isFinite(decision.changeBp) || !decision.changeBp || !['cut', 'hike'].includes(decision.action) || levelOn(s, date) !== decision.upper) continue;
    const move = out.find((m) => m.date === date);
    if (move) Object.assign(move, { change: decision.changeBp! / 100, meeting: decision.date, sourceUrl: decision.sourceUrl });
    else out.push({ date, level: decision.upper, change: decision.changeBp! / 100, meeting: decision.date, sourceUrl: decision.sourceUrl, gapDays: NaN });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  out.forEach((move, i) => { move.gapDays = i ? Math.round((Date.parse(move.date) - Date.parse(out[i - 1].date)) / DAY_MS) : NaN; });
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

/** Steps through the last dated evidence, capped at `until`. A stale observation does not certify today's level. */
export function stepPoints(s: PolicySeries, until: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const through = Math.min(until, Date.parse(`${s.asOf}T00:00:00Z`));
  const effective = s.changes.filter(([d]) => Date.parse(`${d}T00:00:00Z`) <= through);
  effective.forEach(([d, v], i) => {
    const x = Date.parse(`${d}T00:00:00Z`);
    if (i > 0) pts.push({ x, y: effective[i - 1][1] });
    pts.push({ x, y: v });
  });
  if (pts.length && through > pts[pts.length - 1].x) pts.push({ x: through, y: effective.at(-1)![1] });
  return pts;
}
