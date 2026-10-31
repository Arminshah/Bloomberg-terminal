import { Fragment, useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtIso, fmtNum } from '../core/format';
import { NextEarnings } from '../components/NextEarnings';
import { financials, hasRealStatements, nextEarnings, parentIncomeMargin, priorStatementPeriod, reportCcy, type FinPeriod } from '../data/fundamentals';
import { analystsAvailable, analystSymbol, estimateInCurrency, listedOutsideUs, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import type { FnProps } from '../terminal/types';
import { useSegments } from '../data/live/segments';
import { segmentRows, SegmentsView } from './FASegments';
import { closeAt } from '../data/analytics';
import { engine, useHistoryVersion } from '../data/market';
import { capAtPeriodEnd, capSeries, shareFilings, sharesAtPeriodEnd } from '../data/marketcap';
import { loadCompanyFacts, resolveFiler, secAvailable, secTicker, useSecLoad, type CompanyFacts } from '../data/live/sec';
import { realSplits } from '../data/live/yahoo';
import { wantShares } from '../data/live/shares';
import { XYChart } from '../components/chart/XYChart';
import { Dialog } from '../components/Dialog';
import { createStore } from '../core/store';

type Row = {
  label: string;
  get: (p: FinPeriod, prev?: FinPeriod) => number;
  dec?: number;
  bold?: boolean;
  pct?: boolean;
  indent?: boolean;
  /** A growth or margin line: shown in percent, with no trend arrow of its own. */
  ratio?: boolean;
  /** A breakdown line drawn in white rather than amber, as Key Stats' "- Cash & Equivalents" (TE04 04:55). */
  white?: boolean;
  /** An empty row before the line, between Key Stats' groups (TE04 04:55). */
  gap?: boolean;
  /** Both figures are there but the ratio means nothing (growth from a loss): "NM". */
  nm?: (p: FinPeriod, prev?: FinPeriod) => boolean;
  /**
   * The line in an analysts' estimate column: the estimate, the one for the year before (none for the first) and the
   * last reported year (only for the first). Money in the statements' units.
   */
  est?: (e: Estimate, prev: Estimate | undefined, reported: FinPeriod | undefined) => number;
};

/** Year on year (or quarter on quarter) change, from a positive base only. */
const growth = (a: number, b: number | undefined) => (b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? (a / b - 1) * 100 : NaN);
const margin = (a: number, rev: number) => (Number.isFinite(a) && rev > 0 ? (a / rev) * 100 : NaN);
/** Growth from a loss or zero: both figures known, no meaningful percentage. */
const growthNm = (a: number, b: number | undefined) => b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b <= 0;
const mln = (v: number | undefined) => (v === undefined ? NaN : v / 1e6);

/**
 * A grid figure as FA writes it: money in millions with one decimal and a separator (20,292.0), growth and margins
 * with one decimal and no sign, ratios marked with %, and per-share figures with their own decimals.
 */
export function faNumber(v: number, r: { dec?: number; ratio?: boolean; pct?: boolean }): string {
  if (r.ratio) return fmtNum(v, 1);
  if (r.pct) return `${fmtNum(v, 1)}%`;
  return fmtNum(v, r.dec ?? 1);
}

/**
 * FA's measuring line between two bars: the total change and the compound annual change over the calendar days between
 * the two period ends (365 days a year), as "+94.41% (+39.37%ann.)". NaN without two positive values a day or more apart.
 */
export function measureChange(v0: number, v1: number, t0: number, t1: number): { total: number; annual: number; text: string } {
  const days = (t1 - t0) / 86_400_000;
  if (!(v0 > 0) || !(v1 > 0) || !(days >= 1)) return { total: NaN, annual: NaN, text: '' };
  const total = (v1 / v0 - 1) * 100;
  const annual = (Math.pow(v1 / v0, 365 / days) - 1) * 100;
  const signed = (v: number) => `${v >= 0 ? '+' : ''}${fmtNum(v, 2)}%`;
  return { total, annual, text: `${signed(total)} (${signed(annual)}ann.)` };
}

/** Preferred stock and minority interest, as Adj Highlights' "Preferred & Other": none when the source lists neither. */
export function preferredAndOther(p: Pick<FinPeriod, 'preferred' | 'minority'>): number {
  const parts = [p.preferred, p.minority].filter((x): x is number => x !== undefined && Number.isFinite(x));
  return parts.length ? parts.reduce((a, b) => a + b, 0) : NaN;
}

/**
 * Enterprise value at a period's end, as Adj Highlights works it: market capitalisation plus total debt and preferred
 * and other, less cash and equivalents. A part the source does not list adds nothing; without the market value, the
 * debt or the cash there is none.
 */
export function periodEnterpriseValue(cap: number, p: Pick<FinPeriod, 'cash' | 'debt' | 'preferred' | 'minority'>): number {
  if (![cap, p.debt, p.cash].every(Number.isFinite)) return NaN;
  const other = preferredAndOther(p);
  return cap + p.debt + (Number.isFinite(other) ? other : 0) - p.cash;
}

/**
 * FA's first page, as the terminal's Key Stats: the market value lines at each period's end (put before these in the
 * screen, as they need prices), then the headline figures with their growth and margins under them.
 */
const KEY: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true, gap: true, est: (e) => mln(e.revenueAvg) },
  // The first estimate year grows from the last reported revenue, a later one from the estimate before it.
  { label: 'Growth %, YoY', get: (p, q) => growth(p.rev, q?.rev), nm: (p, q) => growthNm(p.rev, q?.rev), indent: true, ratio: true, est: (e, b, r) => growth(mln(e.revenueAvg), b ? mln(b.revenueAvg) : r?.rev) },
  { label: 'Gross Profit', get: (p) => p.gp, bold: true },
  { label: 'Margin %', get: (p) => margin(p.gp, p.rev), indent: true, ratio: true },
  { label: 'EBITDA', get: (p) => p.ebitda, bold: true, est: (e) => mln(e.ebitdaAvg) },
  { label: 'Margin %', get: (p) => margin(p.ebitda, p.rev), indent: true, ratio: true, est: (e) => margin(mln(e.ebitdaAvg), mln(e.revenueAvg)) },
  { label: 'Net Income', get: (p) => p.niTotal, bold: true, est: (e) => mln(e.netIncomeAvg) },
  { label: 'Margin %', get: parentIncomeMargin, indent: true, ratio: true, est: (e) => margin(mln(e.netIncomeAvg), mln(e.revenueAvg)) },
  { label: 'Net Income to Common Shareholders', get: (p) => p.ni },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true, est: (e) => e.epsAvg },
  // The analysts' EPS is on their own basis, usually adjusted, so the first estimate year has no growth on the reported
  // diluted EPS; a later year grows from the estimate before it.
  { label: 'Growth %, YoY', get: (p, q) => growth(p.eps, q?.eps), nm: (p, q) => growthNm(p.eps, q?.eps), indent: true, ratio: true, est: (e, b) => (b ? growth(e.epsAvg, b.epsAvg) : NaN) },
  { label: 'Cash from Operations', get: (p) => p.cfo, gap: true },
  { label: 'Capital Expenditures', get: (p) => -p.capex },
  { label: 'Free Cash Flow', get: (p) => p.fcf, bold: true },
];

