// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
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
 * London, Xetra and Tokyo are tables entered from each exchange's published
 * calendar, for the years they cover (`through`).
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
  /** Short code, also the HOLIDAYS tab: US, EU, GB, DE, JP. */
  id: string;
  /** Short label for the top bar. */
  label: string;
  name: string;
  tz: string;
  city: string;
  open: string;
  close: string;
  /** Holidays and early closes of a calendar year, in date order. */
  days(year: number): MarketDay[];
  /** Where the calendar comes from. */
  source: string;
  /** The last year a published table covers; unset when the calendar follows from rules. */
  through?: number;
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

export const US_MARKET: Exchange = {
  id: 'US',
  label: 'NYSE',
  name: 'New York Stock Exchange',
  tz: 'America/New_York',
  city: 'New York',
  open: '09:30',
  close: '16:00',
  days: nyseDays,
  source: "Worked out from the NYSE's published holiday and early-close rules (nyse.com, read 14 October 2026)",
};
export const EU_MARKET: Exchange = {
  id: 'EU',
  label: 'Euronext',
  name: 'Euronext Amsterdam, Brussels, Lisbon and Paris',
  tz: 'Europe/Brussels',
  city: 'Brussels',
  open: '09:00',
  close: '17:30',
  days: euronextDays,
  source: "Worked out from Euronext's published trading calendar rules (euronext.com, read 14 October 2026)",
};

/** A calendar entered from an exchange's published table, for the years it covers. */
function table(list: MarketDay[]): (year: number) => MarketDay[] {
  return (year) => list.filter((d) => d.date.startsWith(`${year}-`));
}

