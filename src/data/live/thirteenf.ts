// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { SecurityDef } from '../types';
import { filingLinks, loadFiler, resolveFiler, secAvailable, secTicker, SEC_DESKTOP_ONLY, SEC_NEEDS_AGENT, type Filing, type SecResult } from './sec';

/**
 * What a company reports on Form 13F, from its filings on SEC EDGAR (desktop app, with the owner's SEC User-Agent):
 * the US-listed stocks, options and convertible bonds over which it had investment discretion at the end of each
 * quarter, as the manager filed them. A 13F is filed by an institutional investment manager with discretion over $100
 * million or more of Section 13(f) securities, within 45 days of each quarter's end. A company that manages its own
 * portfolio reports what it owns; a bank, broker or adviser also reports the accounts of others it manages (SEC Form
 * 13F FAQ, questions 3 and 6, last reviewed 28 September 2026). The tickers come from OpenFIGI (by CUSIP), today's prices from the
 * app's usual sources; nothing is estimated.
 */

/** The cover page as electron/thirteenf.cjs reads it. */
export interface Cover13F {
  manager: string;
  /** The quarter's last day, YYYY-MM-DD. */
  period: string;
  submissionType: string;
  /** 13F HOLDINGS REPORT, 13F NOTICE (holdings reported by other managers) or 13F COMBINATION REPORT. */
  reportType: string;
  amendment: boolean;
  amendmentNo: number | null;
  /** RESTATEMENT replaces the earlier report; NEW HOLDINGS adds to it. */
  amendmentType: string;
  confidentialEnded: boolean;
  entries: number | null;
  /** The table's value total as filed: dollars, or thousands of dollars before 2023. */
  total: number | null;
  confidentialOmitted: boolean;
  reportedBy: { name: string; fileNumber: string }[];
  included: { name: string; fileNumber: string }[];
  signed: string;
}

/** One security in the information table, its lines added up. */
export interface Line13F {
  cusip: string;
  issuer: string;
  cls: string;
  figi?: string;
  /** SH: shares; PRN: principal amount (a bond). */
  type: 'SH' | 'PRN';
  /** An option held on the security: the value and amount are the underlying's. */
  putCall: '' | 'Put' | 'Call';
  /** As filed: dollars, or thousands of dollars before 2023. */
  value: number;
  amount: number;
  rows: number;
  sole: number;
  shared: number;
  none: number;
  discretion: string[];
}

export interface Answer13F {
  status: number;
  cover?: Cover13F;
  holdings?: Line13F[];
  rows?: number;
  valueSum?: number;
  unread?: number;
  file?: string;
  at?: number;
  cached?: boolean;
  missing?: string;
  refused?: string;
  error?: string;
  unreadable?: 'cover' | 'table';
}

// ------------------------------------------------------------- the filings

export const THIRTEEN_F = /^13F-(HR|NT)(\/A)?$/i;

/** Filings in thousands of dollars before 3 January 2023, in dollars from then (SEC Form 13F FAQ). */
export function valueUnit(filed: string): number {
  return filed >= '2023-01-03' ? 1 : 1000;
}

/** A quarter's 13F filings, the first filed first. */
export interface Quarter13F {
  /** The quarter's last day, YYYY-MM-DD. */
  period: string;
  filings: Filing[];
}

/** A company's 13F filings by quarter, the latest quarter first. */
export function quartersOf(filings: Filing[]): Quarter13F[] {
  const by = new Map<string, Filing[]>();
  for (const f of filings) {
    if (!THIRTEEN_F.test(f.form.trim()) || !f.report) continue;
    const list = by.get(f.report) ?? [];
    list.push(f);
    by.set(f.report, list);
  }
  return [...by.entries()]
    .map(([period, list]) => ({ period, filings: list.sort((a, b) => a.filed.localeCompare(b.filed) || a.accession.localeCompare(b.accession)) }))
    .sort((a, b) => b.period.localeCompare(a.period));
}

/** A security held at a quarter's end, in dollars. */
export interface Position {
  key: string;
  cusip: string;
  issuer: string;
  cls: string;
  figi?: string;
  type: 'SH' | 'PRN';
  putCall: '' | 'Put' | 'Call';
  value: number;
  amount: number;
}

export const positionKey = (l: { cusip: string; type: string; putCall: string }) => `${l.cusip}|${l.type}|${l.putCall}`;

