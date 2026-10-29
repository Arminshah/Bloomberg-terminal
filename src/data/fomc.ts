import { levelOn, type PolicySeries } from './live/policy';
import type { PolicyDecision } from './live/policy-decisions';
import { bankDate, scheduledPolicyAt, visibleDecisions } from './policy-state';

/** Statement-confirmed decisions and separately labelled rate-series observations share one timeline. */
export interface FomcRow {
  date: string;
  status: 'confirmed' | 'observed' | 'awaiting' | 'today' | 'scheduled';
  lower: number;
  upper: number;
  changeBp: number;
  decision?: PolicyDecision;
  scheduled: boolean;
}

function nextDay(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function fomcRows(meetings: string[], lower: PolicySeries | undefined, upper: PolicySeries | undefined, today: string, decisions: readonly PolicyDecision[] = [], now = Date.parse(`${today}T12:00:00Z`)): FomcRow[] {
  const known = visibleDecisions(decisions, 'FED', now);
  return [...new Set([...meetings, ...known.map((d) => d.date)])].sort().map((date) => {
    const decision = known.findLast((d) => d.date === date);
    const scheduled = meetings.includes(date);
    if (decision) return { date, status: 'confirmed' as const, lower: decision.lower ?? NaN, upper: decision.upper, changeBp: decision.changeBp ?? NaN, decision, scheduled };
    const ahead = scheduledPolicyAt('FED', date) > now;
    const status: FomcRow['status'] = ahead ? date === today ? 'today' : 'scheduled' : 'awaiting';
    if (ahead || !upper) return { date, status, lower: NaN, upper: NaN, changeBp: NaN, scheduled };
    const after = nextDay(date);
    const covered = after <= upper.asOf && after <= bankDate('FED', now);
    const up = covered ? levelOn(upper, after) : NaN;
    const before = levelOn(upper, date);
    const lo = covered && lower && after <= lower.asOf ? levelOn(lower, after) : NaN;
    const changeBp = Number.isFinite(up) && Number.isFinite(before) ? Math.round((up - before) * 100) : NaN;
    // Keep historical comparisons useful without claiming that a calendar/flat series proves an announcement.
    return { date, status: Number.isFinite(changeBp) ? 'observed' as const : status, lower: lo, upper: up, changeBp, scheduled };
  });
}

export function fomcYears(meetings: string[]): number[] {
  return [...new Set(meetings.map((m) => Number(m.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b);
}
