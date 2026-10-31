// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import {
  BUYBACK_LINES, COVER_SHARES, FACT_LINES, fiscalLabel, lineValues, standaloneQuarterValues, type CompanyFacts, type FactLine, type PeriodKind, type Reported,
} from './live/sec';

/**
 * BBK, the buyback summary, from a company's XBRL facts: cash paid to repurchase stock (cash-flow statement), the
 * shares bought back (equity statement), the average price paid, dividends paid beside them, the share count on
 * each filing's cover, and the repurchase program's authorization and remaining amount. Quarters a company reports
 * only as year-to-date totals are the difference of two totals, marked as calculated.
 */

export interface BuybackRow {
  end: string;
  start?: string;
  label?: string;
  /** Cash paid for repurchases. */
  buyback?: number;
  /** Calculated from year-to-date totals rather than reported for the quarter. */
  derived?: boolean;
  shares?: number;
  /** The share count is a year-to-date total less the previous one. */
  sharesDerived?: boolean;
  dividends?: number;
  /** Shares outstanding on the cover of the filing for this period (the date on the cover, soon after the period). */
  sharesOut?: number;
  /** Form and accession of the filing behind the buyback figure. */
  form?: string;
  accn?: string;
}

export interface BuybackSummary {
  rows: BuybackRow[];
  /** The last four quarters (or the last fiscal year when quarters are missing). */
  ltm: {
    buyback: number;
    shares: number;
    dividends: number;
    through: string;
    basis: 'quarters' | 'year';
    /** How far the share count can be off through the filings' rounding (shares). */
    sharesRounding: number;
    /** The periods whose share count the filings do not give. */
    sharesMissing: BuybackRow[];
  } | null;
  authorized?: { val: number; end: string };
  remaining?: { val: number; end: string };
  sharesNow?: { val: number; end: string };
  /** Shares outstanding a year before the latest cover count. */
  sharesYearAgo?: { val: number; end: string };
}

const line = (key: string): FactLine => [...FACT_LINES, ...BUYBACK_LINES].find((l) => l.key === key)!;

/** Shares are additive over time like money: quarters are derived from year-to-date counts the same way. */
function shareQuarters(cf: CompanyFacts, l: FactLine): Map<string, Reported> {
  return standaloneQuarterValues(cf.facts, { ...l, measure: 'money' }, 'shares');
}

function values(cf: CompanyFacts, key: string, ccy: string, kind: PeriodKind): Map<string, Reported> {
  const l = line(key);
  if (l.measure === 'shares') return kind === 'quarter' ? shareQuarters(cf, l) : lineValues(cf.facts, l, ccy, 'annual');
  return kind === 'quarter' ? standaloneQuarterValues(cf.facts, l, ccy) : lineValues(cf.facts, l, ccy, 'annual');
}

/** The latest point-in-time figure of a line ("authorization remaining at the period end"). */
function latestStock(cf: CompanyFacts, key: string, ccy: string): { val: number; end: string } | undefined {
  const l = line(key);
  let best: { val: number; end: string; filed: string } | undefined;
  for (const concept of l.concepts) {
    for (const r of cf.facts[concept]?.[ccy] ?? []) {
      if (r.start) continue;
      if (!best || r.end > best.end || (r.end === best.end && r.filed > best.filed)) best = { val: r.val, end: r.end, filed: r.filed };
    }
  }
  return best ? { val: best.val, end: best.end } : undefined;
}

/** Cover-page share counts by date (the latest filing's count for each date). */
function coverCounts(cf: CompanyFacts): { end: string; val: number }[] {
  const by = new Map<string, { end: string; val: number; filed: string }>();
  for (const r of cf.facts[COVER_SHARES]?.shares ?? []) {
    const have = by.get(r.end);
    if (!have || r.filed > have.filed) by.set(r.end, { end: r.end, val: r.val, filed: r.filed });
  }
  return [...by.values()].sort((a, b) => a.end.localeCompare(b.end));
}

const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