/** How a filing counts in its quarter. */
export type FilingUse = 'report' | 'restatement' | 'added' | 'notice';

export interface QuarterHoldings {
  period: string;
  manager: string;
  /** Each filing of the quarter, the first filed first, and how it counts. */
  filings: { filing: Filing; cover: Cover13F; use: FilingUse; lines: number; repeated?: boolean }[];
  /** Largest first. */
  positions: Position[];
  /** The positions' value. */
  total: number;
  /** The filings' own totals, combined the same way, in dollars: should equal `total`. */
  filedTotal: number | null;
  /** Only notices: other managers report the holdings. */
  notice: boolean;
  reportedBy: string[];
  /** Some holdings left out for now under a request for confidential treatment. */
  confidentialOmitted: boolean;
  /** Information-table lines that could not be read. */
  unread: number;
}

/** The report as it stands before a filing: its line count and value total in dollars, as filed. */
interface Standing {
  entries: number | null;
  total: number | null;
}

const near = (a: number | null, b: number | null) => a != null && b != null && b > 0 && Math.abs(a - b) <= b * 0.01;

/**
 * How a holdings filing counts against the report standing before it: a report, holdings added, or a restatement. A
 * new-holdings amendment that repeats the whole report (the same number of lines and the same total, each within 1%)
 * is read as a restatement, `repeated`: filers send those too (JPMorgan's for the third quarter of 2025, 32,847 lines
 * and $1,669.08 billion against the report's 32,847 and $1,669.07 billion), and adding one counts every holding twice.
 */
export function filingUse(cover: Cover13F, filed: string, standing: Standing | null): { use: Exclude<FilingUse, 'notice'>; repeated: boolean } {
  if (!cover.amendment) return { use: 'report', repeated: false };
  if (cover.amendmentType !== 'NEW HOLDINGS') return { use: 'restatement', repeated: false };
  const total = cover.total != null ? cover.total * valueUnit(filed) : null;
  const repeated = !!standing && near(cover.entries, standing.entries) && near(total, standing.total);
  return repeated ? { use: 'restatement', repeated: true } : { use: 'added', repeated: false };
}

/** The report standing after a filing counted as `use`. */
function standingAfter(before: Standing | null, cover: Cover13F, filed: string, use: Exclude<FilingUse, 'notice'>): Standing {
  const total = cover.total != null ? cover.total * valueUnit(filed) : null;
  if (use !== 'added' || !before) return { entries: cover.entries, total };
  return { entries: before.entries != null && cover.entries != null ? before.entries + cover.entries : null, total: before.total != null && total != null ? before.total + total : null };
}

/**
 * A quarter's holdings from its filings: the report, then each amendment in the order filed. A restatement replaces
 * what came before; a new-holdings amendment adds to it (holdings first kept confidential, for one). A notice says
 * other managers report the holdings.
 */
export function combineQuarter(period: string, parts: { filing: Filing; answer: Answer13F }[]): QuarterHoldings {
  const ordered = [...parts].sort((a, b) => a.filing.filed.localeCompare(b.filing.filed) || a.filing.accession.localeCompare(b.filing.accession));
  let held = new Map<string, Position>();
  let standing: Standing | null = null;
  const used: QuarterHoldings['filings'] = [];
  const reportedBy: string[] = [];
  let notice = true;
  let confidentialOmitted = false;
  let unread = 0;
  let manager = '';
  for (const { filing, answer } of ordered) {
    const cover = answer.cover;
    if (!cover) continue;
    manager = cover.manager || manager;
    if (/NOTICE/i.test(cover.reportType)) {
      for (const m of cover.reportedBy) if (!reportedBy.includes(m.name)) reportedBy.push(m.name);
      used.push({ filing, cover, use: 'notice', lines: 0 });
      continue;
    }
    notice = false;
    const unit = valueUnit(filing.filed);
    const { use, repeated } = filingUse(cover, filing.filed, standing);
    const adds = use === 'added';
    if (!adds) held = new Map();
    const lines = answer.holdings ?? [];
    for (const l of lines) {
      const key = positionKey(l);
      const was = held.get(key);
      if (was) held.set(key, { ...was, value: was.value + l.value * unit, amount: was.amount + l.amount });
      else held.set(key, { key, cusip: l.cusip, issuer: l.issuer, cls: l.cls, ...(l.figi ? { figi: l.figi } : {}), type: l.type, putCall: l.putCall, value: l.value * unit, amount: l.amount });
    }
    standing = standingAfter(standing, cover, filing.filed, use);
    confidentialOmitted = adds ? confidentialOmitted : cover.confidentialOmitted;
    unread = (adds ? unread : 0) + (answer.unread ?? 0);
    used.push({ filing, cover, use, lines: lines.length, ...(repeated ? { repeated } : {}) });
  }
  const positions = [...held.values()].sort((a, b) => b.value - a.value);
  return {
    period,
    manager,
    filings: used,
    positions,
    total: positions.reduce((a, p) => a + p.value, 0),
    filedTotal: notice ? null : (standing?.total ?? null),
    notice: notice && used.length > 0,
    reportedBy,
    confidentialOmitted,
    unread,
  };
}