/** London Stock Exchange: closed on English bank holidays; 12:30 close on Christmas Eve and New Year's Eve. */
export const LSE_MARKET: Exchange = {
  id: 'GB',
  label: 'LSE',
  name: 'London Stock Exchange',
  tz: 'Europe/London',
  city: 'London',
  open: '08:00',
  close: '16:30',
  through: 2027,
  source: "Entered from the London Stock Exchange's published business days for 2026 and 2027",
  days: table([
    { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-04', name: 'Early May Bank Holiday' }, { date: '2026-05-25', name: 'Spring Bank Holiday' }, { date: '2026-08-31', name: 'Summer Bank Holiday' },
    { date: '2026-12-24', name: 'Christmas Eve (12:30 close)', close: '12:30' }, { date: '2026-12-25', name: 'Christmas Day' }, { date: '2026-12-28', name: 'Boxing Day (substitute)' },
    { date: '2026-12-31', name: "New Year's Eve (12:30 close)", close: '12:30' },
    { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-03-26', name: 'Good Friday' }, { date: '2027-03-29', name: 'Easter Monday' },
    { date: '2027-05-03', name: 'Early May Bank Holiday' }, { date: '2027-05-31', name: 'Spring Bank Holiday' }, { date: '2027-08-30', name: 'Summer Bank Holiday' },
    { date: '2027-12-24', name: 'Christmas Eve (12:30 close)', close: '12:30' }, { date: '2027-12-27', name: 'Christmas Day (substitute)' }, { date: '2027-12-28', name: 'Boxing Day (substitute)' },
    { date: '2027-12-31', name: "New Year's Eve (12:30 close)", close: '12:30' },
  ]),
};

/** Xetra (Deutsche Börse). */
export const XETRA_MARKET: Exchange = {
  id: 'DE',
  label: 'Xetra',
  name: 'Xetra (Deutsche Börse)',
  tz: 'Europe/Berlin',
  city: 'Frankfurt',
  open: '09:00',
  close: '17:30',
  through: 2027,
  source: "Entered from Deutsche Börse's published Xetra trading calendar for 2026 and 2027",
  days: table([
    { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-04-03', name: 'Good Friday' }, { date: '2026-04-06', name: 'Easter Monday' },
    { date: '2026-05-01', name: 'Labour Day' }, { date: '2026-12-24', name: 'Christmas Eve' }, { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-31', name: "New Year's Eve" },
    { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-03-26', name: 'Good Friday' }, { date: '2027-03-29', name: 'Easter Monday' },
    { date: '2027-12-24', name: 'Christmas Eve' }, { date: '2027-12-31', name: "New Year's Eve" },
  ]),
};

/** Tokyo Stock Exchange (Japan Exchange Group). */
export const JPX_MARKET: Exchange = {
  id: 'JP',
  label: 'TSE',
  name: 'Japan Exchange Group (Tokyo)',
  tz: 'Asia/Tokyo',
  city: 'Tokyo',
  open: '09:00',
  close: '15:30',
  through: 2027,
  source: "Entered from Japan Exchange Group's published market holidays for 2026 and 2027",
  days: table([
    { date: '2026-01-01', name: "New Year's Day" }, { date: '2026-01-02', name: 'Market holiday' }, { date: '2026-01-12', name: 'Coming of Age Day' },
    { date: '2026-02-11', name: 'National Foundation Day' }, { date: '2026-02-23', name: "Emperor's Birthday" }, { date: '2026-03-20', name: 'Vernal Equinox Day' },
    { date: '2026-04-29', name: 'Showa Day' }, { date: '2026-05-04', name: 'Greenery Day' }, { date: '2026-05-05', name: "Children's Day" },
    { date: '2026-05-06', name: 'Constitution Day (substitute)' }, { date: '2026-07-20', name: 'Marine Day' }, { date: '2026-08-11', name: 'Mountain Day' },
    { date: '2026-09-21', name: 'Respect for the Aged Day' }, { date: '2026-09-22', name: 'National Holiday' }, { date: '2026-09-23', name: 'Autumnal Equinox Day' },
    { date: '2026-10-12', name: 'Sports Day' }, { date: '2026-11-03', name: 'Culture Day' }, { date: '2026-11-23', name: 'Labour Thanksgiving Day' },
    { date: '2026-12-31', name: 'Market holiday' },
    { date: '2027-01-01', name: "New Year's Day" }, { date: '2027-01-11', name: 'Coming of Age Day' }, { date: '2027-02-11', name: 'National Foundation Day' },
    { date: '2027-02-23', name: "Emperor's Birthday" }, { date: '2027-03-22', name: 'Vernal Equinox Day (substitute)' }, { date: '2027-04-29', name: 'Showa Day' },
    { date: '2027-05-03', name: 'Constitution Day' }, { date: '2027-05-04', name: 'Greenery Day' }, { date: '2027-05-05', name: "Children's Day" },
    { date: '2027-07-19', name: 'Marine Day' }, { date: '2027-08-11', name: 'Mountain Day' }, { date: '2027-09-20', name: 'Respect for the Aged Day' },
    { date: '2027-09-23', name: 'Autumnal Equinox Day' }, { date: '2027-10-11', name: 'Sports Day' }, { date: '2027-11-03', name: 'Culture Day' },
    { date: '2027-11-23', name: 'Labour Thanksgiving Day' }, { date: '2027-12-31', name: 'Market holiday' },
  ]),
};

/** The calendars on HOLIDAYS, in tab order. */
export const EXCHANGES: Exchange[] = [US_MARKET, EU_MARKET, LSE_MARKET, XETRA_MARKET, JPX_MARKET];

/** The exchange's own calendar date at `now`: YYYY-MM-DD. */
export function localDate(ex: Pick<Exchange, 'tz'>, now: number): string {
  const p = zonedParts(now, ex.tz);
  return isoOf(p.y, p.mo - 1, p.d);
}

/** The holiday or early close on a date (YYYY-MM-DD, the exchange's own), if any. */
export function marketDay(ex: Exchange, iso: string): MarketDay | undefined {
  return dayOf(ex, Number(iso.slice(0, 4)), iso);
}

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

/**
 * The latest trading day whose regular session has opened by `now`, as the exchange's own date (YYYY-MM-DD): today
 * once the market has opened, else the trading day before. At a weekend or on a holiday it is the last day the
 * market traded (Friday 23 October 2026 on the Saturday and Sunday after it).
 */
export function latestSession(ex: Exchange, now: number): string {
  const p = zonedParts(now, ex.tz);
  const [oh, om] = hm(ex.open);
  for (let k = 0; k < 21; k++) {
    const t = new Date(Date.UTC(p.y, p.mo - 1, p.d - k));
    const y = t.getUTCFullYear();
    const m0 = t.getUTCMonth();
    const d = t.getUTCDate();
    const wd = t.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const special = dayOf(ex, y, isoOf(y, m0, d));
    if (special && !special.close) continue;
    if (k === 0 && now < zonedToUtc(y, m0, d, oh, om, ex.tz)) continue;
    return isoOf(y, m0, d);
  }
  return isoOf(p.y, p.mo - 1, p.d);
}

/**
 * US stocks' sessions, New York time: pre-market from 04:00, the regular session from 09:30 to 16:00 and after hours
 * to 20:00 (Nasdaq's published trading hours). On an early-close day the regular session ends at 13:00 and after hours
 * at 17:00 (NYSE Group's holiday calendar: the late trading sessions close at 5:00 p.m.). Nasdaq and NYSE Arca plan a
 * night session (21:00 to 04:00, Sunday to Friday) from 6 December 2026, subject to industry readiness; it is not
 * counted here until it has started.
 */
export const US_PRE_OPEN = '04:00';
export const US_POST_CLOSE = '20:00';
export const US_POST_CLOSE_EARLY = '17:00';

export type UsPhase = 'pre' | 'regular' | 'post' | 'closed';

export interface UsSession {
  phase: UsPhase;
  /** Why the market is closed: the weekend, a holiday, or the hours between one day's after-hours and the next pre-market. */
  closedFor?: 'weekend' | 'holiday' | 'night';
  holiday?: string;
  /** When this phase ends (epoch ms) and which phase follows. */
  until: number;
  next: UsPhase;
  /** The hours of this phase (pre-market, regular or after hours), HH:MM New York. */
  from?: string;
  to?: string;
}

/** Which of US stocks' sessions is trading at `now`, and when that changes. */
export function usSession(now: number): UsSession {
  const ex = US_MARKET;
  const p = zonedParts(now, ex.tz);
  const at = (y: number, m0: number, d: number, hhmm: string) => {
    const [h, mi] = hm(hhmm);
    return zonedToUtc(y, m0, d, h, mi, ex.tz);
  };
  /** A trading day's early close (HH:MM), '' for a full day, null for no session. */
  const closeOn = (y: number, m0: number, d: number): string | null => {
    const wd = weekdayOf(y, m0, d);
    if (wd === 0 || wd === 6) return null;
    const special = dayOf(ex, y, isoOf(y, m0, d));
    if (special && !special.close) return null;
    return special?.close ?? '';
  };
  const today = closeOn(p.y, p.mo - 1, p.d);
  if (today !== null) {
    const close = today || ex.close;
    const postEnd = today ? US_POST_CLOSE_EARLY : US_POST_CLOSE;
    const [pre, open, shut, post] = [US_PRE_OPEN, ex.open, close, postEnd].map((t) => at(p.y, p.mo - 1, p.d, t));
    if (now >= pre && now < open) return { phase: 'pre', until: open, next: 'regular', from: US_PRE_OPEN, to: ex.open };
    if (now >= open && now < shut) return { phase: 'regular', until: shut, next: 'post', from: ex.open, to: close };
    if (now >= shut && now < post) return { phase: 'post', until: post, next: 'closed', from: close, to: postEnd };
    if (now < pre) return { phase: 'closed', closedFor: 'night', until: pre, next: 'pre' };
  }
  const wd = weekdayOf(p.y, p.mo - 1, p.d);
  const holiday = today === null && wd !== 0 && wd !== 6 ? dayOf(ex, p.y, isoOf(p.y, p.mo - 1, p.d))?.name : undefined;
  const closedFor = today !== null ? 'night' : holiday ? 'holiday' : 'weekend';
  for (let k = 1; k < 21; k++) {
    const t = new Date(Date.UTC(p.y, p.mo - 1, p.d + k));
    if (closeOn(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) !== null) {
      return { phase: 'closed', closedFor, ...(holiday ? { holiday } : {}), until: at(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), US_PRE_OPEN), next: 'pre' };
    }
  }
  return { phase: 'closed', closedFor, ...(holiday ? { holiday } : {}), until: NaN, next: 'pre' };
}

/** The exchange a listing trades on, by its exchange code (AAPL US, ASML NA, SHEL LN), when the app has its calendar. */
export function exchangeOfListing(ticker: string): Exchange | undefined {
  const code = ticker.trim().split(/\s+/)[1];
  switch (code) {
    case 'US':
      return US_MARKET;
    case 'NA':
    case 'FP':
    case 'BB':
    case 'PL':
      return EU_MARKET;
    case 'LN':
      return LSE_MARKET;
    case 'GY':
    case 'GR':
      return XETRA_MARKET;
    case 'JT':
    case 'JP':
      return JPX_MARKET;
    default:
      return undefined;
  }
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

/** Where an exchange's regular session stands now, by its own calendar. */
export type ExchangeState = 'OPEN' | 'CLOSED' | 'HOLIDAY' | 'WEEKEND';

export interface ExchangeStatus {
  state: ExchangeState;
  /** The exchange's own date (YYYY-MM-DD) and time (HH:MM) now. */
  localDate: string;
  localTime: string;
  /** Today's holiday or early close, if any. */
  today?: MarketDay;
  /** The next close while open, the next open while closed; NaN with no session in the next three weeks. */
  nextAt: number;
  /** The early closing time of the session that is open or opens next. */
  earlyClose?: string;
  /** The exchange's published holiday table ends before the next session, so a holiday there is not known. */
  uncovered: boolean;
}

/** The status EXCH lists for an exchange: open, closed, a holiday or the weekend, and when that changes. */
export function exchangeStatus(ex: Exchange, now: number): ExchangeStatus {
  const s = sessionAt(ex, now);
  const p = zonedParts(now, ex.tz);
  const wd = weekdayOf(p.y, p.mo - 1, p.d);
  const state: ExchangeState = s.open ? 'OPEN' : wd === 0 || wd === 6 ? 'WEEKEND' : s.today && !s.today.close ? 'HOLIDAY' : 'CLOSED';
  const nextYear = Number.isFinite(s.at) ? zonedParts(s.at, ex.tz).y : p.y;
  return {
    state,
    localDate: isoOf(p.y, p.mo - 1, p.d),
    localTime: `${pad(p.h)}:${pad(p.mi)}`,
    ...(s.today ? { today: s.today } : {}),
    nextAt: s.at,
    ...(s.earlyClose ? { earlyClose: s.earlyClose } : {}),
    uncovered: ex.through !== undefined && Math.max(p.y, nextYear) > ex.through,
  };
}
