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
