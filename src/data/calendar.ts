/** Day numbers count whole UTC days since 1970-01-01 (a Thursday). */
export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

export const dayNum = (ms: number): number => Math.floor(ms / DAY_MS);
export const dayStart = (day: number): number => day * DAY_MS;

/** 0 = Sunday ... 6 = Saturday. */
export const weekday = (day: number): number => (((day + 4) % 7) + 7) % 7;
export const isBusinessDay = (day: number): boolean => {
  const w = weekday(day);
  return w !== 0 && w !== 6;
};

export const isoToDay = (iso: string): number => dayNum(Date.parse(`${iso}T00:00:00Z`));
export const dayToIso = (day: number): string => new Date(dayStart(day)).toISOString().slice(0, 10);

/** Most recent business day strictly before `day`. */
export function prevBusinessDay(day: number): number {
  let d = day - 1;
  while (!isBusinessDay(d)) d--;
  return d;
}

/** Business day on or before `day`. */
export function businessDayOnOrBefore(day: number): number {
  let d = day;
  while (!isBusinessDay(d)) d--;
  return d;
}

/**
 * Builds the history grid ending at `lastDay` (inclusive) going back `count`
 * days. Business calendars skip weekends; 24/7 calendars keep every day.
 */
export function buildGrid(lastDay: number, count: number, allDays: boolean): Int32Array {
  const out = new Int32Array(count);
  let d = lastDay;
  for (let i = count - 1; i >= 0; i--) {
    if (!allDays) while (!isBusinessDay(d)) d--;
    out[i] = d;
    d--;
  }
  return out;
}

/** Number of business days in (from, to]. */
export function businessDaysBetween(from: number, to: number): number {
  let n = 0;
  for (let d = from + 1; d <= to; d++) if (isBusinessDay(d)) n++;
  return n;
}

export function addMonths(date: Date, months: number): Date {
  // Date.UTC treats years 0..99 as 1900..1999. setUTCFullYear preserves the actual year.
  const d = new Date(0);
  d.setUTCFullYear(date.getUTCFullYear(), date.getUTCMonth() + months, 1);
  const end = new Date(d);
  end.setUTCMonth(d.getUTCMonth() + 1, 0);
  const lastDay = end.getUTCDate();
  d.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return d;
}

export function isEndOfMonth(date: Date): boolean {
  const next = new Date(date.getTime() + DAY_MS);
  return next.getUTCMonth() !== date.getUTCMonth();
}

export function endOfMonth(year: number, month0: number): Date {
  return new Date(Date.UTC(year, month0 + 1, 0));
}

/** Third Friday of a month (standard equity option expiry). */
export function thirdFriday(year: number, month0: number): Date {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (5 - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month0, 1 + offset + 14));
}

/** Rolls a date forward to the next business day if it falls on a weekend. */
export function rollForward(date: Date): Date {
  const d = new Date(date.getTime());
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

const MONTH_CODES = 'FGHJKMNQUVXZ';

/**
 * Front equity-index future on `day`: quarterly contracts expire on the third
 * Friday of Mar/Jun/Sep/Dec; monthly ones (HSI) on the second-last business
 * day of the month. The generic contract rolls on expiry day.
 */
export function frontFuture(day: number, monthly = false): { expiry: number; month0: number; year: number; code: string } {
  const d = new Date(day * DAY_MS);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  for (let k = 0; k < 15; k++) {
    if (monthly || m % 3 === 2) {
      let exp: number;
      if (monthly) {
        let e = Math.floor(endOfMonth(y, m).getTime() / DAY_MS);
        while (!isBusinessDay(e)) e--;
        e--;
        while (!isBusinessDay(e)) e--;
        exp = e;
      } else exp = Math.floor(thirdFriday(y, m).getTime() / DAY_MS);
      if (exp > day) return { expiry: exp, month0: m, year: y, code: `${MONTH_CODES[m]}${y % 10}` };
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  throw new Error('no future expiry');
}
