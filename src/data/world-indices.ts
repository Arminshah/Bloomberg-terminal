// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { Horizon } from './analytics';

/**
 * The world's equity indices compared (WEIS, rankings; WM, the map): each index's price return over a period, in its
 * own currency or turned into another. A return in another currency compounds the local return with the move of
 * the index's currency against that one: (1 + r) × (1 + c_local) / (1 + c_target) − 1, where c is each currency's
 * change against the US dollar over the same period.
 */

export const WORLD_PERIODS: { n: number; label: string; h: Horizon }[] = [
  { n: 1, label: '1D', h: '1D' },
  { n: 2, label: '1W', h: '5D' },
  { n: 3, label: '1M', h: '1M' },
  { n: 4, label: '3M', h: '3M' },
  { n: 5, label: 'YTD', h: 'YTD' },
  { n: 6, label: '1Y', h: '1Y' },
];

/** Local, or the currency to compare in. */
export const WORLD_CURRENCIES = ['Local', 'USD', 'EUR', 'GBP', 'JPY', 'CHF'] as const;

/** A local return in percent turned into another currency, from both currencies' changes against the dollar in percent. */
export function inCurrency(localPct: number, localVsUsdPct: number, targetVsUsdPct: number): number {
  const r = 1 + localPct / 100;
  const a = 1 + localVsUsdPct / 100;
  const b = 1 + targetVsUsdPct / 100;
  return r > 0 && a > 0 && b > 0 ? (r * a / b - 1) * 100 : NaN;
}

/** Rows ranked by their value, highest first; the ones without a value after them, in their own order. */
export function ranked<T>(rows: readonly T[], value: (r: T) => number): { row: T; rank: number | null }[] {
  const have = rows.filter((r) => Number.isFinite(value(r))).sort((a, b) => value(b) - value(a));
  const lack = rows.filter((r) => !Number.isFinite(value(r)));
  return [...have.map((row, i) => ({ row, rank: i + 1 })), ...lack.map((row) => ({ row, rank: null }))];
}

/**
 * WM's map: one main index for each market, on a grid laid out roughly as the world is (column, row). The grid is
 * the app's own drawing; no map artwork is used.
 */
export const MAP_TILES: { country: string; name: string; id: string; col: number; row: number }[] = [
  { country: 'CA', name: 'Canada', id: 'SPTSX Index', col: 2, row: 1 },
  { country: 'US', name: 'United States', id: 'SPX Index', col: 2, row: 2 },
  { country: 'MX', name: 'Mexico', id: 'MEXBOL Index', col: 2, row: 3 },
  { country: 'BR', name: 'Brazil', id: 'IBOV Index', col: 4, row: 5 },
  { country: 'SE', name: 'Sweden', id: 'OMX Index', col: 10, row: 0 },
  { country: 'IE', name: 'Ireland', id: 'ISEQ Index', col: 7, row: 1 },
  { country: 'GB', name: 'United Kingdom', id: 'UKX Index', col: 8, row: 1 },
  { country: 'NL', name: 'Netherlands', id: 'AEX Index', col: 9, row: 1 },
  { country: 'DE', name: 'Germany', id: 'DAX Index', col: 10, row: 1 },
  { country: 'BE', name: 'Belgium', id: 'BEL20 Index', col: 8, row: 2 },
  { country: 'FR', name: 'France', id: 'CAC Index', col: 9, row: 2 },
  { country: 'CH', name: 'Switzerland', id: 'SMI Index', col: 10, row: 2 },
  { country: 'AT', name: 'Austria', id: 'ATX Index', col: 11, row: 2 },
  { country: 'PT', name: 'Portugal', id: 'PSI20 Index', col: 7, row: 3 },
  { country: 'ES', name: 'Spain', id: 'IBEX Index', col: 8, row: 3 },
  { country: 'IT', name: 'Italy', id: 'FTSEMIB Index', col: 10, row: 3 },
  { country: 'KR', name: 'South Korea', id: 'KOSPI Index', col: 16, row: 1 },
  { country: 'JP', name: 'Japan', id: 'NKY Index', col: 17, row: 1 },
  { country: 'CN', name: 'China', id: 'SHSZ300 Index', col: 15, row: 2 },
  { country: 'TW', name: 'Taiwan', id: 'TWSE Index', col: 16, row: 3 },
  { country: 'IN', name: 'India', id: 'NIFTY Index', col: 13, row: 3 },
  { country: 'HK', name: 'Hong Kong', id: 'HSI Index', col: 15, row: 3 },
  { country: 'SG', name: 'Singapore', id: 'STI Index', col: 15, row: 4 },
  { country: 'AU', name: 'Australia', id: 'AS51 Index', col: 16, row: 6 },
];
