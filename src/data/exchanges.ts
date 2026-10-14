import { zonedParts, zonedToUtc } from '../core/format';

/**
 * Regular trading sessions for the market timers in the top bar and the
 * HOLIDAYS screen, with holidays and early closes worked out from each
 * exchange's published rules, so they hold for any year.
 *
 * NYSE (nyse.com, "Holidays and Trading Hours", read 14 October 2026): core
 * trading 09:30 to 16:00 Eastern Time. Closed on New Year's Day, Martin Luther
 * King Jr. Day, Washington's Birthday, Good Friday, Memorial Day, Juneteenth,
 * Independence Day, Labor Day, Thanksgiving and Christmas. A holiday on a
 * Saturday is observed the Friday before, except New Year's Day, which is then
 * not observed ("no New Year's Day holiday is observed" for 1 January 2028);
 * one on a Sunday is observed the Monday after. Early close at 13:00 on the day
 * after Thanksgiving, and on Christmas Eve and 3 July when they fall Monday to
 * Thursday.
 *
 * Euronext Amsterdam, Brussels, Lisbon and Paris (euronext.com, "Trading hours
 * and holidays", read 14 October 2026): continuous trading 09:00 to 17:30 CET,
 * closed on New Year's Day, Good Friday, Easter Monday, 1 May, 25 and 26
 * December; half trading days on 24 and 31 December, closing by 14:05 CET.
 * Holidays falling on a weekend are not moved.
 *
 * Closures nobody can schedule in advance, such as a national day of mourning
 * or an outage, are not known here.
 */

/** A day with no regular session: a holiday, or an early close when `close` is set. */
export interface MarketDay {
  /** YYYY-MM-DD in the exchange's own time zone. */
  date: string;
  name: string;
  /** Early closing time, HH:MM local. */
  close?: string;
}

