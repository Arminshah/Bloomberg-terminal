import { addMonths, isEndOfMonth, DAY_MS } from '../data/calendar';

/** Fixed-rate bullet bond, semi-annual coupons, actual/actual (ICMA). */
export interface BondTerms {
  coupon: number; // percent per annum
  maturity: Date;
  freq?: number;
}

export interface BondAnalytics {
  clean: number;
  dirty: number;
  accrued: number;
  accruedDays: number;
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

function periodInfo(terms: BondTerms, settle: Date) {
  const sched = couponSchedule(terms, settle);
  if (sched.length < 2) return { prev: new Date(NaN), next: new Date(NaN), remaining: 0, period: NaN, accruedDays: NaN, w: NaN };
  const prev = sched[0];
  const next = sched[1];
  const remaining = sched.length - 1;
  const period = (next.getTime() - prev.getTime()) / DAY_MS;
  const accruedDays = Math.round((settle.getTime() - prev.getTime()) / DAY_MS);
  const w = (next.getTime() - settle.getTime()) / DAY_MS / period;
  return { prev, next, remaining, period, accruedDays, w };
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
    const v = 1 / (1 + yieldPct / 100 / freq);
    let pv = 0;
    let vk = v ** w;
    for (let k = 0; k < remaining; k++) {
      if (cpn !== 0) pv += cpn * vk;
      vk *= v;
    }
    pv += 100 * v ** (w + remaining - 1);
    return pv - accrued;
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

/** Next business day after `date` (T+1 settlement). */
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