export type Change = 'new' | 'added' | 'reduced' | 'same' | 'sold';

export interface Compared extends Position {
  /** The previous quarter's amount and value; 0 for a new holding. */
  prevAmount: number;
  prevValue: number;
  /** Null without a previous quarter to compare with. */
  change: Change | null;
  /** Shares or principal bought (positive) or sold (negative) between the quarters. */
  diff: number;
  /** That change as a share of the previous amount; NaN for a new holding. */
  diffPct: number;
}

/**
 * Each holding against the previous quarter's, by the number of shares (or principal amount): new, added, reduced,
 * unchanged. Holdings of the previous quarter no longer held are `sold`. A stock split between the two quarter ends
 * shows as a change in shares, as the filings give no split.
 */
export function compareQuarters(cur: Position[], prev: Position[] | null): { rows: Compared[]; sold: Compared[] } {
  const before = new Map((prev ?? []).map((p) => [p.key, p]));
  const rows = cur.map((p): Compared => {
    if (!prev) return { ...p, prevAmount: NaN, prevValue: NaN, change: null, diff: NaN, diffPct: NaN };
    const b = before.get(p.key);
    if (!b) return { ...p, prevAmount: 0, prevValue: 0, change: 'new', diff: p.amount, diffPct: NaN };
    const diff = p.amount - b.amount;
    return { ...p, prevAmount: b.amount, prevValue: b.value, change: diff > 0 ? 'added' : diff < 0 ? 'reduced' : 'same', diff, diffPct: b.amount > 0 ? (diff / b.amount) * 100 : NaN };
  });
  const now = new Set(cur.map((p) => p.key));
  const sold = (prev ?? [])
    .filter((p) => !now.has(p.key))
    .map((p): Compared => ({ ...p, value: 0, amount: 0, prevAmount: p.amount, prevValue: p.value, change: 'sold', diff: -p.amount, diffPct: -100 }));
  return { rows, sold };
}

/** The quarter-end price a holding's filed value implies: value ÷ shares, for shares held outright. */
export function impliedPrice(p: Position): number {
  return p.type === 'SH' && !p.putCall && p.amount > 0 ? p.value / p.amount : NaN;
}

// --------------------------------------------------------------- loading

const answers = new Map<string, Promise<Answer13F>>();

/** A filing's cover, or its cover and holdings, through the main process; kept for the session when read. */
function answer(cik: number, accession: string, part: 'cover' | 'holdings'): Promise<Answer13F> {
  const key = `${cik}:${accession}:${part}`;
  const kept = answers.get(key) ?? (part === 'cover' ? answers.get(`${cik}:${accession}:holdings`) : undefined);
  if (kept) return kept;
  const p = window.arminDesktop!.sec13f!(cik, accession, part).catch((err): Answer13F => ({ status: 0, error: String((err as Error)?.message ?? err) }));
  answers.set(key, p);
  // A failed read is asked again next time.
  void p.then((a) => {
    if (!a.cover) answers.delete(key);
  });
  return p;
}

function failure(a: Answer13F, f: Filing): SecResult<never> | null {
  if (a.missing) return { ok: false, reason: 'needs-agent', message: SEC_NEEDS_AGENT };
  if (a.refused) return { ok: false, reason: 'refused', message: a.refused };
  if (a.cover && a.unreadable !== 'table') return null;
  if (a.unreadable === 'table') return { ok: false, reason: 'error', message: `The information table of the 13F filed ${f.filed} could not be read.` };
  if (a.unreadable === 'cover' || a.status === 404) return { ok: false, reason: 'not-found', message: `The 13F filed ${f.filed} has no cover page in XML (13F filings are in XML from mid-2013). It can be read on sec.gov.` };
  if (a.status === 403) return { ok: false, reason: 'refused', message: 'The SEC refused the request (HTTP 403). It refuses requests without a proper User-Agent and clients over its rate limit.' };
  return { ok: false, reason: 'error', message: a.error ? `The SEC did not answer: ${a.error}` : `The SEC answered HTTP ${a.status}.` };
}