export interface Exchange {
  id: 'US' | 'EU';
  /** Short label for the top bar. */
  label: string;
  name: string;
  tz: string;
  city: string;
  open: string;
  close: string;
  /** Holidays and early closes of a calendar year, in date order. */
  days(year: number): MarketDay[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m0: number, d: number) => {
  const t = new Date(Date.UTC(y, m0, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
/** 0 = Sunday ... 6 = Saturday. */
const weekdayOf = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).getUTCDay();

/** Easter Sunday (Gregorian), as [month0, day]. */
export function easter(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month - 1, day];
}

/** Day of the month of the nth `weekday` (0 = Sunday) of a month; n = -1 for the last. */
function nthWeekday(year: number, m0: number, weekday: number, n: number): number {
  if (n > 0) return 1 + ((weekday - weekdayOf(year, m0, 1) + 7) % 7) + (n - 1) * 7;
  const last = new Date(Date.UTC(year, m0 + 1, 0)).getUTCDate();
  return last - ((weekdayOf(year, m0, last) - weekday + 7) % 7);
}

const byDate = (a: MarketDay, b: MarketDay) => a.date.localeCompare(b.date);

/** NYSE holidays and 13:00 early closes for a year. */
export function nyseDays(year: number): MarketDay[] {
  const out: MarketDay[] = [];
  const add = (m0: number, d: number, name: string, close?: string) => out.push({ date: isoOf(year, m0, d), name, ...(close ? { close } : {}) });
  // A fixed-date holiday on a weekend moves to the nearest weekday, except New Year's Day on a Saturday.
  const fixed = (m0: number, d: number, name: string) => {
    const wd = weekdayOf(year, m0, d);
    if (wd === 6) {
      if (!(m0 === 0 && d === 1)) add(m0, d - 1, `${name} (observed)`);
    } else if (wd === 0) add(m0, d + 1, `${name} (observed)`);
    else add(m0, d, name);
  };
  fixed(0, 1, "New Year's Day");
  add(0, nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day');
  add(1, nthWeekday(year, 1, 1, 3), "Washington's Birthday");
  const [em, ed] = easter(year);
  add(em, ed - 2, 'Good Friday');
  add(4, nthWeekday(year, 4, 1, -1), 'Memorial Day');
  if (year >= 2022) fixed(5, 19, 'Juneteenth');
  fixed(6, 4, 'Independence Day');
  add(8, nthWeekday(year, 8, 1, 1), 'Labor Day');
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  add(10, thanksgiving, 'Thanksgiving Day');
  fixed(11, 25, 'Christmas Day');
  // Early closes on the eve of a holiday, when that eve is a regular Monday to Thursday.
  const monToThu = (m0: number, d: number) => {
    const wd = weekdayOf(year, m0, d);
    return wd >= 1 && wd <= 4;
  };
  if (monToThu(6, 3)) add(6, 3, 'Day before Independence Day (13:00 close)', '13:00');
  add(10, thanksgiving + 1, 'Day after Thanksgiving (13:00 close)', '13:00');
  if (monToThu(11, 24)) add(11, 24, 'Christmas Eve (13:00 close)', '13:00');
  return out.sort(byDate);
}

/** Euronext (Amsterdam, Brussels, Lisbon, Paris) holidays and half days for a year. */
export function euronextDays(year: number): MarketDay[] {
  const out: MarketDay[] = [];
  const add = (m0: number, d: number, name: string, close?: string) => {
    const wd = weekdayOf(year, m0, d);
    if (wd !== 0 && wd !== 6) out.push({ date: isoOf(year, m0, d), name, ...(close ? { close } : {}) });
  };
  const [em, ed] = easter(year);
  add(0, 1, "New Year's Day");
  add(em, ed - 2, 'Good Friday');
  add(em, ed + 1, 'Easter Monday');
  add(4, 1, 'Labour Day');
  add(11, 24, 'Christmas Eve (14:05 close)', '14:05');
  add(11, 25, 'Christmas Day');
  add(11, 26, 'Boxing Day');
  add(11, 31, "New Year's Eve (14:05 close)", '14:05');
  return out.sort(byDate);
}

export const US_MARKET: Exchange = { id: 'US', label: 'US', name: 'New York Stock Exchange', tz: 'America/New_York', city: 'New York', open: '09:30', close: '16:00', days: nyseDays };
export const EU_MARKET: Exchange = { id: 'EU', label: 'EUROPE', name: 'Euronext Amsterdam, Brussels, Lisbon and Paris', tz: 'Europe/Brussels', city: 'Brussels', open: '09:00', close: '17:30', days: euronextDays };

const cache = new Map<string, Map<string, MarketDay>>();
function dayOf(ex: Exchange, y: number, iso: string): MarketDay | undefined {
  const key = `${ex.id}:${y}`;
  let m = cache.get(key);
  if (!m) cache.set(key, (m = new Map(ex.days(y).map((x) => [x.date, x]))));
  return m.get(iso);
}

const hm = (s: string) => s.split(':').map(Number) as [number, number];

export interface SessionNow {
  open: boolean;
  /** When the market next closes (open) or opens (closed); NaN if no session in the next three weeks. */
  at: number;
  /** The close time of the session that is open or opens next, HH:MM local, when it is an early close. */
  earlyClose?: string;
  /** Today's holiday or early close in the exchange's own time zone. */
  today?: MarketDay;
}

/** Whether `ex` is in its regular session at `now`, and when that changes. */
export function sessionAt(ex: Exchange, now: number): SessionNow {
  const p = zonedParts(now, ex.tz);
  const today = dayOf(ex, p.y, isoOf(p.y, p.mo - 1, p.d));
  const [oh, om] = hm(ex.open);
  for (let k = 0; k < 21; k++) {
    const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + k));
    const y = t.getUTCFullYear();
    const m0 = t.getUTCMonth();
    const d = t.getUTCDate();
    const wd = t.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const special = dayOf(ex, y, isoOf(y, m0, d));
    if (special && !special.close) continue;
    const [ch, cm] = hm(special?.close ?? ex.close);
    const openAt = zonedToUtc(y, m0, d, oh, om, ex.tz);
    const closeAt = zonedToUtc(y, m0, d, ch, cm, ex.tz);
    const early = special?.close;
    if (now < openAt) return { open: false, at: openAt, ...(early ? { earlyClose: early } : {}), ...(today ? { today } : {}) };
    if (now < closeAt) return { open: true, at: closeAt, ...(early ? { earlyClose: early } : {}), ...(today ? { today } : {}) };
  }
  return { open: false, at: NaN, ...(today ? { today } : {}) };
}

/** Time left as H:MM:SS, or "2d 17h 05m" beyond a day. Whole seconds round up, so a closed market never shows 0:00:00. */
export function fmtCountdown(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '--';
  const s = Math.ceil(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${pad(m)}m` : `${h}:${pad(m)}:${pad(s % 60)}`;
}