function buildRows(cf: CompanyFacts, ccy: string, kind: PeriodKind): BuybackRow[] {
  const bb = values(cf, 'buyback', ccy, kind);
  const sh = values(cf, 'bbShares', ccy, kind);
  const dv = values(cf, 'divPaid', ccy, kind);
  const covers = coverCounts(cf);
  return [...new Set([...bb.keys(), ...sh.keys(), ...dv.keys()])].sort().map((end) => {
    const b = bb.get(end);
    const s = sh.get(end);
    const d = dv.get(end);
    const rep = (b ?? s ?? d)!;
    // The count on the cover of the report for this period: the first cover dated after the period end.
    const cover = covers.find((c) => c.end >= end && days(end, c.end) <= 120);
    const label = fiscalLabel(rep, kind, cf.ownEnd);
    return {
      end,
      ...(rep.start ? { start: rep.start } : {}),
      ...(label ? { label } : {}),
      ...(b ? { buyback: b.val, form: b.form, accn: b.accn } : {}),
      ...(b?.derived ? { derived: true } : {}),
      ...(s ? { shares: s.val } : {}),
      ...(s?.derived ? { sharesDerived: true } : {}),
      ...(d ? { dividends: d.val } : {}),
      ...(cover ? { sharesOut: cover.val } : {}),
    };
  });
}

/** The buyback history in the chosen periods (the latest `max`), the last twelve months and the program's amounts. */
export function buybackSummary(cf: CompanyFacts, ccy: string, kind: PeriodKind, max = 12): BuybackSummary {
  const all = buildRows(cf, ccy, kind);
  const quarters = kind === 'quarter' ? all : buildRows(cf, ccy, 'quarter');
  // Last twelve months: four consecutive quarters ending with the latest one, else the latest fiscal year.
  let ltm: BuybackSummary['ltm'] = null;
  const last4 = quarters.filter((r) => r.buyback != null).slice(-4);
  const latestQ = quarters.at(-1);
  if (last4.length === 4 && latestQ && last4[3].end === latestQ.end) {
    const span = days(last4[0].end, last4[3].end);
    if (span > 250 && span < 300) {
      ltm = {
        buyback: sum(last4.map((r) => r.buyback)), shares: sum(last4.map((r) => r.shares)), dividends: sum(last4.map((r) => r.dividends)), through: last4[3].end, basis: 'quarters',
        sharesRounding: sum(last4.map((r) => (r.shares != null ? rowRounding(r) : 0))), sharesMissing: last4.filter((r) => r.shares == null),
      };
    }
  }
  if (!ltm) {
    const year = (kind === 'annual' ? all : buildRows(cf, ccy, 'annual')).filter((r) => r.buyback != null).at(-1);
    if (year) {
      ltm = {
        buyback: year.buyback!, shares: year.shares ?? NaN, dividends: year.dividends ?? NaN, through: year.end, basis: 'year',
        sharesRounding: year.shares != null ? rowRounding(year) : 0, sharesMissing: year.shares == null ? [year] : [],
      };
    }
  }
  const covers = coverCounts(cf);
  const sharesNow = covers.at(-1);
  const yearAgo = sharesNow ? [...covers].reverse().find((c) => days(c.end, sharesNow.end) >= 330) : undefined;
  return {
    rows: all.slice(-max),
    ltm,
    authorized: latestStock(cf, 'bbAuth', ccy),
    remaining: latestStock(cf, 'bbRemain', ccy),
    ...(sharesNow ? { sharesNow: { val: sharesNow.val, end: sharesNow.end } } : {}),
    ...(yearAgo ? { sharesYearAgo: { val: yearAgo.val, end: yearAgo.end } } : {}),
  };
}

/**
 * The rounding a filed share count shows: the largest power of ten, up to a million, it is a multiple of. A company
 * that reports in millions (Coca-Cola) files 5,000,000 for anything from 4.5 to 5.5 million shares.
 */
export function shareRounding(v: number): number {
  let p = 1;
  while (p < 1e6 && v % (p * 10) === 0) p *= 10;
  return p;
}

/** How far a row's share count can be off: its rounding, twice over for a difference of two rounded totals. */
export function rowRounding(r: BuybackRow): number {
  return r.shares == null ? 0 : shareRounding(r.shares) * (r.sharesDerived ? 2 : 1);
}

/** Whether a share count is too coarse for an average price: its rounding can move the price by more than 1%. */
export function tooCoarse(shares: number, rounding: number): boolean {
  return !(shares > 0) || rounding / shares > 0.01;
}

function sum(xs: (number | undefined)[]): number {
  return xs.every((x) => x != null && Number.isFinite(x)) ? xs.reduce<number>((a, x) => a + (x as number), 0) : NaN;
}
