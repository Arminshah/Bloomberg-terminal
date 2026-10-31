// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { analytics, couponSchedule, type BondAnalytics, type BondTerms } from './bonds';

const DAY_MS = 86_400_000;

/**
 * A yield compounded `from` times a year restated at `to` times a year, in percent: YAS quotes yields semi-annually
 * whatever the bond pays ("Yields are: Semi-Annual"; GKN's annual 5.9463 is 5.8604 semi-annual, METHODOLOGY.md 14),
 * and its Equiv line restates them once a year.
 */
export function restateYield(yieldPct: number, from: number, to: number): number {
  if (!Number.isFinite(yieldPct) || !(from > 0) || !(to > 0)) return NaN;
  return to * ((1 + yieldPct / 100 / from) ** (from / to) - 1) * 100;
}

export interface YasRisk {
  /** The yield on the quoting basis, in percent. */
  yieldPct: number;
  /** Modified duration on the quoting basis: Macaulay over one plus the period yield. */
  modified: number;
  /** YAS's Risk: modified duration times the full price over 100 (inferred from two published screens). */
  risk: number;
  /** Convexity as YAS shows it: scaled by one hundredth. */
  convexity: number;
  /** The value of a basis point on a face amount. */
  dvOn: (face: number) => number;
}

/** YAS's risk block for analytics `a` of a bond paying `freq` times a year, with yields quoted `basis` times a year. */
export function yasRisk(a: BondAnalytics, freq: number, basis = 2): YasRisk {
  const y = restateYield(a.yield, freq, basis);
  const modified = a.macaulay / (1 + y / 100 / basis);
  return { yieldPct: y, modified, risk: (modified * a.dirty) / 100, convexity: a.convexity / 100, dvOn: (face) => (modified * a.dirty) / 10000 / 100 * face };
}

/** Current yield: the annual coupon over the clean price, in percent. */
export function currentYield(coupon: number, clean: number): number {
  return clean > 0 ? (coupon / clean) * 100 : NaN;
}

/** YAS's Invoice for a face amount: principal at the clean price, the accrued interest and their total. */
export function invoice(a: BondAnalytics, face: number): { face: number; principal: number; accrued: number; total: number; days: number } {
  return { face, principal: (a.clean / 100) * face, accrued: (a.accrued / 100) * face, total: (a.dirty / 100) * face, days: a.accruedDays };
}

/**
 * The money-market yield on Act/360 for a bond in its last coupon period: what the last coupon and the redemption
 * return on the full price, simple interest over the actual days to maturity on a 360-day year. NaN with more than one
 * payment left, as YAS leaves the box empty for a long bond (TE07 03:47).
 */
export function moneyMarketYield(terms: BondTerms, settle: Date, a: BondAnalytics): number {
  if (a.remaining !== 1) return NaN;
  const freq = terms.freq ?? 2;
  const days = (terms.maturity.getTime() - settle.getTime()) / DAY_MS;
  if (!(days > 0) || !(a.dirty > 0)) return NaN;
  return ((100 + terms.coupon / freq) / a.dirty - 1) * (360 / days) * 100;
}

/**
 * The after-tax yield YAS shows under "After Tax (Inc x % CG y %)": the yield that discounts the coupons less income
 * tax, and the redemption less tax on the gain over the clean price paid, to the full price; the accrued interest
 * bought is returned untaxed in the first coupon. Periods and discounting as the street yield.
 */
export function afterTaxYield(terms: BondTerms, _settle: Date, a: BondAnalytics, incomeTax: number, gainsTax: number): number {
  const freq = terms.freq ?? 2;
  const cpn = terms.coupon / freq;
  const n = a.remaining;
  if (!(n > 0) || !(a.dirty > 0)) return NaN;
  const gain = Math.max(0, 100 - a.clean);
  const flows = Array.from({ length: n }, (_, k) => {
    const taxable = k === 0 ? cpn - a.accrued : cpn;
    const coupon = cpn - Math.max(0, taxable) * incomeTax / 100;
    return { t: a.fraction + k, cf: coupon + (k === n - 1 ? 100 - gain * gainsTax / 100 : 0) };
  });
  const pv = (yPct: number) => flows.reduce((s, f) => s + f.cf / (1 + yPct / 100 / freq) ** f.t, 0);
  let lo = -50;
  let hi = 100;
  if (!(pv(lo) >= a.dirty && pv(hi) <= a.dirty)) return NaN;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > a.dirty) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The coupons left after settlement, for a quick check that a schedule exists. */
export const paymentsLeft = (terms: BondTerms, settle: Date) => Math.max(0, couponSchedule(terms, settle).length - 1);

export { analytics };
