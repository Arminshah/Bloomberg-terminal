// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * World currency rates (WCR) against any base, worked out through the US dollar: each currency's rate is its value
 * in dollars against the base's, and its change against the base is its change against the dollar net of the base's.
 */

/** Units of a currency for one unit of the base, from both currencies' values in US dollars. */
export function ratePerBase(usdPerCurrency: number, usdPerBase: number): number {
  return usdPerCurrency > 0 && usdPerBase > 0 ? usdPerBase / usdPerCurrency : NaN;
}

/**
 * A currency's percent change against the base over a period, from both currencies' percent changes against the
 * dollar over it: (1 + c) / (1 + b) − 1. Positive when the currency gained on the base.
 */
export function crossPct(currencyVsUsdPct: number, baseVsUsdPct: number): number {
  const c = 1 + currencyVsUsdPct / 100;
  const b = 1 + baseVsUsdPct / 100;
  return c > 0 && b > 0 ? (c / b - 1) * 100 : NaN;
}

/** Decimals for a rate: more for small numbers, as dealers quote them. */
export const rateDecimals = (rate: number): number => (!Number.isFinite(rate) ? 2 : rate >= 100 ? 3 : rate >= 10 ? 4 : 5);

/** The regions WCR groups currencies by, as the currency list names them. */
export const WCR_VIEWS = [
  { n: 1, label: 'All', region: undefined },
  { n: 2, label: 'Americas', region: 'Americas' },
  { n: 3, label: 'Europe, Middle East & Africa', region: 'EMEA' },
  { n: 4, label: 'Asia-Pacific', region: 'APAC' },
  { n: 5, label: 'My basket', region: undefined },
] as const;

/** The bases WCR offers. */
export const WCR_BASES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'] as const;
