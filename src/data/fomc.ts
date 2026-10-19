import { levelOn, type PolicySeries } from './live/policy';

/**
 * FOMC's announcement table: each scheduled decision day from the Board's calendar with the target range that took
 * effect after it, from the New York Fed's daily series. A range takes effect the day after the announcement, so
 * the level on the next day against the level on the day itself is the decision. Days the series does not reach
 * stay unknown rather than being filled in.
 */
export interface FomcRow {
  /** Decision day, ISO. */
  date: string;
  status: 'decided' | 'today' | 'scheduled';
  lower: number;
  upper: number;
  /** Change of the upper bound, in basis points. */
  changeBp: number;
}

function nextDay(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function fomcRows(meetings: string[], lower: PolicySeries | undefined, upper: PolicySeries | undefined, today: string): FomcRow[] {
  return [...new Set(meetings)].sort().map((date) => {
    const status: FomcRow['status'] = date < today ? 'decided' : date === today ? 'today' : 'scheduled';
    if (status !== 'decided' || !upper) return { date, status, lower: NaN, upper: NaN, changeBp: NaN };
    // The series ends at its latest business day; a decision after that is not in it yet.
    const after = nextDay(date);
    const covered = after <= upper.asOf;
    const up = covered ? levelOn(upper, after) : NaN;
    const before = levelOn(upper, date);
    const lo = covered && lower ? levelOn(lower, after) : NaN;
    return { date, status, lower: lo, upper: up, changeBp: Number.isFinite(up) && Number.isFinite(before) ? Math.round((up - before) * 100) : NaN };
  });
}

/** The years a meeting list covers, for the screen's tabs. */
export function fomcYears(meetings: string[]): number[] {
  return [...new Set(meetings.map((m) => Number(m.slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b);
}