/** A quarter's holdings, from each of its filings. */
export async function loadQuarter(cik: number, q: Quarter13F): Promise<SecResult<QuarterHoldings>> {
  const got = await Promise.all(q.filings.map(async (filing) => ({ filing, answer: await answer(cik, filing.accession, 'holdings') })));
  for (const g of got) {
    const bad = failure(g.answer, g.filing);
    if (bad) return bad;
  }
  return { ok: true, data: combineQuarter(q.period, got), at: Math.min(...got.map((g) => g.answer.at ?? Date.now())) };
}

/** A quarter's value as filed, from its filings' cover pages alone: for the history. */
export interface QuarterTotal {
  period: string;
  total: number | null;
  entries: number | null;
  notice: boolean;
}

/** A quarter's value and line count as filed, from its filings' cover pages, combined as `combineQuarter` combines them. */
export function quarterTotals(period: string, covers: { filing: Filing; cover: Cover13F }[]): QuarterTotal {
  const ordered = [...covers].sort((a, b) => a.filing.filed.localeCompare(b.filing.filed) || a.filing.accession.localeCompare(b.filing.accession));
  let standing: Standing | null = null;
  for (const { filing, cover } of ordered) {
    if (/NOTICE/i.test(cover.reportType)) continue;
    standing = standingAfter(standing, cover, filing.filed, filingUse(cover, filing.filed, standing).use);
  }
  return { period, total: standing?.total ?? null, entries: standing?.entries ?? null, notice: !standing };
}

async function quarterTotal(cik: number, q: Quarter13F): Promise<QuarterTotal | null> {
  const covers = await Promise.all(q.filings.map(async (filing) => ({ filing, cover: (await answer(cik, filing.accession, 'cover')).cover })));
  if (covers.some((c) => !c.cover)) return null;
  return quarterTotals(q.period, covers as { filing: Filing; cover: Cover13F }[]);
}

export interface HoldingsReport {
  company: string;
  cik: number;
  /** Every quarter with a 13F among the filings the SEC lists first (about the last thousand). */
  quarters: Quarter13F[];
  current: QuarterHoldings;
  /** The quarter before the one shown, when there is a filing for it. */
  previous: QuarterHoldings | null;
  /** Value as filed for up to eight quarters to the one shown, oldest first. */
  history: QuarterTotal[];
  /** The oldest filing date the list covers. */
  listedSince: string;
  links: { filing: string; index: string };
}

