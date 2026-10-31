// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { DAY_MS } from './calendar';
import type { ShareCount, SplitEvent } from './marketcap';

/**
 * Denominators for short interest at a settlement date. FINRA gives the shares sold short at each settlement; a
 * percentage of shares outstanding needs the count at that date, not today's. The SEC filings' cover pages give
 * dated counts: the one dated on or before the settlement (within 200 days, about two reports) is used, with any
 * stock split between the two dates applied so both are in the settlement date's shares. Without such a count the
 * percentage is unknown. No dated float exists in the sources, so a percentage of float is only given against
 * today's float, for the latest settlement, and says so.
 */

const dayOf = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

export interface DatedShares {
  val: number;
  /** The date the count is as of (ISO). */
  end: string;
}

export function sharesOutAt(counts: ShareCount[], splits: SplitEvent[], day: number, maxAge = 200): DatedShares | null {
  let best: ShareCount | undefined;
  for (const c of counts) {
    const d = dayOf(c.end);
    if (d <= day && day - d <= maxAge && (!best || c.end > best.end)) best = c;
  }
  if (!best || !(best.val > 0)) return null;
  const from = dayOf(best.end);
  let f = 1;
  for (const s of splits) if (s.day > from && s.day <= day && s.numerator > 0 && s.denominator > 0) f *= s.numerator / s.denominator;
  return { val: best.val * f, end: best.end };
}

/** Short interest as a percentage of the shares outstanding at its settlement date (date in ms); NaN without a count. */
export function pctOfSharesAt(shortShares: number, date: number, counts: ShareCount[], splits: SplitEvent[]): { pct: number; basis: DatedShares | null } {
  const basis = sharesOutAt(counts, splits, Math.floor(date / DAY_MS));
  return { pct: basis && shortShares >= 0 ? (shortShares / basis.val) * 100 : NaN, basis };
}
