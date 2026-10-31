// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { AdjustedBar } from './live/adjusted-history';
import type { Policy } from '../finance/mpc';

/**
 * The dissertation's back-tests (MPC applied to portfolio management, Tables 5.3 to 5.15): its 20 stocks, its fixed
 * settings and, for each table, the setting it varies over five values.
 */

export interface Stock {
  /** As the dissertation writes it. */
  ticker: string;
  name: string;
  /** Tiingo's ticker for its history today, when it differs. */
  tiingo?: string;
  note?: string;
}

/** Table 5.1's companies, in its order, with the ticker each had in the notebook. */
export const STOCKS: Stock[] = [
  { ticker: 'AKAM', name: 'Akamai Technologies' },
  { ticker: 'JNPR', name: 'Juniper Networks', note: 'no longer listed' },
  { ticker: 'MSI', name: 'Motorola Solutions' },
  { ticker: 'ACN', name: 'Accenture' },
  { ticker: 'ADBE', name: 'Adobe' },
  { ticker: 'ABT', name: 'Abbott Laboratories' },
  { ticker: 'HCP', name: 'HCP', tiingo: 'DOC', note: 'now Healthpeak Properties, DOC' },
  { ticker: 'BAX', name: 'Baxter International' },
  { ticker: 'ALXN', name: 'Alexion Pharmaceuticals', note: 'no longer listed' },
  { ticker: 'PDCO', name: 'Patterson Companies', note: 'no longer listed' },
  { ticker: 'VIAB', name: 'Viacom', note: 'no longer listed' },
  { ticker: 'ADS', name: 'Alliance Data Systems', tiingo: 'BFH', note: 'now Bread Financial, BFH; the dissertation calls it Konami' },
  { ticker: 'URBN', name: 'Urban Outfitters' },
  { ticker: 'ATVI', name: 'Activision Blizzard', note: 'no longer listed' },
  { ticker: 'AMZN', name: 'Amazon.com' },
  { ticker: 'PPL', name: 'PPL Corporation' },
  { ticker: 'AEE', name: 'Ameren Corporation' },
  { ticker: 'NOV', name: 'National Oilwell Varco', note: 'now NOV Inc.' },
  { ticker: 'AES', name: 'AES Corporation' },
  { ticker: 'AEP', name: 'American Electric Power' },
];

export interface Settings {
  horizon: number;
  riskAversion: number;
  tradingAversion: number;
  holdingAversion: number;
  leverage?: number;
  longOnly?: boolean;
  dollarNeutral?: boolean;
}

export type Varied = 'horizon' | 'riskAversion' | 'tradingAversion' | 'holdingAversion' | 'leverage';

export interface TestDef {
  id: string;
  /** The dissertation's table and figure. */
  table: string;
  title: string;
  hold?: boolean;
  fixed: Settings;
  varied?: Varied;
  values?: number[];
}

const RAV = [1, 5, 10, 20, 50];
const TAV = [0.5, 0.7, 1, 1.2, 1.5];
const HAV = [1, 5, 10, 20, 50];
const LEV = [1, 1.5, 2, 2.5, 3];