// A line's sign is in its label and its figure keeps its own, as the January 2025 picture writes "- Cost of Revenue
// 45,583.0": the label says how the line adds up to the total below it.
const IS: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true },
  { label: '- Cost of Revenue', get: (p) => p.cogs, indent: true },
  { label: 'Gross Profit', get: (p) => p.gp, bold: true },
  { label: '- Selling, General & Admin', get: (p) => p.sga, indent: true },
  { label: '- Research & Development', get: (p) => p.rnd, indent: true },
  { label: 'Operating Income (Loss)', get: (p) => p.opInc, bold: true },
  { label: '- Interest Expense', get: (p) => p.interest, indent: true },
  { label: 'Pretax Income (Loss)', get: (p) => p.pretax },
  { label: '- Income Tax Expense', get: (p) => p.tax, indent: true },
  { label: 'Net Income', get: (p) => p.niTotal, bold: true },
  { label: 'Net Income to Common Shareholders', get: (p) => p.ni },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true },
  { label: 'Diluted Weighted Avg Shares', get: (p) => p.shares },
  { label: 'Dividends per Share', get: (p) => p.dps, dec: 2 },
  { label: 'EBITDA', get: (p) => p.ebitda },
  { label: '+ Depreciation & Amortization', get: (p) => p.da, indent: true, white: true },
];

/** I/S as a share of revenue, the terminal's "GAAP %" view: the money lines only, per-share lines left out. */
const IS_PCT: Row[] = IS.filter((r) => !r.dec && r.label !== 'Diluted Weighted Avg Shares').map((r) => ({
  ...r,
  get: (p) => (p.rev > 0 ? (r.get(p) / p.rev) * 100 : NaN),
  pct: true,
}));

const BS: Row[] = [
  { label: '+ Cash & Equivalents', get: (p) => p.cash, indent: true },
  { label: '+ Accounts Receivable', get: (p) => p.recv, indent: true },
  { label: '+ Inventories', get: (p) => p.inv, indent: true },
  { label: 'Total Current Assets', get: (p) => p.curAssets, bold: true },
  { label: '+ Net Property, Plant & Equip', get: (p) => p.ppe, indent: true },
  { label: '+ Goodwill & Intangibles', get: (p) => p.intang, indent: true },
  { label: 'Total Assets', get: (p) => p.totAssets, bold: true },
  { label: 'Total Current Liabilities', get: (p) => p.curLiab },
  { label: 'Total Debt', get: (p) => p.debt },
  { label: 'Total Liabilities', get: (p) => p.totLiab, bold: true },
  { label: 'Total Equity', get: (p) => p.equity, bold: true },
  { label: 'Book Value per Share', get: (p) => p.equity / p.shares, dec: 2 },
];

const CF: Row[] = [
  { label: 'Net Income', get: (p) => p.niTotal },
  { label: '+ Depreciation & Amortization', get: (p) => p.da, indent: true },
  { label: 'Cash from Operating Activities', get: (p) => p.cfo, bold: true },
  { label: '- Capital Expenditures', get: (p) => p.capex, indent: true },
  { label: 'Free Cash Flow', get: (p) => p.fcf, bold: true },
  { label: '- Dividends Paid', get: (p) => p.divPaid, indent: true },
  { label: '- Repurchase of Equity', get: (p) => p.buyback, indent: true },
  { label: 'Free Cash Flow per Share', get: (p) => p.fcf / p.shares, dec: 2 },
];

