// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { addMonths, isEndOfMonth, DAY_MS } from '../data/calendar';

/** Day-count convention for accrued interest and the fractional first discount period. */
export type DayCount = 'ACT/ACT ICMA' | '30/360' | '30E/360' | 'ACT/360' | 'ACT/365F';

export const DAY_COUNTS: { id: DayCount; label: string }[] = [
  { id: 'ACT/ACT ICMA', label: 'Actual/Actual ICMA' },
  { id: '30/360', label: '30/360 US (SIA bond basis)' },
  { id: '30E/360', label: '30E/360 (Eurobond basis)' },
  { id: 'ACT/360', label: 'Actual/360' },
  { id: 'ACT/365F', label: 'Actual/365 Fixed' },
];

/** Fixed-rate bullet bond, semi-annual coupons by default, Actual/Actual ICMA unless `basis` says otherwise. */
export interface BondTerms {
  coupon: number; // percent per annum
  maturity: Date;
  freq?: number;
  basis?: DayCount;
}

export interface BondAnalytics {
  clean: number;
  dirty: number;
  accrued: number;
  /** Days from the previous coupon to settlement, counted on the bond's basis. */
  accruedDays: number;
  /** Days in the coupon period on the bond's basis: actual for ACT/ACT, 360/freq or 365/freq otherwise. */
  periodDays: number;
  /** Periods from settlement to the next coupon: the first cash flow's discount exponent. */
  fraction: number;
  basis: DayCount;
  yield: number;
  macaulay: number;
  modified: number;
  convexity: number;
  /** Price change per 1bp, per 100 face. */
  dv01: number;
  prevCoupon: Date;
  nextCoupon: Date;
  remaining: number;
  /** Years to maturity. */
  years: number;
}

/** Coupon schedule from maturity back to just before `settle`. */
export function couponSchedule(terms: BondTerms, settle: Date): Date[] {
  const freq = terms.freq ?? 2;
  if (![1, 2, 4, 12].includes(freq) || !Number.isFinite(terms.coupon) || terms.coupon < 0 ||
      !Number.isFinite(settle.getTime()) || !Number.isFinite(terms.maturity.getTime()) ||
      terms.maturity.getTime() <= settle.getTime() || terms.maturity.getTime() - settle.getTime() > 200 * 366 * DAY_MS) return [];
  const step = 12 / freq;
  const eom = isEndOfMonth(terms.maturity);
  const dates: Date[] = [];
  let k = 0;
  for (;;) {
    const d = addMonths(terms.maturity, -step * k);
    if (eom) d.setUTCMonth(d.getUTCMonth() + 1, 0);
    dates.unshift(d);
    if (d.getTime() <= settle.getTime()) break;
    k++;
  }
  return dates;
}

const lastOfFebruary = (d: Date) => d.getUTCMonth() === 1 && isEndOfMonth(d);
const days360 = (a: Date, b: Date, d1: number, d2: number) =>
  360 * (b.getUTCFullYear() - a.getUTCFullYear()) + 30 * (b.getUTCMonth() - a.getUTCMonth()) + d2 - d1;

/**
 * 30/360 US day count with the SIA end-of-month rules (Standard Securities Calculation Methods, "30/360 US"),
 * applied in order:
 * 1. an end-of-month bond with both dates on the last day of February: D2 = 30;
 * 2. an end-of-month bond with D1 on the last day of February: D1 = 30;
 * 3. D2 = 31 and D1 = 30 or 31: D2 = 30;
 * 4. D1 = 31: D1 = 30.
 * Rules 3 and 4 alone are ISDA 2006 section 4.16(f), 30/360 "Bond Basis": the result when `eom` is false.
 */
export function days30360(start: Date, end: Date, eom = false): number {
  let d1 = start.getUTCDate();
  let d2 = end.getUTCDate();
  if (eom && lastOfFebruary(start) && lastOfFebruary(end)) d2 = 30;
  if (eom && lastOfFebruary(start)) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  if (d1 === 31) d1 = 30;
  return days360(start, end, d1, d2);
}

/** 30E/360 (Eurobond basis), ISDA 2006 section 4.16(g): a 31st on either date counts as the 30th. */
export function days30E360(start: Date, end: Date): number {
  return days360(start, end, Math.min(30, start.getUTCDate()), Math.min(30, end.getUTCDate()));
}

const actualDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);

/**
 * Accrued days A, period days E and days to the next coupon DSC on the bond's basis, counted as the SIA methods and
 * Excel's PRICE/YIELD/COUPDAYS functions count them. ACT/ACT ICMA: actual days, E the actual length of the regular
 * period. 30/360 and 30E/360: A on the 30-day-month count, E = 360/freq, DSC = E - A. ACT/360 and ACT/365F: actual
 * A and DSC, E = 360/freq or 365/freq. Accrued interest is coupon/freq × A/E; the first cash flow is discounted
 * DSC/E periods and each later one a whole period more.
 */
