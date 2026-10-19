/**
 * The policy path priced in 30-day fed funds futures, read the way CME
 * FedWatch reads them. Each contract settles on its month's average effective
 * fed funds rate, so 100 minus the price is the expected average. In a month
 * without an FOMC decision the rate is flat. In a decision month the average
 * splits into the days before the decision and the days after it (a new rate
 * takes effect the day after the announcement).
 */

export interface FedMonth {
  year: number;
  /** 0-11. */
  month: number;
  /** Expected average effective rate for the month, % (100 - futures price). */
  avg: number;
}

export interface FedMeeting {
  /** Decision day, ISO date. */
  date: string;
  /** Expected rate going into the meeting, %. */
  start: number;
  /** Expected rate after it, %. */
  end: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * @param months futures-implied monthly averages, any order
 * @param meetings FOMC decision days (ISO), past ones included
 * @param current the latest effective fed funds rate, %
 * @param now epoch ms; a decision counts as upcoming until 18:00 UTC on its day
 */
export function fedPath(months: FedMonth[], meetings: string[], current: number, now: number): FedMeeting[] {
  if (!Number.isFinite(current) || !meetings.length) return [];
  const key = (y: number, m: number) => y * 12 + m;
  const avg = new Map<number, number>();
  for (const x of months) if (Number.isFinite(x.avg)) avg.set(key(x.year, x.month), x.avg);
  const decision = new Map<number, number>();
  for (const iso of meetings) {
    if (Date.parse(`${iso}T18:00:00Z`) <= now) continue;
    const [y, m, d] = iso.split('-').map(Number);
    decision.set(key(y, m - 1), d);
  }
  // Months after the last year the calendar covers may hold meetings nobody has scheduled yet.
  const lastKnown = key(Math.max(...meetings.map((iso) => Number(iso.slice(0, 4)))), 11);
  const today = new Date(now);
  const first = key(today.getUTCFullYear(), today.getUTCMonth());
  const out: FedMeeting[] = [];
  let rate = current;
  for (let k = first; avg.has(k) && k <= lastKnown; k++) {
    const a = avg.get(k)!;
    const d = decision.get(k);
    if (d == null) {
      // The current month's average mixes days already past; the latest print is the better start.
      if (k !== first) rate = a;
      continue;
    }
    const y = Math.floor(k / 12);
    const m = k % 12;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const next = avg.get(k + 1);
    let end: number;
    if (next != null && k + 1 <= lastKnown && !decision.has(k + 1)) end = next;
    else if (d < days) end = (a * days - rate * d) / (days - d);
    else break; // a decision on the month's last day shows only in the next month, which has its own meeting
    out.push({ date: `${y}-${pad(m + 1)}-${pad(d)}`, start: rate, end });
    rate = end;
  }
  return out;
}

/** One policy move as WIRP counts it, in bp. */
export const MOVE_BP = 25;

export interface MeetingMoves {
  /** Implied change from today's rate to the rate after the meeting, bp. */
  cumBp: number;
  /** #Hikes/Cuts: 25 bp moves priced from today's rate to after the meeting. */
  cumMoves: number;
  /** Cumulative %Hike/Cut: cumulative change ÷ 25 bp in percent, uncapped (140% = 35 bp); positive hikes, negative cuts. */
  cumPct: number;
  /** Change priced at this meeting alone, from the rate going into it, bp. */
  stepBp: number;
  /** % probability of a move at this meeting alone: |step| ÷ 25 bp, capped at 100%. */
  stepProb: number;
}

/**
 * WIRP columns for a meeting from the expected rates going into it (`start`) and after it (`end`) and today's rate,
 * all in percent. Cumulative figures run from today's rate; the probability is the meeting's own step.
 */
export function meetingMoves(start: number, end: number, current: number, moveBp = MOVE_BP): MeetingMoves {
  const cumBp = (end - current) * 100;
  const stepBp = (end - start) * 100;
  return { cumBp, cumMoves: cumBp / moveBp, cumPct: (cumBp / moveBp) * 100, stepBp, stepProb: Math.min(100, (Math.abs(stepBp) / moveBp) * 100) };
}