const RATIOS: Row[] = [
  { label: 'Gross Margin', get: (p) => (p.gp / p.rev) * 100, pct: true },
  { label: 'Operating Margin', get: (p) => (p.opInc / p.rev) * 100, pct: true },
  { label: 'EBITDA Margin', get: (p) => (p.ebitda / p.rev) * 100, pct: true },
  { label: 'Net Margin', get: parentIncomeMargin, pct: true },
  { label: 'Return on Common Equity', get: (p) => (p.equity > 0 ? (p.ni / p.equity) * 100 : NaN), nm: (p) => Number.isFinite(p.ni) && p.equity <= 0, pct: true },
  { label: 'Return on Assets', get: (p) => (p.ni / p.totAssets) * 100, pct: true },
  { label: 'Effective Tax Rate', get: (p) => (p.pretax > 0 ? (p.tax / p.pretax) * 100 : NaN), nm: (p) => Number.isFinite(p.tax) && p.pretax <= 0, pct: true },
  { label: 'Current Ratio', get: (p) => p.curAssets / p.curLiab, dec: 2 },
  { label: 'Total Debt / Total Equity', get: (p) => (p.equity > 0 ? (p.debt / p.equity) * 100 : NaN), nm: (p) => Number.isFinite(p.debt) && p.equity <= 0, pct: true },
  { label: 'Net Debt / EBITDA', get: (p) => (p.debt - p.cash) / p.ebitda, dec: 2 },
  { label: 'EBIT / Interest Expense', get: (p) => (p.interest > 0 ? p.opInc / p.interest : NaN), nm: (p) => Number.isFinite(p.opInc) && p.interest === 0, dec: 1 },
  { label: 'Capex / Revenue', get: (p) => (p.capex / p.rev) * 100, pct: true },
  { label: 'Dividend Payout Ratio', get: (p) => (p.eps > 0 ? (p.dps / p.eps) * 100 : NaN), nm: (p) => p.dps > 0 && p.eps <= 0, pct: true },
];

/** FA's pages under the terminal's names. */
const TABS = [
  { n: 1, label: 'Key Stats', file: 'KeyStats', rows: KEY },
  { n: 2, label: 'I/S', file: 'IncomeStatement', rows: IS },
  { n: 3, label: 'B/S', file: 'BalanceSheet', rows: BS },
  { n: 4, label: 'C/F', file: 'CashFlow', rows: CF },
  { n: 5, label: 'Ratios', file: 'Ratios', rows: RATIOS },
  { n: 6, label: 'Segments', file: 'Segments', rows: [] as Row[] },
];

/**
 * Each page's second row of views (TE04 04:55, numbered from 11). The terminal's are on its own adjusted and GAAP
 * bases; the app's figures are as filed, so each page shows them under GAAP, the terminal's word for that basis, and
 * the views it can work from them.
 */
const VIEWS: Record<number, { n: number; label: string }[]> = {
  1: [{ n: 11, label: 'GAAP Highlights' }, { n: 12, label: 'Enterprise Value' }, { n: 13, label: 'Multiples' }, { n: 14, label: 'Per Share' }],
  2: [{ n: 11, label: 'GAAP' }, { n: 12, label: 'GAAP %' }],
  3: [{ n: 11, label: 'GAAP' }],
  4: [{ n: 11, label: 'GAAP' }],
  5: [{ n: 11, label: 'Key Ratios' }],
};

/** FA's own settings (98) Settings): which of the app's extra columns show. All on by default. */
export const faView = createStore({ estimates: true, change: true, trend: true }, 'fa-view', 1);

/** Words FA takes after the security to open a page: FA AAPL IS, FA AAPL BS. */
const PAGE_WORDS: Record<string, number> = { KEY: 1, KS: 1, IS: 2, BS: 3, CF: 4, RATIOS: 5, R: 5, SEG: 6, SEGMENTS: 6 };

/** A period's heading as the terminal writes it: "2025 Y" for a fiscal year, "Q3 2025" for a quarter. */
function periodHeading(c: FinPeriod, quarterly: boolean): string {
  if (c.label === 'LTM') return 'Current/LTM';
  if (quarterly) return c.label;
  const y = /(\d{4})/.exec(c.label)?.[1];
  return y ? `${y} Y` : c.label;
}

/** The graph's x labels (TE04 05:19): "FY 2021", "Curr" for the latest twelve months, a quarter as in the grid. */
function graphHeading(c: FinPeriod, quarterly: boolean): string {
  if (c.label === 'LTM') return 'Curr';
  if (quarterly) return c.label;
  const y = /(\d{4})/.exec(c.label)?.[1];
  return y ? `FY ${y}` : c.label;
}

/** The graph's bar colours in the order lines are ticked: orange, green, yellow, violet (TE04 05:19), then more. */
export const GRAPH_COLOURS = ['#fe9f11', '#29c828', '#eadb1c', '#cf66fd', '#3fb6f2', '#ff6b6b', '#d9d9d9'];

/** An estimate year's bar: a quarter of the line's colour over dark grey, as #FE9F11 becomes #664E2A (TE04 05:19). */
export function dimColour(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * 0.25 + 51 * 0.75);
  return `#${[16, 8, 0].map((shift) => ch(shift).toString(16).padStart(2, '0')).join('')}`;
}

