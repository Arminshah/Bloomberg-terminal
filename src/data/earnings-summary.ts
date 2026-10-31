// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { DAY_MS } from './calendar';

/**
 * The two figures EARNINGSSUMMARY (EE) works out itself; every other figure on the page is another screen's.
 */

/**
 * The next twelve months' EPS, blended from the current and next fiscal years' consensus by the share of the current
 * year still to run: (days left in the current year / 365) × its EPS + the rest × the next year's. A current year that
 * has ended counts for nothing. NaN without both years.
 */
export function blendedForwardEps(current: { end: string; eps: number } | undefined, next: { end: string; eps: number } | undefined, todayIso: string): number {
  if (!current || !next || !Number.isFinite(current.eps) || !Number.isFinite(next.eps)) return NaN;
  const left = (Date.parse(`${current.end}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / DAY_MS;
  if (!Number.isFinite(left)) return NaN;
  const w = Math.min(1, Math.max(0, left / 365));
  return w * current.eps + (1 - w) * next.eps;
}

export interface SurpriseTally {
  above: number;
  met: number;
  below: number;
  /** Reports with a surprise: the rest had no estimate or no comparable figure. */
  count: number;
}

/** How many reports came in above, at or below the estimate, from their surprises in percent (NaN left out). */
export function surpriseTally(surprises: readonly number[]): SurpriseTally {
  const s = surprises.filter((x) => Number.isFinite(x));
  return { above: s.filter((x) => x > 0).length, met: s.filter((x) => x === 0).length, below: s.filter((x) => x < 0).length, count: s.length };
}