function periodInfo(terms: BondTerms, settle: Date) {
  const sched = couponSchedule(terms, settle);
  const basis = terms.basis ?? 'ACT/ACT ICMA';
  if (sched.length < 2) return { prev: new Date(NaN), next: new Date(NaN), remaining: 0, period: NaN, accruedDays: NaN, w: NaN, basis };
  const freq = terms.freq ?? 2;
  const prev = sched[0];
  const next = sched[1];
  const remaining = sched.length - 1;
  let accruedDays: number;
  let period: number;
  let toNext: number;
  switch (basis) {
    case '30/360':
    case '30E/360':
      // The schedule keeps month ends when maturity is one, which makes this an end-of-month bond.
      accruedDays = basis === '30/360' ? days30360(prev, settle, isEndOfMonth(terms.maturity)) : days30E360(prev, settle);
      period = 360 / freq;
      toNext = period - accruedDays;
      break;
    case 'ACT/360':
    case 'ACT/365F':
      accruedDays = actualDays(prev, settle);
      period = (basis === 'ACT/360' ? 360 : 365) / freq;
      toNext = actualDays(settle, next);
      break;
    default:
      accruedDays = actualDays(prev, settle);
      period = actualDays(prev, next);
      toNext = actualDays(settle, next);
  }
  return { prev, next, remaining, period, accruedDays, w: toNext / period, basis };
}

export function accruedInterest(terms: BondTerms, settle: Date): number {
  const freq = terms.freq ?? 2;
  const { accruedDays, period } = periodInfo(terms, settle);
  return (terms.coupon / freq) * (accruedDays / period);
}

/** Dirty price per 100 face for a yield in percent. */
export function dirtyFromYield(terms: BondTerms, settle: Date, yieldPct: number): number {
  const freq = terms.freq ?? 2;
  if (!Number.isFinite(yieldPct) || yieldPct <= -100 * freq) return NaN;
  const { remaining, w } = periodInfo(terms, settle);
  if (!remaining) return NaN;
  const cpn = terms.coupon / freq;
  const v = 1 / (1 + yieldPct / 100 / freq);
  let pv = 0;
  if (cpn !== 0) for (let k = 0; k < remaining; k++) pv += cpn * v ** (w + k);
  pv += 100 * v ** (w + remaining - 1);
  return pv;
}

export function cleanFromYield(terms: BondTerms, settle: Date, yieldPct: number): number {
  return dirtyFromYield(terms, settle, yieldPct) - accruedInterest(terms, settle);
}

/** Clean price as a function of yield for a fixed settlement date (schedule computed once). */
export function cleanPricer(terms: BondTerms, settle: Date): (yieldPct: number) => number {
  const freq = terms.freq ?? 2;
  const { remaining, w, accruedDays, period } = periodInfo(terms, settle);
  const cpn = terms.coupon / freq;
  const accrued = cpn * (accruedDays / period);
  return (yieldPct) => {
    if (!remaining || !Number.isFinite(yieldPct) || yieldPct <= -100 * freq) return NaN;
    // A geometric annuity avoids summing every coupon for every intraday reprice.
    // log1p/expm1 retain precision around zero yield, where 1-v^n would cancel.
    const logV = -Math.log1p(yieldPct / 100 / freq);
    const coupons = cpn === 0 ? 0 : cpn * Math.exp(w * logV) * (logV === 0 ? remaining : Math.expm1(remaining * logV) / Math.expm1(logV));
    return coupons + 100 * Math.exp((w + remaining - 1) * logV) - accrued;
  };
}

