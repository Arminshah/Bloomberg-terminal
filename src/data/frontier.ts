// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { parseListing, yahooListingSymbol } from './listings';
import { meanVariance, minVarianceLongOnly, periodReturns, portfolioStats, sharpe, tangency, type MeanVariance, type PortfolioStats } from '../finance/mean-variance';
import type { MonthEndSeries } from './live/month-end-prices';

/**
 * The mean-variance screen's inputs and results (FRONTIER): securities typed the terminal's way, their month-end last
 * prices over whole months, and the analysis of the first portfolio paper on their monthly returns.
 */

export interface Asset {
  /** As the screen shows it: "BATS LN Equity". */
  label: string;
  /** Yahoo's symbol: BATS.L. */
  yahoo: string;
}

/** Securities typed as "BATS LN", "BATS LN Equity", "BATS.L", "AAPL US" or "AAPL", separated by commas or new lines. */
export function parseAssets(text: string): { assets: Asset[]; bad: string[] } {
  const assets: Asset[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[,;\n]+/)) {
    const t = raw.trim().toUpperCase().replace(/\s+EQUITY$/, '');
    if (!t) continue;
    const eu = parseListing(t);
    let a: Asset | null = null;
    if (eu) a = { label: `${eu.root} ${eu.listing.code} Equity`, yahoo: yahooListingSymbol(eu.root, eu.listing) };
    else {
      const us = /^([A-Z]{1,5}(?:[./-][A-Z])?)(?:\s+US)?$/.exec(t);
      if (us) a = { label: `${us[1].replace(/[.-]/, '/')} US Equity`, yahoo: us[1].replace(/[./]/, '-') };
    }
    if (!a) bad.push(raw.trim());
    else if (!assets.some((x) => x.yahoo === a!.yahoo)) assets.push(a);
  }
  return { assets, bad };
}

/** The months from `from` to `to`, YYYY-MM, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface PriceTable {
  months: string[];
  /** The row's date: the latest month-end trading day among the securities kept. */
  dates: string[];
  /** Securities with a close in every month, in the order typed. */
  kept: Asset[];
  /** prices[k][i]: security k's close in month i. */
  prices: number[][];
  /** Securities with no prices at all. */
  missing: Asset[];
  /** Securities with prices, but not in every month (listed later, or stopped). */
  partial: { asset: Asset; first?: string; last?: string }[];
}

/** The month-end table over whole months; a security without a close in every month is left out and named. */
export function priceTable(assets: Asset[], by: Record<string, MonthEndSeries | null | undefined>, from: string, to: string): PriceTable {
  const months = monthsBetween(from, to);
  const kept: Asset[] = [];
  const prices: number[][] = [];
  const missing: Asset[] = [];
  const partial: PriceTable['partial'] = [];
  for (const a of assets) {
    const s = by[a.yahoo];
    if (!s) {
      missing.push(a);
      continue;
    }
    const row = months.map((m) => s.months[m]?.close);
    if (row.some((v) => v === undefined)) {
      const have = months.filter((m) => s.months[m]);
      if (!have.length) missing.push(a);
      else partial.push({ asset: a, first: have[0], last: have[have.length - 1] });
      continue;
    }
    kept.push(a);
    prices.push(row as number[]);
  }
  const dates = months.map((m) => kept.map((a) => by[a.yahoo]!.months[m].day).sort().at(-1) ?? '');
  return { months, dates, kept, prices, missing, partial };
}

export interface Analysis {
  mv: MeanVariance;
  gmvp: PortfolioStats;
  ewp: PortfolioStats;
  /** Null when rf is at or above the minimum-variance return. */
  tp: { weights: number[]; stats: PortfolioStats; sharpe: number } | null;
}

/** The analysis of a price table's monthly returns, rf per month; null when the closed forms do not exist. */
export function analyse(prices: number[][], rf: number): Analysis | null {
  const mv = meanVariance(prices.map(periodReturns));
  if (!mv) return null;
  const weights = tangency(mv, rf);
  const tpStats = weights ? portfolioStats(weights, mv.mu, mv.sigma) : null;
  return {
    mv,
    gmvp: portfolioStats(mv.gmvp, mv.mu, mv.sigma),
    ewp: portfolioStats(mv.ewp, mv.mu, mv.sigma),
    tp: weights && tpStats ? { weights, stats: tpStats, sharpe: sharpe(tpStats, rf) } : null,
  };
}

/** The long-only minimum-variance portfolio of a price table (the paper's screened names); null when it does not exist. */
export function optimum(prices: number[][]): { weights: number[]; stats: PortfolioStats } | null {
  const mv = meanVariance(prices.map(periodReturns));
  const weights = mv ? minVarianceLongOnly(mv.sigma) : null;
  return mv && weights ? { weights, stats: portfolioStats(weights, mv.mu, mv.sigma) } : null;
}