/** The quarter before a quarter's end: 2026-06-30 → 2026-03-31. */
export function previousQuarterEnd(period: string): string {
  const d = new Date(`${period}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 0)).toISOString().slice(0, 10);
}

export const NO_13F = (name: string) =>
  `${name} has filed no Form 13F among its filings on EDGAR. A 13F is filed by an institutional investment manager with discretion over $100 million or more of US-listed stocks and other Section 13(f) securities; most companies hold no such portfolio, or report it through a subsidiary of their own.`;

/** A company's 13F holdings for a quarter (the latest when none is given), with the quarter before and the history. */
export async function loadHoldings(def: SecurityDef, period?: string, force = false): Promise<SecResult<HoldingsReport>> {
  if (!secAvailable()) return { ok: false, reason: 'desktop-only', message: SEC_DESKTOP_ONLY };
  const ticker = secTicker(def);
  if (!ticker) return { ok: false, reason: 'not-found', message: '13F filings are made with the SEC, for US-listed companies.' };
  const filer = await resolveFiler(ticker, force);
  if (!filer.ok) return filer;
  return loadHoldingsOf(filer.data.cik, period, force);
}

/** A 13F filer's report by its CIK: an investment manager with no listed shares (FLNG opens these). */
export async function loadHoldingsOf(filerCik: number, period?: string, force = false): Promise<SecResult<HoldingsReport>> {
  if (!secAvailable()) return { ok: false, reason: 'desktop-only', message: SEC_DESKTOP_ONLY };
  const sub = await loadFiler(filerCik, force);
  if (!sub.ok) return sub;
  const cik = sub.data.cik;
  const quarters = quartersOf(sub.data.filings);
  const listedSince = sub.data.filings.at(-1)?.filed ?? '';
  if (!quarters.length) return { ok: false, reason: 'not-found', message: NO_13F(sub.data.name) };
  const i = Math.max(0, period ? quarters.findIndex((q) => q.period === period) : 0);
  const q = quarters[i];
  const prevQ = quarters.find((x) => x.period === previousQuarterEnd(q.period)) ?? null;
  const [cur, prev, history] = await Promise.all([
    loadQuarter(cik, q),
    prevQ ? loadQuarter(cik, prevQ) : Promise.resolve(null),
    Promise.all(quarters.slice(i, i + 8).map((x) => quarterTotal(cik, x))),
  ]);
  if (!cur.ok) return cur;
  const main = q.filings.find((f) => !/\/A$/i.test(f.form)) ?? q.filings[0];
  const links = filingLinks(cik, main);
  return {
    ok: true,
    data: {
      company: sub.data.name,
      cik,
      quarters,
      current: cur.data,
      previous: prev && prev.ok ? prev.data : null,
      history: history.filter((h): h is QuarterTotal => !!h).reverse(),
      listedSince,
      links: { filing: links.doc ?? links.index, index: links.index },
    },
    at: cur.at,
  };
}

// ------------------------------------------------------- tickers by CUSIP

export interface FigiHit {
  ticker?: string;
  name?: string;
  securityType?: string;
  figi?: string;
  none?: boolean;
  error?: string;
}

export interface FigiAnswer {
  status: number;
  results: Record<string, FigiHit>;
  keyed?: boolean;
  cached?: boolean;
  gated?: string;
  error?: string;
}

const figi = new Map<string, FigiHit>();
const figiAsked = new Set<string>();
export const figiState = createStore<{ v: number; problem: string }>({ v: 0, problem: '' });

async function askFigi(codes: string[]) {
  for (const c of codes) figiAsked.add(c);
  let problem = '';
  try {
    const a = await window.arminDesktop!.openfigi!(codes);
    for (const [c, hit] of Object.entries(a.results ?? {})) if (!hit.error) figi.set(c, hit);
    if (a.gated) problem = 'OpenFIGI is switched off (OPENFIGI_ENABLED on PROVIDERS): holdings are shown without tickers.';
    else if (a.status === 429) problem = 'OpenFIGI asked the app to slow down; the remaining tickers are asked for again in a minute.';
    else if (a.status !== 200 || a.error) problem = `OpenFIGI did not answer for every holding${a.error ? `: ${a.error}` : a.status ? ` (HTTP ${a.status})` : ''}.`;
  } catch (err) {
    problem = `OpenFIGI did not answer: ${String((err as Error)?.message ?? err)}`;
  }
  // Codes left without an answer are asked again after a minute.
  const missing = codes.filter((c) => !figi.has(c));
  if (missing.length)
    setTimeout(() => {
      missing.forEach((c) => figiAsked.delete(c));
      figiState.set((s) => ({ ...s, v: s.v + 1 }));
    }, 60_000);
  figiState.set((s) => ({ v: s.v + 1, problem }));
}

/** The US ticker of each CUSIP, from OpenFIGI through the main process; codes are asked for once a session. */
export function useFigi(codes: string[]): { hits: Map<string, FigiHit>; problem: string } {
  const st = figiState.use((s) => s);
  const key = codes.join(',');
  useEffect(() => {
    if (typeof window === 'undefined' || !window.arminDesktop?.openfigi) return;
    const due = codes.filter((c) => /^[0-9A-Z]{8}[0-9]$/.test(c) && !figi.has(c) && !figiAsked.has(c));
    if (due.length) void askFigi(due);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, st.v]);
  const hits = new Map<string, FigiHit>();
  for (const c of codes) {
    const h = figi.get(c);
    if (h) hits.set(c, h);
  }
  return { hits, problem: st.problem };
}

/** "CIK 1350694" or "CIK0001350694" in a route's arguments: the 13F filer it names. */
export function cikArg(args: string | undefined): number | null {
  const m = /^CIK\s*0*([1-9]\d{0,9})$/i.exec(String(args ?? '').trim());
  return m ? Number(m[1]) : null;
}