/** Solves a positive clean price across the admissible nominal-yield domain; no arbitrary -5..60% clamp. */
export function yieldFromClean(terms: BondTerms, settle: Date, clean: number): number {
  if (!Number.isFinite(clean) || clean <= 0 || !couponSchedule(terms, settle).length) return NaN;
  const price = cleanPricer(terms, settle);
  const freq = terms.freq ?? 2;
  let lo = -100 * freq + 1e-8;
  let hi = Math.max(10, terms.coupon + 10);
  for (let i = 0; i < 60 && price(hi) > clean; i++) hi = hi * 2 + 10;
  if (!(price(lo) >= clean) || !(price(hi) <= clean)) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const p = price(mid);
    if (p > clean) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-11 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

export function analytics(terms: BondTerms, settle: Date, yieldPct: number): BondAnalytics {
  const freq = terms.freq ?? 2;
  const info = periodInfo(terms, settle);
  const cpn = terms.coupon / freq;
  const y = Number.isFinite(yieldPct) && yieldPct > -100 * freq ? yieldPct / 100 / freq : NaN;
  const v = 1 / (1 + y);
  let dirty = 0;
  let tw = 0;
  let cx = 0;
  for (let k = 0; k < info.remaining; k++) {
    const t = info.w + k;
    const cf = cpn + (k === info.remaining - 1 ? 100 : 0);
    const pv = cf * v ** t;
    dirty += pv;
    tw += t * pv;
    cx += cf * t * (t + 1) * v ** (t + 2);
  }
  const accrued = cpn * (info.accruedDays / info.period);
  const macaulay = tw / dirty / freq;
  const modified = macaulay / (1 + y);
  const convexity = cx / dirty / (freq * freq);
  return {
    clean: dirty - accrued,
    dirty,
    accrued,
    accruedDays: info.accruedDays,
    periodDays: info.period,
    fraction: info.w,
    basis: info.basis,
    yield: yieldPct,
    macaulay,
    modified,
    convexity,
    dv01: (modified * dirty) / 10000,
    prevCoupon: info.prev,
    nextCoupon: info.next,
    remaining: info.remaining,
    years: (terms.maturity.getTime() - settle.getTime()) / DAY_MS / 365.25,
  };
}

/** A call: the issuer may redeem the bond on `date` at `price` per 100 face. */
export interface Call {
  date: Date;
  price: number;
}

/** The share of the coupon period from coupon date `from` (whose next coupon is `next`) to `to`, on the bond's basis: A/E. */
function periodFraction(terms: BondTerms, from: Date, to: Date, next: Date): number {
  const freq = terms.freq ?? 2;
  switch (terms.basis ?? 'ACT/ACT ICMA') {
    case '30/360':
      return days30360(from, to, isEndOfMonth(terms.maturity)) / (360 / freq);
    case '30E/360':
      return days30E360(from, to) / (360 / freq);
    case 'ACT/360':
      return actualDays(from, to) / (360 / freq);
    case 'ACT/365F':
      return actualDays(from, to) / (365 / freq);
    default:
      return actualDays(from, to) / actualDays(from, next);
  }
}

/**
 * The bond's cash flows if it is redeemed on `red.date` at `red.price` per 100: the coupons on its schedule before
 * that date, then the redemption price with the coupon accrued since the last coupon date (the whole coupon when the
 * date is a coupon date). Each flow's exponent is in coupon periods from settlement, as for the price to maturity:
 * the next coupon DSC/E, each later one a period more, and a redemption between coupon dates the share of its
 * period on the bond's basis. Null when the date is not after settlement or is after maturity.
 */
export function redemptionFlows(terms: BondTerms, settle: Date, red: Call): { t: number; cf: number; date: Date }[] | null {
  const sched = couponSchedule(terms, settle);
  const { w } = periodInfo(terms, settle);
  if (sched.length < 2 || !Number.isFinite(w) || !(red.price > 0) || !Number.isFinite(red.date.getTime()) || red.date.getTime() <= settle.getTime() || red.date.getTime() > terms.maturity.getTime()) return null;
  const cpn = terms.coupon / (terms.freq ?? 2);
  let j = 0;
  while (j + 1 < sched.length && sched[j + 1].getTime() <= red.date.getTime()) j++;
  const flows: { t: number; cf: number; date: Date }[] = [];
  for (let i = 1; i <= j; i++) flows.push({ t: w + i - 1, cf: cpn, date: sched[i] });
  if (j >= 1 && sched[j].getTime() === red.date.getTime()) {
    flows[flows.length - 1].cf += red.price;
    return flows;
  }
  const frac = periodFraction(terms, sched[j], red.date, sched[j + 1]);
  flows.push({ t: w + j - 1 + frac, cf: cpn * frac + red.price, date: red.date });
  return flows;
}

/** Clean price per 100 for a yield in percent if the bond is redeemed as `red` says; NaN when it cannot be. */
export function cleanToRedemption(terms: BondTerms, settle: Date, red: Call, yieldPct: number): number {
  const freq = terms.freq ?? 2;
  const flows = redemptionFlows(terms, settle, red);
  if (!flows || !Number.isFinite(yieldPct) || yieldPct <= -100 * freq) return NaN;
  const logV = -Math.log1p(yieldPct / 100 / freq);
  return flows.reduce((a, f) => a + f.cf * Math.exp(f.t * logV), 0) - accruedInterest(terms, settle);
}

/** The yield in percent at which redeeming as `red` says gives this clean price; NaN without one. */
export function yieldToRedemption(terms: BondTerms, settle: Date, red: Call, clean: number): number {
  if (!Number.isFinite(clean) || clean <= 0 || !redemptionFlows(terms, settle, red)) return NaN;
  const freq = terms.freq ?? 2;
  const price = (y: number) => cleanToRedemption(terms, settle, red, y);
  let lo = -100 * freq + 1e-8;
  let hi = Math.max(10, terms.coupon + 10);
  for (let i = 0; i < 60 && price(hi) > clean; i++) hi = hi * 2 + 10;
  if (!(price(lo) >= clean) || !(price(hi) <= clean)) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (price(mid) > clean) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-11 * Math.max(1, Math.abs(mid))) break;
  }
  return (lo + hi) / 2;
}