/** The money scale in millions as the graph labels it: "300B" from a billion up, else "512M". */
function axisMoney(v: number): string {
  return Math.abs(v) >= 1000 ? `${fmtNum(v / 1000, Math.abs(v) % 1000 ? 1 : 0)}B` : `${fmtNum(v, 0)}M`;
}

/** Which statement rows an analysts' annual estimate fills, in the statements' units (millions, EPS per share). */
const EST_ROWS: Record<string, (e: Estimate) => number> = {
  Revenue: (e) => e.revenueAvg / 1e6,
  'Net Income': (e) => e.netIncomeAvg / 1e6,
  'Diluted EPS': (e) => e.epsAvg,
};

/** Key Stats' lines in each estimate column, as the grid shows them (for tests). */
export function keyStatsEstimates(estimates: Estimate[], lastAnnual: FinPeriod | undefined): { label: string; values: number[] }[] {
  return KEY.map((r) => ({ label: r.label, values: estimates.map((e, j) => (r.est ? r.est(e, estimates[j - 1], j === 0 ? lastAnnual : undefined) : NaN)) }));
}

export function FA({ sec, route }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  const [tab, setTab] = useState(words.map((w) => PAGE_WORDS[w]).find(Boolean) ?? 1);
  // The chosen view of each page; a page opens on its first.
  const [views, setViews] = useState<Record<number, number>>({});
  const view = views[tab] ?? 11;
  const [showSettings, setShowSettings] = useState(false);
  const opts = faView.use((v) => v);
  const [quarterly, setQuarterly] = useState(false);
  const [periods, setPeriods] = useState(5);
  const [offset, setOffset] = useState(0);
  // FA's graph mode: the line whose chart button was pressed, drawn as bars above the grid.
  // FA's graph mode (TE04 05:19): the lines ticked in the list beside the chart, kept per page and view.
  const [graphed, setGraph] = useState<{ tab: number; view: number; rows: number[] } | null>(null);
  const { real, status: fundStatus } = useFundamentals(s);
  const segments = useSegments(s, tab === 6);
  const status = fundStatus === 'ok' && !hasRealStatements(s) ? 'error' : fundStatus;
  const f = financials(s);
  const all = quarterly ? f.quarterly : [...f.annual, ...(Number.isFinite(f.ltm.end) ? [f.ltm] : [])];
  // The periods shown: the latest `periods`, moved back by the paging arrows.
  const maxOffset = Math.max(0, all.length - periods);
  const off = Math.min(offset, maxOffset);
  const cols = all.slice(Math.max(0, all.length - periods - off), all.length - off);
  const supplementSources = [...new Set(cols.flatMap((p) => p.supplements ?? []))];
  const revenueDefinitions = [...new Map(cols.flatMap((p) => p.niTotalBasisDetails ?? []).flatMap((difference) => difference.definition ? [[difference.definition.accession, difference.definition] as const] : [])).values()];
  const ccy = reportCcy(s);
  // The market value at each period's end, for Key Stats' first lines: the last close by then times the shares on the
  // latest SEC cover filed before it, as MARKETCAP works it; a company without SEC covers takes today's count back.
  useEffect(() => wantShares(s.id), [s.id]);
  const history = useHistoryVersion();
  const ticker = secTicker(s);
  const facts = useSecLoad<CompanyFacts>(tab === 1 && secAvailable() && ticker ? `facts:${ticker}` : null, async (force) => {
    const c = await resolveFiler(ticker!, force);
    if (!c.ok) return c;
    return loadCompanyFacts(c.data.cik, force);
  });
  const cf = facts.result?.ok ? facts.result.data : null;
  const sharesNow = (s.eq?.shares ?? NaN) * 1e6;
  const caps = useMemo(
    () => capSeries(engine.daily(s.id), sharesNow, shareFilings(cf), realSplits.get(s.id) ?? [], s.minor ? 0.01 : 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s.id, cf, sharesNow, history],
  );
  const tradeCcy = s.ccy === 'GBp' ? 'GBP' : s.ccy === 'USd' ? 'USD' : s.ccy;
  // In the statements' currency at that day's rates (through the dollar), millions; none without a rate.
  // FA's past market capitalisation is the period-end close times the shares outstanding at the period end (net of
  // treasury), so the filings' count dated at that end replaces the one last filed before it, where they give one.
  const capFor = (p: FinPeriod) => {
    const pt = capAtPeriodEnd(caps.points, p.end);
    if (!pt) return NaN;
    const atEnd = cf ? sharesAtPeriodEnd(cf, new Date(p.end).toISOString().slice(0, 10), realSplits.get(s.id) ?? []) : NaN;
    const cap = Number.isFinite(atEnd) && pt.shares ? (pt.cap / pt.shares) * atEnd : pt.cap;
    if (tradeCcy === ccy) return cap / 1e6;
    const usdPer = (c: string) => (c === 'USD' ? 1 : closeAt(engine.daily(`CCY:${c}`), pt.t));
    return (cap * usdPer(tradeCcy)) / usdPer(ccy) / 1e6;
  };
  const marketRows: Row[] = [
    { label: 'Market Capitalization', get: capFor, bold: true },
    { label: '- Cash & Equivalents', get: (p) => p.cash, white: true },
    { label: '+ Preferred & Other', get: preferredAndOther, white: true },
    { label: '+ Total Debt', get: (p) => p.debt, white: true },
    { label: 'Enterprise Value', get: (p) => periodEnterpriseValue(capFor(p), p), bold: true },
  ];
  const ev = (p: FinPeriod) => periodEnterpriseValue(capFor(p), p);
  // A multiple on a loss or a negative base means nothing: NM where both figures are there.
  const over = (a: number, b: number) => (Number.isFinite(a) && b > 0 ? a / b : NaN);
  const overNm = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && b <= 0;
  const evRows: Row[] = [
    ...marketRows,
    { label: 'EV / Revenue', get: (p) => over(ev(p), p.rev), nm: (p) => overNm(ev(p), p.rev), dec: 2, gap: true },
    { label: 'EV / EBITDA', get: (p) => over(ev(p), p.ebitda), nm: (p) => overNm(ev(p), p.ebitda), dec: 2 },
    { label: 'EV / EBIT', get: (p) => over(ev(p), p.opInc), nm: (p) => overNm(ev(p), p.opInc), dec: 2 },
  ];
  // At each period's end: the market value then over the period's figures, as the terminal's Multiples view.
  const multipleRows: Row[] = [
    { label: 'Price / Earnings', get: (p) => over(capFor(p), p.ni), nm: (p) => overNm(capFor(p), p.ni), dec: 2 },
    { label: 'Price / Book', get: (p) => over(capFor(p), p.equity), nm: (p) => overNm(capFor(p), p.equity), dec: 2 },
    { label: 'Price / Sales', get: (p) => over(capFor(p), p.rev), dec: 2 },
    { label: 'EV / EBITDA', get: (p) => over(ev(p), p.ebitda), nm: (p) => overNm(ev(p), p.ebitda), dec: 2 },
    { label: 'Dividend Yield', get: (p) => over(p.divPaid * 100, capFor(p)), pct: true },
    { label: 'Free Cash Flow Yield', get: (p) => over(p.fcf * 100, capFor(p)), pct: true },
  ];
  const perShareRows: Row[] = [
    { label: 'Revenue per Share', get: (p) => over(p.rev, p.shares), dec: 2 },
    { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true, est: (e) => e.epsAvg },
    { label: 'Dividends per Share', get: (p) => p.dps, dec: 2 },
    { label: 'Book Value per Share', get: (p) => over(p.equity, p.shares), dec: 2 },
    { label: 'Cash from Operations per Share', get: (p) => over(p.cfo, p.shares), dec: 2 },
    { label: 'Free Cash Flow per Share', get: (p) => over(p.fcf, p.shares), dec: 2 },
  ];
  // The analysts' consensus for the coming fiscal years, beside the reported ones (annual view, statements' currency).
  const est = useAnalysts(analystsAvailable() && analystSymbol(s) ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const lastEnd = f.annual.length ? f.annual[f.annual.length - 1].end : NaN;
  const pctView = tab === 2 && view === 12;
  const graphOn = !!graphed && graphed.tab === tab && graphed.view === view;
  const estimates = opts.estimates && !pctView && !quarterly && off === 0 && est?.state === 'ok'
    ? (est.data ?? [])
        .map((e) => estimateInCurrency(e, ccy, listedOutsideUs(analystSymbol(s))))
        .filter((e): e is Estimate => !!e && Date.parse(`${e.date}T00:00:00Z`) > lastEnd + 40 * 86_400_000)
        .slice(0, 2)
    : [];
  const next = nextEarnings(s);
  // Dividends come in the unit the shares trade in (Shell: pence) while the statements are in the reporting
  // currency (dollars): the row says its unit, and no payout ratio divides one by the other.
  const divUnit = s.ccy !== ccy ? (s.ccy === 'GBp' ? 'pence' : s.ccy) : '';
  const pageRows = tab === 1 ? (view === 12 ? evRows : view === 13 ? multipleRows : view === 14 ? perShareRows : [...marketRows, ...KEY]) : pctView ? IS_PCT : TABS[tab - 1].rows;
  const rows = pageRows.map((r) =>
    divUnit && r.label === 'Dividends per Share' ? { ...r, label: `Dividends per Share (${divUnit})` } : divUnit && r.label === 'Dividend Payout Ratio' ? { ...r, get: () => NaN, nm: undefined } : r,
  );
  // Growth lines compare a year with the one before and a quarter with the same quarter a year earlier; the LTM
  // column overlaps the latest year, so it has no growth of its own.
  const prevOf = (i: number) => (!quarterly && cols[i].label === 'LTM' ? undefined : priorStatementPeriod(all, cols[i], 'year'));
  const value = (r: Row, i: number) => r.get(cols[i], prevOf(i));
  const lastAnnual = f.annual.length ? f.annual[f.annual.length - 1] : undefined;
  const estValue = (r: Row, e: Estimate) => {
    const j = estimates.indexOf(e);
    return r.est ? r.est(e, j > 0 ? estimates[j - 1] : undefined, j === 0 ? lastAnnual : undefined) : EST_ROWS[r.label] && !r.indent ? EST_ROWS[r.label](e) : NaN;
  };
  const csv = () => [
    ['Item', ...cols.map((c) => periodHeading(c, quarterly)), ...estimates.map((e) => `${e.date.slice(0, 4)} Y Est`)],
    ...rows.map((r) => [r.label, ...cols.map((_, i) => value(r, i).toFixed(r.dec ?? 1)), ...estimates.map((e) => estValue(r, e).toFixed(r.dec ?? 1))]),
  ];
  const months = quarterly ? '3 Months Ending' : '12 Months Ending';
  // A missing figure is left empty (the note says why); "NM" where both figures are there but a ratio means nothing.
  const fmtCell = (r: Row, v: number, i?: number) =>
    !Number.isFinite(v) ? (i != null && r.nm?.(cols[i], prevOf(i)) ? 'NM' : '') : faNumber(v, r);
  return (
    <div data-audit-state={JSON.stringify({ schema: 1, domain: 'financials', capturedAt: Date.now(), security: s.id, currency: ccy, page: TABS[tab - 1].file, periods: cols.map((p) => ({ label: p.label, end: p.end, basis: p.basis, rev: p.rev, opInc: p.opInc, operatingIncomeVariants: p.operatingIncomeVariants, niTotal: p.niTotal, ni: p.ni, niTotalFiled: p.niTotalFiled, niTotalBasisConflict: !!p.niTotalBasisConflict, niTotalBasisDetails: p.niTotalBasisDetails, parentIncomeMargin: parentIncomeMargin(p) })) })}>
      <FnHeader
        code="FINANCIALS"
        title="Financial Analysis"
        sec={s}
        tabs={TABS.map((t) => ({ n: t.n, label: t.label }))}
        tab={tab}
        onTab={setTab}
        plainTabs
        subTabs={VIEWS[tab]}
        subTab={view}
        onSubTab={(n) => setViews((v) => ({ ...v, [tab]: n }))}
        actions={[
          {
            n: 96,
            label: 'Actions',
            onClick: () => {},
            menu: [
              { label: 'Graph Fundamentals', title: 'FUNDCHART: graph these figures over time', onClick: () => execute(panel, `${s.id} FUNDCHART`) },
              { label: 'Earnings & Estimates', title: 'EE', sep: true, onClick: () => execute(panel, `${s.id} EARNINGSSUMMARY`) },
              { label: 'Corporate Events', title: 'EVTS', onClick: () => execute(panel, `${s.id} EVENTS`) },
            ],
          },
          {
            n: 97,
            label: 'Export',
            onClick: () => {},
            menu: exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${TABS[tab - 1].file}.csv`, tab === 6 ? () => segmentRows(segments) : csv).map((a) => ({
              label: a.label === 'Copy' ? 'Copy to Clipboard' : 'Download as CSV',
              title: a.title,
              onClick: a.onClick,
            })),
          },
          { n: 98, label: 'Settings', title: 'Choose the columns FA shows', onClick: () => setShowSettings(true) },
        ]}
        inlineControls
        controls={tab === 6 ? undefined : <div className="chart-tools fa-tools">
          <label className="fld">
            Periods
            <select className="sel-inp" aria-label="Periods" value={periods} onChange={(e) => { setPeriods(Number(e.target.value)); setOffset(0); }}>
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <select className="sel-inp" aria-label="Periodicity" value={quarterly ? 'Q' : 'A'} onChange={(e) => { setQuarterly(e.target.value === 'Q'); setOffset(0); }}>
            <option value="A">Annuals</option>
            <option value="Q">Quarterlies</option>
          </select>
          <label className="fld">
            Cur
            <select className="sel-inp" aria-label="Currency" value={ccy} disabled>
              <option>{ccy}</option>
            </select>
          </label>
          <span className="muted fa-src">
            {status === 'ok' && real?.statementsFrom === 'SEC EDGAR' ? <><span className="badge live">REAL</span> SEC EDGAR</> : sourceLabel(status, 'statements generated from the company profile; real data needs the desktop app')}
            {real?.statementsFrom !== 'SEC EDGAR' && supplementSources.some((x) => x.startsWith('SEC')) ? ' + SEC EDGAR supplements' : ''}
          </span>
        </div>}
      />
      {tab === 6 ? <SegmentsView state={segments} /> : <>
      {graphOn ? (() => {
        // One colour per ticked line in the order ticked, the estimate years dimmed. Money lines take the right scale;
        // growth, margins, multiples and per-share lines take the left one when money lines are drawn too.
        const ticked = graphed!.rows.filter((ri) => rows[ri]);
        const money = (r: Row) => !r.ratio && !r.pct && !r.dec;
        const mixed = ticked.some((ri) => money(rows[ri]));
        const heading = (i: number) => (i < cols.length ? graphHeading(cols[i], quarterly) : `FY ${estimates[i - cols.length].date.slice(0, 4)} Est`);
        const series = ticked.map((ri, k) => {
          const r = rows[ri];
          const color = GRAPH_COLOURS[k % GRAPH_COLOURS.length];
          const points = [
            ...cols.map((c, i) => ({ x: i, y: value(r, i), label: heading(i), t: c.end })),
            ...estimates.map((e, j) => ({ x: cols.length + j, y: estValue(r, e), label: heading(cols.length + j), t: Date.parse(`${e.date}T00:00:00Z`), color: dimColour(color) })),
          ].filter((q) => Number.isFinite(q.y));
          return { label: r.label.replace(/^[+-] /, ''), color, kind: 'bar' as const, points, axis: mixed && !money(r) ? ('left' as const) : undefined };
        });
        const one = series.length === 1 ? series[0].points : [];
        const m = one.length > 1 ? measureChange(one[0].y, one[one.length - 1].y, one[0].t, one[one.length - 1].t) : null;
        const toggle = (ri: number) => setGraph((g) => (g ? { ...g, rows: g.rows.includes(ri) ? g.rows.filter((x) => x !== ri) : [...g.rows, ri] } : g));
        return (
          <div className="fa-graph-mode" data-testid="fa-graph">
            <div className="fa-gl" role="group" aria-label="Lines to graph">
              {rows.map((r, ri) => (
                <Fragment key={`${ri}:${r.label}`}>
                  {r.gap ? <div className="fa-gl-gap" /> : null}
                  <label className={`fa-gl-row ${r.ratio ? 'muted' : r.white ? 'white' : 'amber'}`} style={r.indent ? { paddingLeft: 26 } : undefined}>
                    <input type="checkbox" checked={ticked.includes(ri)} onChange={() => toggle(ri)} />
                    {r.label}
                  </label>
                </Fragment>
              ))}
            </div>
            <div className="fa-gc">
              <div className="fa-gc-bar">
                <button type="button" className="link-btn amber" onClick={() => execute(panel, `${s.id} FUNDCHART`)}>
                  Graph Fundamentals <span className="white">| GF »</span>
                </button>
                {m?.text ? <span className="white" title={`From ${one[0].label} to ${one[one.length - 1].label}, compounded over the calendar days between the period ends`}>{m.text}</span> : null}
                <button type="button" className="act fa-gc-table" onClick={() => setGraph(null)}>Table</button>
              </div>
              {series.length ? (
                <XYChart
                  height={360}
                  series={series}
                  xFormat={(v) => (Number.isInteger(v) && v >= 0 && v < cols.length + estimates.length ? heading(v) : '')}
                  yFormat={mixed ? axisMoney : (v) => fmtNum(v, 1)}
                  y2Format={mixed ? (v) => fmtNum(v, 1) : undefined}
                  yZero
                />
              ) : (
                <div className="empty">Tick a line at the left to graph it.</div>
              )}
            </div>
          </div>
        );
      })() : <div className="tbl-wrap">
        <table className="tbl fa-tbl">
          <thead>
            <tr>
              <th>{pctView ? 'In % of Revenue' : `In Millions of ${ccy} except Per Share`}</th>
              {cols.map((c) => (
                <th key={c.label} className={`num${c.label === 'LTM' ? ' fa-ltm' : ''}`} title={c.supplements?.join('; ')}>
                  {periodHeading(c, quarterly)}
                  {c.supplements?.length ? ' *' : ''}
                </th>
              ))}
              {estimates.map((e) => (
                <th key={e.date} className="num fa-est" title={`Analysts' consensus${est?.source ? ` (${est.source})` : ''}: EPS on their basis, usually adjusted`}>
                  {e.date.slice(0, 4)} Y Est
                </th>
              ))}
              {opts.change ? <th className="num fa-extra">{quarterly ? 'QoQ' : 'YoY'}</th> : null}
              {opts.trend ? <th className="hide-m fa-extra">Trend</th> : null}
            </tr>
            <tr className="fa-ending">
              <th>{months}</th>
              {cols.map((c) => (
                <th key={c.label} className={`num${c.label === 'LTM' ? ' fa-ltm' : ''}`}>
                  {fmtDay(c.end, true)}
                </th>
              ))}
              {estimates.map((e) => (
                <th key={e.date} className="num">
                  {fmtIso(e.date, true)}
                </th>
              ))}
              {opts.change ? <th className="fa-extra" /> : null}
              {opts.trend ? <th className="hide-m fa-extra" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const vals = cols.map((_, i) => value(r, i));
              const latestIdx = quarterly || cols[cols.length - 1]?.label !== 'LTM' ? vals.length - 1 : vals.length - 2;
              const last = vals[latestIdx];
              const latestPeriod = cols[latestIdx];
              const previousPeriod = latestPeriod ? priorStatementPeriod(all, latestPeriod, quarterly ? 'quarter' : 'year') : undefined;
              const prev = previousPeriod ? r.get(previousPeriod) : NaN;
              // Growth of magnitude; for a cost a rise is shown as a negative. A cost is a subtracted line, written
              // positive ("- Cost of Revenue"), or a line negative in both years. From a loss to a profit, or back, a
              // percentage means nothing: shown as NM.
              const cost = /^- /.test(r.label) && !r.white ? prev > 0 && last > 0 : prev < 0 && last < 0;
              const flipped = prev * last < 0;
              const g = r.pct ? last - prev : prev !== 0 && !flipped ? ((Math.abs(last) - Math.abs(prev)) / Math.abs(prev)) * 100 * (cost ? -1 : 1) : NaN;
              // As the terminal colours them (TE04 04:55): lines amber, breakdowns white, growth and margins grey; the
              // analysts' estimates white.
              const tone = r.ratio ? 'muted' : r.white ? 'white' : 'amber';
              const name = r.label.replace(/^[+-] /, '');
              return (
                <Fragment key={`${ri}:${r.label}`}>
                {r.gap ? <tr className="fa-gap" aria-hidden="true"><td colSpan={1 + cols.length + estimates.length + (opts.change ? 1 : 0) + (opts.trend ? 1 : 0)} /></tr> : null}
                <tr>
                  <td className={tone}>
                    <button type="button" className="fa-graph" title={`Graph ${name}`} aria-label={`Graph ${name}`} onClick={() => setGraph({ tab, view, rows: [ri] })}>
                      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 1v9.5H11" fill="none" stroke="#f2f2f2" strokeWidth="1.3" /><path d="M4 9V7M6.3 9V5.5M8.6 9V3.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                    <span className={r.indent ? 'fa-indent' : undefined}>{r.label}</span>
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num ${tone}${cols[i].label === 'LTM' ? ' fa-ltm' : ''}`}>
                      {fmtCell(r, v, i)}
                    </td>
                  ))}
                  {estimates.map((e) => {
                    const v = estValue(r, e);
                    return (
                      <td key={e.date} className={`num fa-est ${r.ratio ? 'muted' : 'white'}`}>
                        {Number.isFinite(v) ? fmtCell(r, v) : ''}
                      </td>
                    );
                  })}
                  {opts.change ? <td className="num fa-extra">
                    {r.ratio ? '' : Number.isFinite(g) ? r.pct ? <Chg v={g} dec={1} /> : <Chg v={g} pct dec={1} /> : Number.isFinite(last) && Number.isFinite(prev) ? <span className="muted" title="Not meaningful: from a loss to a profit, or back">NM</span> : ''}
                  </td> : null}
                  {opts.trend ? <td className="hide-m fa-extra">
                    {/* A missing period is left out of the trend rather than drawn as zero. */}
                    {r.ratio ? null : <Sparkline values={vals.filter((v) => Number.isFinite(v))} width={70} height={14} color="var(--amber)" />}
                  </td> : null}
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>}
      {cols.length === 0 ? <div className="empty">{status === 'loading' ? 'Loading statements…' : 'No statements from the source for this security.'}</div> : null}
      <div className="fa-bottom">
        <button type="button" disabled={off >= maxOffset} title="Earliest periods" onClick={() => setOffset(maxOffset)}>&lt;&lt;</button>
        <button type="button" disabled={off >= maxOffset} title="One period earlier" onClick={() => setOffset(off + 1)}>&lt;</button>
        <button type="button" disabled={off === 0} title="One period later" onClick={() => setOffset(Math.max(0, off - 1))}>&gt;</button>
        <button type="button" disabled={off === 0} title="Latest periods" onClick={() => setOffset(0)}>&gt;&gt;</button>
        <span className="fa-next">
          Earnings: <NextEarnings sec={s} ne={next} withTiming={false} /> |{' '}
          <button type="button" className="link" onClick={() => execute(panel, `${s.id} EVENTS`)}>EVTS »</button>
          <button type="button" className="link fa-next-fn" onClick={() => execute(panel, `${s.id} EARNINGSSUMMARY`)}><span className="amber">Earnings &amp; Estimates</span> | EE »</button>
        </span>
      </div>
      {showSettings ? <FaSettings onClose={() => setShowSettings(false)} /> : null}
      <div className="note">
        {status === 'ok'
          ? `Figures from ${real?.statementsFrom === 'SEC EDGAR' ? 'SEC EDGAR' : 'Yahoo Finance, supplemented from compatible SEC EDGAR observations where available'}; LTM ${f.ltm?.basis === 'annual' ? 'is the latest complete fiscal year, dated above' : f.ltm?.basis === 'trailing' ? "is the source's trailing twelve months" : 'sums four consecutive reported quarters'}${f.ltm?.epsComputed ? ', with EPS as net income over diluted shares (a quarter has no EPS in the source)' : ''}. Net Income is attributable to the company's shareholders; Net Income to Common Shareholders comes after preferred dividends and is what diluted EPS divides. Missing values have no supported observation; they are not zero.${estimates.length ? ` Est columns: the analysts' consensus${est?.source ? ` from ${est.source}` : ''} (revenue, net income and EPS on the analysts' basis).` : ''}`
          : status === 'sim' ? "Statements are simulated from each company's scale and sector profile; they are not reported figures." : ''}
      </div>
      {cols.some((p) => p.niTotalBasisConflict) ? <div className="note">Filed parent net income is shown on its own reported basis. Other statement lines remain on an unresolved basis; the affected net margins are withheld.</div> : null}
      {revenueDefinitions.map((definition) => <div className="note" key={definition.accession}><b>{definition.label}: </b>{definition.explanation} <a href={definition.sourceUrl} target="_blank" rel="noreferrer" title={definition.quote}>Filed statement ({definition.accession})</a>.</div>)}
      {supplementSources.length ? <details className="note"><summary>* Supplemental observations (hover a period heading for its sources)</summary>{supplementSources.map((source) => <div key={source}>{source}</div>)}</details> : null}
      </>}
    </div>
  );
}

/** 98) Settings: the app's own columns beside the terminal's, each on or off; the choice is kept. */
function FaSettings({ onClose }: { onClose: () => void }) {
  const v = faView.use((x) => x);
  const box = (key: keyof typeof v, label: string) => (
    <label className="fa-set">
      <input type="checkbox" checked={v[key]} onChange={(e) => faView.set((o) => ({ ...o, [key]: e.target.checked }))} />
      {label}
    </label>
  );
  return (
    <Dialog title="Financial Analysis Settings" onClose={onClose} buttons={[{ label: 'Close', onClick: onClose, primary: true }]} testId="fa-settings">
      {box('estimates', "Analysts' estimate columns")}
      {box('change', 'YoY / QoQ change column')}
      {box('trend', 'Trend column')}
    </Dialog>
  );
}