export const TESTS: TestDef[] = [
  { id: 'hold', table: 'Table 5.3, Figure 5.5', title: 'Holding investment policy.', hold: true, fixed: { horizon: 0, riskAversion: 0, tradingAversion: 0, holdingAversion: 0 } },
  { id: 'horizon', table: 'Table 5.4, Figure 5.6', title: 'MPC investment policy. Forecast horizon test.', fixed: { horizon: 10, riskAversion: 5, tradingAversion: 1, holdingAversion: 1, leverage: 3 }, varied: 'horizon', values: [0, 10, 50, 100, 250] },
  { id: 'rav1', table: 'Table 5.5, Figure 5.7', title: 'MPC investment policy. RAvs test1.', fixed: { horizon: 10, riskAversion: 5, tradingAversion: 1, holdingAversion: 1, leverage: 3 }, varied: 'riskAversion', values: RAV },
  { id: 'rav2', table: 'Table 5.6, Figure 5.8', title: 'MPC investment policy. RAvs test2.', fixed: { horizon: 100, riskAversion: 5, tradingAversion: 1, holdingAversion: 1, leverage: 3 }, varied: 'riskAversion', values: RAV },
  { id: 'tav1', table: 'Table 5.7, Figure 5.9', title: 'MPC investment policy. TAvs test1.', fixed: { horizon: 10, riskAversion: 1, tradingAversion: 1, holdingAversion: 1, leverage: 3 }, varied: 'tradingAversion', values: TAV },
  { id: 'tav2', table: 'Table 5.8, Figure 5.10', title: 'MPC investment policy. TAvs test2.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 1, holdingAversion: 1, leverage: 3 }, varied: 'tradingAversion', values: TAV },
  { id: 'hav1', table: 'Table 5.9, Figure 5.11', title: 'MPC investment policy. HAvs test1.', fixed: { horizon: 10, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3 }, varied: 'holdingAversion', values: HAV },
  { id: 'hav2', table: 'Table 5.10, Figure 5.12', title: 'MPC investment policy. HAvs test2.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3 }, varied: 'holdingAversion', values: HAV },
  { id: 'lev1', table: 'Table 5.11, Figure 5.13', title: 'MPC investment policy. Levs test1.', fixed: { horizon: 10, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3 }, varied: 'leverage', values: LEV },
  { id: 'lev2', table: 'Table 5.12, Figure 5.14', title: 'MPC investment policy. Levs test2.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3 }, varied: 'leverage', values: LEV },
  { id: 'long', table: 'Table 5.13, Figures 5.15 and 5.16', title: 'MPC investment policy. Long Only. RAvs test.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, longOnly: true }, varied: 'riskAversion', values: RAV },
  { id: 'dn-rav', table: 'Table 5.14, Figures 5.17 and 5.18', title: 'MPC investment policy. Dollar Neutral portfolio. RAvs test.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3, dollarNeutral: true }, varied: 'riskAversion', values: RAV },
  { id: 'dn-lev', table: 'Table 5.15, Figures 5.19 and 5.20', title: 'MPC investment policy. Dollar Neutral portfolio. Levs test.', fixed: { horizon: 100, riskAversion: 1, tradingAversion: 0.7, holdingAversion: 1, leverage: 3, dollarNeutral: true }, varied: 'leverage', values: LEV },
];

/** The policy of a test's k-th value (or of its fixed settings). */
export function policyOf(t: TestDef, k: number): Policy {
  if (t.hold) return { kind: 'hold' };
  const s: Settings = { ...t.fixed, ...(t.varied && t.values ? { [t.varied]: t.values[k] } : {}) };
  return { kind: 'mpc', horizon: s.horizon, riskAversion: s.riskAversion, tradingAversion: s.tradingAversion, holdingAversion: s.holdingAversion, leverage: s.leverage, longOnly: s.longOnly, dollarNeutral: s.dollarNeutral };
}

export interface Aligned {
  dates: string[];
  prices: number[][];
  /** DTB3, % a year, on each date: the latest value published on or before it. */
  rf: number[];
  /** Days a stock had no price, carried from the day before (zero return), as the notebook's forward fill did. */
  filled: number[];
  /** Stocks with no price on the first date: they cannot start the back-test. */
  lateStart: number[];
}

/** Every stock's adjusted closes on the union of their trading days, with the risk-free rate on each day. */
export function align(bars: AdjustedBar[][], dtb3: [string, number][]): Aligned {
  const dates = [...new Set(bars.flatMap((b) => b.map((x) => x.date)))].sort();
  const filled = bars.map(() => 0);
  const lateStart: number[] = [];
  const prices = bars.map((b, k) => {
    const by = new Map(b.map((x) => [x.date, x.adj]));
    let last = NaN;
    return dates.map((d, i) => {
      const v = by.get(d);
      if (v !== undefined) last = v;
      else if (i === 0) lateStart.push(k);
      else filled[k]++;
      return last;
    });
  });
  let j = -1;
  const rf = dates.map((d) => {
    while (j + 1 < dtb3.length && dtb3[j + 1][0] <= d) j++;
    return j >= 0 ? dtb3[j][1] : NaN;
  });
  return { dates, prices, rf, filled, lateStart };
}