export interface Workout {
  kind: 'call' | 'maturity';
  date: Date;
  /** Redemption price per 100. */
  price: number;
  /** Yield to this date from the clean price given. */
  yield: number;
  /** Clean price to this date at the yield given. */
  cleanAtYield: number;
}

/**
 * Yield to each call and to maturity from a clean price, and the clean price to each at a yield. The yield to worst
 * is the lowest of those yields (its date is the workout date), the price to worst the lowest of those prices. Each
 * call is treated as a certain redemption: there is no option value, so this is not an option-adjusted measure.
 */
export function workouts(terms: BondTerms, settle: Date, calls: readonly Call[], clean: number, yieldPct: number): { rows: Workout[]; toWorst: Workout | null; priceToWorst: Workout | null } {
  const rows: Workout[] = [...calls.map((c) => ({ kind: 'call' as const, ...c })), { kind: 'maturity' as const, date: terms.maturity, price: 100 }]
    .map((r) => ({ ...r, yield: yieldToRedemption(terms, settle, r, clean), cleanAtYield: cleanToRedemption(terms, settle, r, yieldPct) }));
  const pick = (key: 'yield' | 'cleanAtYield') => rows.filter((r) => Number.isFinite(r[key])).reduce<Workout | null>((a, r) => (!a || r[key] < a[key] ? r : a), null);
  return { rows, toWorst: pick('yield'), priceToWorst: pick('cleanAtYield') };
}

/**
 * A call schedule typed one call a line, "date, price" (YYYY-MM-DD and the price per 100; commas, semicolons, tabs or
 * spaces between). Calls on or before settlement are left out and counted, as are calls on or after maturity (the
 * maturity is always a workout). A date given twice, or a price that is not positive, is an error.
 */
export function parseCallSchedule(text: string, settle: Date, maturity: Date): { calls: Call[]; past: number; late: number } | { error: string } {
  const calls: Call[] = [];
  let past = 0;
  let late = 0;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 400) return { error: 'At most 400 calls.' };
  for (const line of lines) {
    const m = /^(\d{4}-\d{2}-\d{2})[\s,;]+([0-9]+(?:\.[0-9]+)?)$/.exec(line);
    const date = m ? new Date(`${m[1]}T00:00:00Z`) : new Date(NaN);
    if (!m || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== m[1]) return { error: `Write each call as a date and a price per 100, such as 2028-06-15, 101.5: "${line.slice(0, 40)}" is not.` };
    const price = Number(m[2]);
    if (!(price > 0)) return { error: `The call on ${m[1]} needs a price above zero.` };
    if (calls.some((c) => c.date.getTime() === date.getTime())) return { error: `${m[1]} is in the schedule twice.` };
    if (date.getTime() <= settle.getTime()) past++;
    else if (date.getTime() >= maturity.getTime()) late++;
    else calls.push({ date, price });
  }
  calls.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { calls, past, late };
}

/**
 * Market-standard settlement lag in business days: T+1 for US Treasuries (and US corporates, T+1 since the SEC's
 * Rule 15c6-1 change of 28 May 2024), T+2 for European government bonds, corporates and Eurobonds. With no bond
 * given, the US Treasury lag. The lag is configurable in BONDCALC; confirm it for the trade.
 */
export function defaultSettlementLag(bond?: { country: string }): number {
  return !bond || bond.country === 'US' ? 1 : 2;
}

/** `days` business days after `date`, weekends skipped and no holiday calendar (T+1 settlement by default). */
export function settlementDate(date: Date, days = 1): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  let n = days;
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
  }
  return d;
}

/** Formats a coupon the way Treasury tickers show it, e.g. 4.125 -> "4 1/8". */
export function couponFraction(c: number): string {
  const whole = Math.floor(c + 1e-9);
  const eighths = Math.round((c - whole) * 8);
  if (eighths === 0) return `${whole}`;
  if (eighths === 8) return `${whole + 1}`;
  const map: Record<number, string> = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };
  return `${whole} ${map[eighths]}`;
}

/** Treasury price rounded to 1/64, e.g. 99.515625 -> "99-16+"; carries across a whole point. */
export function to32nds(price: number): string {
  if (!Number.isFinite(price) || price < 0) return '--';
  const units = Math.round(price * 64);
  return `${Math.floor(units / 64)}-${String(Math.floor((units % 64) / 2)).padStart(2, '0')}${units % 2 ? '+' : ''}`;
}
