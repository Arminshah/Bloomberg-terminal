import { useEffect } from 'react';
import { createStore } from '../../core/store';

/**
 * Members of Congress, what they own and what they trade, from their financial disclosures (desktop app):
 * - the House: the Clerk's yearly index of filings, each periodic transaction report (PTR) and each annual report,
 *   read from its PDF in the main process (electron/congress.cjs); reports filed on paper are scans, linked only;
 * - the Senate: its disclosure site refuses automated reading, so senators' trades come from FMP's list of the latest
 *   ones (25 on the free plan, with the owner's key), which the app keeps as they arrive;
 * - party and state from the House Clerk's and the Senate's member lists.
 * Amounts are disclosed as ranges ($1,001 - $15,000, ...); totals here are ranges too, never a single made-up figure.
 */

export interface Member {
  chamber: 'House' | 'Senate';
  bioguide: string;
  last: string;
  first: string;
  name: string;
  party: string;
  state: string;
  /** "CA11" for a representative, the state for a senator. */
  stateDst: string;
}

/** A line of the House Clerk's yearly index. */
export interface HouseFiling {
  prefix: string;
  last: string;
  first: string;
  suffix: string;
  /** P trade report, O annual report, A amendment, C candidate, X extension, T termination, W withdrawn. */
  type: string;
  stateDst: string;
  year: number;
  filed: string;
  docId: string;
}

export interface Trade {
  /** SP spouse, JT joint, DC dependent child; blank for the member. */
  owner: string;
  asset: string;
  name: string;
  ticker: string;
  code: string;
  account?: string;
  /** P purchase, S sale, S (partial), E exchange. */
  type: string;
  date: string;
  notified: string;
  amount: string;
  min: number | null;
  max: number | null;
  status?: string;
  subholding?: string;
  description?: string;
  comments?: string;
  location?: string;
}

interface FormHeader {
  filingId: string;
  name: string;
  status: string;
  stateDst: string;
  filingType: string;
  filingYear: string;
  filed: string;
  /** No text: filed on paper and scanned. */
  scanned: boolean;
  pages?: number;
  read?: number;
}

export interface TradeReport extends FormHeader {
  transactions: Trade[];
}

export interface Asset {
  owner: string;
  asset: string;
  name: string;
  ticker: string;
  code: string;
  account?: string;
  value: string;
  min: number | null;
  max: number | null;
  description?: string;
  location?: string;
  comments?: string;
}

export interface AnnualReport extends FormHeader {
  assets: Asset[];
}

/** Asset type codes as the House lists them (fd.house.gov/reference/asset-type-codes.aspx). */
export const ASSET_TYPES: Record<string, string> = {
  '4K': '401K or retirement account', '5C': '529 savings plan', '5F': '529 portfolio', '5P': '529 prepaid tuition', AB: 'Asset-backed security',
  BA: 'Bank or money market account', BK: 'Brokerage account', CO: 'Collectible', CS: 'Corporate bond', CT: 'Cryptocurrency', DB: 'Defined benefit pension',
  DO: 'Debt owed to the filer', DS: 'Delaware statutory trust', EF: 'ETF', EQ: 'Blind trust', ET: 'Exchange traded note', FA: 'Farm', FE: 'Currency position',
  FN: 'Fixed annuity', FU: 'Futures', GS: 'Government security', HE: 'Hedge or private equity fund', HN: 'Hedge or private equity fund', IC: 'Investment club',
  IH: 'IRA (cash)', IP: 'Intellectual property', IR: 'IRA', MA: 'Managed account', MF: 'Mutual fund', MO: 'Mineral, oil or solar rights',
  OI: 'Ownership interest (investments)', OL: 'Ownership interest (business)', OP: 'Options', OT: 'Other', PE: 'Pension', PM: 'Precious metals',
  PS: 'Private stock', RE: 'REIT', RF: 'REIT', RN: 'REIT', RP: 'Real property', RS: 'Restricted stock units', SA: 'Stock appreciation right',
  ST: 'Stock', TR: 'Trust', VA: 'Variable annuity', VI: 'Variable insurance', WU: 'Life insurance',
};

export const TYPE_TEXT: Record<string, string> = { P: 'Purchase', S: 'Sale', 'S (partial)': 'Partial sale', E: 'Exchange' };
export const OWNER_TEXT: Record<string, string> = { '': 'Member', SP: 'Spouse', JT: 'Joint', DC: 'Child' };

/** The STOCK Act's limit: a trade is disclosed within 45 days of it (and 30 of the member learning of it). */
export const DISCLOSURE_DAYS = 45;

// ------------------------------------------------------------- ranges

export interface Range {
  min: number;
  /** Null when a part has no upper end ("Over $50,000,000"). */
  max: number | null;
  /** Parts without a value ("Undetermined"). */
  unknown: number;
  count: number;
}

/** "$1,001 - $15,000" → { min, max }; "Over $50,000,000" → { min, max: null }; "None" → zero; null otherwise. */
export function amountRange(text: string): { min: number; max: number | null } | null {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  if (/^none$/i.test(t)) return { min: 0, max: 0 };
  const nums = [...t.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  if (/\bover\b/i.test(t) && nums.length === 1) return { min: nums[0], max: null };
  if (nums.length === 2 && nums[0] <= nums[1]) return { min: nums[0], max: nums[1] };
  return null;
}

/** The sum of some ranges: the lowest and highest totals they allow. */
export function rangeSum(items: { min: number | null; max: number | null }[]): Range {
  let min = 0;
  let max: number | null = 0;
  let unknown = 0;
  for (const it of items) {
    if (it.min == null) {
      unknown++;
      continue;
    }
    min += it.min;
    max = max == null || it.max == null ? null : max + it.max;
  }
  return { min, max, unknown, count: items.length };
}

// ------------------------------------------------------------ members

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');

/** Finds the current member a House filing belongs to: same seat and last name, else the one member of the state with that last name. */
export function memberFinder(house: Member[]): (f: { last: string; stateDst: string }) => Member | undefined {
  const seat = new Map<string, Member>();
  const state = new Map<string, Member[]>();
  for (const m of house) {
    seat.set(`${m.stateDst}|${norm(m.last)}`, m);
    const k = `${m.state}|${norm(m.last)}`;
    state.set(k, [...(state.get(k) ?? []), m]);
  }
  return (f) => {
    const last = norm(f.last);
    const same = state.get(`${f.stateDst.slice(0, 2)}|${last}`);
    return seat.get(`${f.stateDst}|${last}`) ?? (same?.length === 1 ? same[0] : undefined);
  };
}

/** Each member's latest annual report: the latest year filed, and its latest filing (an amendment after the report). */
export function latestAnnuals(filings: HouseFiling[], house: Member[]): Map<Member, HouseFiling> {
  const find = memberFinder(house);
  const out = new Map<Member, HouseFiling>();
  for (const f of filings) {
    if (f.type !== 'O' && f.type !== 'A') continue;
    const m = find(f);
    if (!m) continue;
    const had = out.get(m);
    if (!had || f.year > had.year || (f.year === had.year && (f.filed > had.filed || (f.filed === had.filed && f.docId > had.docId)))) out.set(m, f);
  }
  return out;
}

export const ptrLink = (f: { year: number; docId: string }) => `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${f.year}/${f.docId}.pdf`;
export const annualLink = (f: { year: number; docId: string }) => `https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${f.year}/${f.docId}.pdf`;

// ------------------------------------------------------------- trades

/** One trade, from either source, as the screens list them. */
export interface TradeRow {
  key: string;
  chamber: 'House' | 'Senate';
  member: string;
  bioguide: string;
  party: string;
  /** "CA11", or a senator's state. */
  seat: string;
  owner: string;
  ticker: string;
  asset: string;
  code: string;
  assetType: string;
  type: string;
  date: string;
  filed: string;
  amount: string;
  min: number | null;
  max: number | null;
  description?: string;
  /** The account it was made in ("Morgan Stanley - E*TRADE IRA"), as the report names it. */
  account?: string;
  link: string;
  source: 'House Clerk' | 'FMP';
}

const dayMs = 86_400_000;
const isoDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Days from the trade to its disclosure; NaN when either date is missing. */
export function daysToDisclose(r: { date: string; filed: string }): number {
  return r.date && r.filed ? Math.round((isoDay(r.filed) - isoDay(r.date)) / dayMs) : NaN;
}

const tradeRows = new WeakMap<TradeReport, { find: unknown; rows: TradeRow[] }>();

/** houseTrades, kept per report: a report read once is not taken apart again on every redraw. */
export function houseTradesOf(f: HouseFiling, report: TradeReport, find: (f: HouseFiling) => Member | undefined): TradeRow[] {
  const hit = tradeRows.get(report);
  if (hit && hit.find === find) return hit.rows;
  const rows = houseTrades(f, report, find);
  tradeRows.set(report, { find, rows });
  return rows;
}

/** The House trades of a report, with the filing's member and date. */
export function houseTrades(f: HouseFiling, report: TradeReport, find: (f: HouseFiling) => Member | undefined): TradeRow[] {
  const m = find(f);
  return report.transactions.map((t, i) => ({
    key: `H|${f.docId}|${i}`,
    chamber: 'House',
    member: m?.name ?? [f.first, f.last, f.suffix].filter(Boolean).join(' '),
    bioguide: m?.bioguide ?? '',
    party: m?.party ?? '',
    seat: f.stateDst,
    owner: t.owner,
    ticker: t.ticker,
    asset: t.name || t.asset,
    code: t.code,
    assetType: ASSET_TYPES[t.code] ?? t.code,
    type: t.type,
    date: t.date,
    filed: f.filed,
    amount: t.amount,
    min: t.min,
    max: t.max,
    ...(t.description ? { description: t.description } : {}),
    ...(t.subholding || t.account ? { account: t.subholding ?? t.account } : {}),
    link: ptrLink(f),
    source: 'House Clerk',
  }));
}

/** A row of FMP's congress lists: {symbol, senateID (the bioguide ID), disclosureDate, transactionDate, ...}. */
export interface FmpCongressRow {
  chamber: 'senate' | 'house';
  symbol?: string;
  senateID?: string;
  disclosureDate: string;
  transactionDate?: string;
  firstName?: string;
  lastName?: string;
  office?: string;
  district?: string;
  owner?: string;
  assetDescription?: string;
  assetType?: string;
  type?: string;
  amount?: string;
  comment?: string;
  link?: string;
}

const FMP_TYPES: Record<string, string> = { purchase: 'P', 'sale (full)': 'S', sale: 'S', 'sale (partial)': 'S (partial)', exchange: 'E' };
const FMP_OWNERS: Record<string, string> = { spouse: 'SP', joint: 'JT', dependent: 'DC', child: 'DC', self: '' };

/** A row of FMP's list, with the member's party from the member lists (by bioguide ID). */
export function fmpTrade(r: FmpCongressRow, i: number, members: Member[]): TradeRow {
  const chamber = r.chamber === 'senate' ? 'Senate' : 'House';
  const m = members.find((x) => x.bioguide && x.bioguide === r.senateID);
  const range = amountRange(r.amount ?? '');
  const ticker = String(r.symbol ?? '').trim().toUpperCase().replace('.', '/');
  return {
    key: `F|${r.chamber}|${r.link ?? ''}|${i}`,
    chamber,
    member: m?.name ?? [r.firstName, r.lastName].filter(Boolean).join(' '),
    bioguide: r.senateID ?? '',
    party: m?.party ?? '',
    seat: chamber === 'House' ? r.district || m?.stateDst || '' : m?.state ?? '',
    owner: FMP_OWNERS[String(r.owner ?? '').toLowerCase()] ?? '',
    ticker: /^[A-Z][A-Z0-9]{0,5}(\/[A-Z]{1,2})?$/.test(ticker) ? ticker : '',
    asset: r.assetDescription ?? '',
    code: '',
    assetType: r.assetType ?? '',
    type: FMP_TYPES[String(r.type ?? '').toLowerCase()] ?? (r.type ?? ''),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.transactionDate ?? '') ? r.transactionDate! : '',
    filed: r.disclosureDate,
    amount: r.amount ?? '',
    min: range ? range.min : null,
    max: range ? range.max : null,
    ...(r.comment ? { description: r.comment } : {}),
    link: r.link ?? '',
    source: 'FMP',
  };
}

/** The House document a FMP row comes from, by its link (…/ptr-pdfs/2026/20035669.pdf). */
export function fmpDocId(link: string): string {
  return /\/ptr-pdfs\/\d{4}\/(\d+)\.pdf$/.exec(link)?.[1] ?? '';
}

// ------------------------------------------------------------ holdings

/** A security the members hold: who, and the value range each holds, from their annual reports. */
export interface Owned {
  ticker: string;
  name: string;
  holders: { member: Member; range: Range }[];
  /** The holders' values added up. */
  total: Range;
}

/**
 * The securities held by the most members, from their annual reports: assets of the given type codes with a ticker,
 * each member's lines of a ticker (accounts, spouse) added up. Assets named without a ticker are left out.
 */
export function mostOwned(reports: { member: Member; report: AnnualReport }[], codes: string[]): { owned: Owned[]; withoutTicker: number } {
  const by = new Map<string, { names: Map<string, number>; lines: Map<Member, Asset[]> }>();
  let withoutTicker = 0;
  for (const { member, report } of reports) {
    for (const a of report.assets) {
      if (!codes.includes(a.code)) continue;
      if (!a.ticker) {
        withoutTicker++;
        continue;
      }
      const e = by.get(a.ticker) ?? { names: new Map<string, number>(), lines: new Map<Member, Asset[]>() };
      e.lines.set(member, [...(e.lines.get(member) ?? []), a]);
      e.names.set(a.name, (e.names.get(a.name) ?? 0) + 1);
      by.set(a.ticker, e);
    }
  }
  const owned = [...by.entries()].map(([ticker, e]) => {
    const holders = [...e.lines.entries()].map(([member, lines]) => ({ member, range: rangeSum(lines) })).sort((a, b) => b.range.min - a.range.min);
    // The name most reports give it, the shorter of two as common.
    const name = [...e.names.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0];
    return { ticker, name, holders, total: rangeSum(holders.map((h) => ({ min: h.range.min, max: h.range.max }))) };
  });
  return { owned, withoutTicker };
}

// ------------------------------------------------------------- loading

/** What the main process answers (electron/main.cjs 'congress'). */
export interface CongressAnswer {
  status: number;
  error?: string;
  cached?: boolean;
  at?: number;
  house?: Member[];
  senate?: Member[];
  partial?: boolean;
  year?: number;
  filings?: HouseFiling[];
  report?: TradeReport | AnnualReport;
  rows?: FmpCongressRow[];
  gaps?: FmpState['gaps'];
  since?: string | null;
  gated?: string;
  missing?: string;
  refused?: string;
  stale?: boolean;
}

type Failed = { error: string };
export interface FmpState {
  rows: FmpCongressRow[];
  gaps: { chamber: string; from: string; to: string; at: number }[];
  since: string | null;
  at?: number;
  problem?: string;
}

export interface CongressState {
  members: { house: Member[]; senate: Member[] } | null;
  problems: string[];
  index: Record<number, HouseFiling[]>;
  ptr: Record<string, TradeReport | Failed>;
  annual: Record<string, AnnualReport | Failed>;
  fmp: { senate?: FmpState; house?: FmpState };
  /** Reports asked for and not answered yet. */
  waiting: { ptr: number; annual: number };
}

export const congress = createStore<CongressState>({ members: null, problems: [], index: {}, ptr: {}, annual: {}, fmp: {}, waiting: { ptr: 0, annual: 0 } });

export function congressAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.congress === 'function';
}

const asked = new Set<string>();
const note = (problem: string) => congress.set((s) => (s.problems.includes(problem) ? s : { ...s, problems: [...s.problems, problem] }));

async function loadMembers() {
  if (asked.has('members')) return;
  asked.add('members');
  const a = await window.arminDesktop!.congress!('members', '').catch((e: unknown): CongressAnswer => ({ status: 0, error: String(e) }));
  if (a.house || a.senate) congress.set((s) => ({ ...s, members: { house: a.house ?? [], senate: a.senate ?? [] } }));
  if (!a.house?.length || !a.senate?.length) {
    note(`The ${!a.house?.length ? 'House' : 'Senate'} member list did not load${a.error ? `: ${a.error}` : ''}; parties may be missing.`);
    setTimeout(() => asked.delete('members'), 60_000);
  }
}

async function loadIndex(year: number) {
  const key = `index:${year}`;
  if (asked.has(key)) return;
  asked.add(key);
  const a = await window.arminDesktop!.congress!('index', String(year)).catch((e: unknown): CongressAnswer => ({ status: 0, error: String(e) }));
  if (a.filings) congress.set((s) => ({ ...s, index: { ...s.index, [year]: a.filings! } }));
  else {
    note(`The House Clerk's ${year} index did not load${a.error ? `: ${a.error}` : a.status ? ` (HTTP ${a.status})` : ''}.`);
    setTimeout(() => asked.delete(key), 60_000);
  }
}

/** Which reports the screen needs first: trade reports, annual reports, or both taken in turn (Members). */
export type CongressNeed = 'ptr' | 'annual' | 'both';

/** Reports to read, the needed kind first, each kind in the order asked (newest first). */
const queue: { kind: 'ptr' | 'annual'; f: HouseFiling }[] = [];
let running = 0;
let need: CongressNeed = 'ptr';
let lastKind: 'ptr' | 'annual' = 'annual';
/** Reports read at once; the main process keeps the House Clerk to four requests a second. */
const PARALLEL = 4;
/** When each of the latest reports was answered, for the time left. */
const answered: number[] = [];

// Answers are put on screen together, at most every 0.6 s: one redraw for several reports, not one each.
let batch: { kind: 'ptr' | 'annual'; docId: string; value: TradeReport | AnnualReport | Failed }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (!batch.length) return;
  const done = batch;
  batch = [];
  congress.set((s) => {
    const ptr = { ...s.ptr };
    const annual = { ...s.annual };
    const waiting = { ...s.waiting };
    for (const d of done) {
      (d.kind === 'ptr' ? ptr : annual)[d.docId] = d.value;
      waiting[d.kind] = Math.max(0, waiting[d.kind] - 1);
    }
    return { ...s, ptr, annual, waiting };
  });
}

function next(): number {
  if (need === 'both') {
    // Members shows both: take the kinds in turn while both wait.
    const other = lastKind === 'ptr' ? 'annual' : 'ptr';
    const i = queue.findIndex((j) => j.kind === other);
    return i >= 0 ? i : 0;
  }
  return Math.max(0, queue.findIndex((j) => j.kind === need));
}

function pump() {
  while (running < PARALLEL && queue.length) {
    const job = queue.splice(next(), 1)[0];
    lastKind = job.kind;
    running++;
    void window.arminDesktop!.congress!(job.kind, `${job.f.year}/${job.f.docId}`)
      .then((a) => ({ report: a.report, problem: a.report ? '' : a.error ?? (a.status ? `HTTP ${a.status}` : 'no answer') }))
      .catch((e: unknown) => ({ report: undefined, problem: String(e) }))
      .then(({ report, problem }) => {
        batch.push({ kind: job.kind, docId: job.f.docId, value: (report as TradeReport | AnnualReport | undefined) ?? { error: problem } });
        answered.push(Date.now());
        if (answered.length > 40) answered.shift();
      })
      .finally(() => {
        running--;
        if (!queue.length && !running) flush();
        else if (!flushTimer) flushTimer = setTimeout(flush, 600);
        pump();
      });
  }
}

/** Reports answered a second, over the latest ones; NaN before there are a few. */
export function readRate(now = Date.now()): number {
  const recent = answered.filter((t) => now - t < 30_000);
  if (recent.length < 4) return NaN;
  return recent.length / Math.max(1, (now - recent[0]) / 1000);
}

function want(kind: 'ptr' | 'annual', filings: HouseFiling[]) {
  const s = congress.get();
  const fresh = filings.filter((f) => !s[kind][f.docId] && !asked.has(`${kind}:${f.docId}`));
  if (!fresh.length) return;
  for (const f of fresh) {
    asked.add(`${kind}:${f.docId}`);
    queue.push({ kind, f });
  }
  congress.set((x) => ({ ...x, waiting: { ...x.waiting, [kind]: x.waiting[kind] + fresh.length } }));
  pump();
}

async function loadFmp(chamber: 'senate' | 'house') {
  const key = `fmp:${chamber}`;
  if (asked.has(key)) return;
  asked.add(key);
  setTimeout(() => asked.delete(key), 2 * 3_600_000);
  const a = await window.arminDesktop!.congress!('fmp', chamber).catch((e: unknown): CongressAnswer => ({ status: 0, error: String(e) }));
  const problem = a.gated
    ? 'FMP is switched off (FMP_ENABLED on PROVIDERS).'
    : a.missing
      ? 'Needs FMP_API_KEY (PROVIDERS): the Senate disclosure site refuses automated reading, so senators’ trades come from FMP.'
      : a.status && a.status !== 200
        ? `FMP answered HTTP ${a.status}.`
        : a.error
          ? `FMP did not answer: ${a.error}`
          : '';
  congress.set((s) => ({ ...s, fmp: { ...s.fmp, [chamber]: { rows: (a.rows ?? []) as FmpCongressRow[], gaps: a.gaps ?? [], since: a.since ?? null, at: Date.now(), ...(problem ? { problem } : {}) } } }));
}

/** Filings of a kind filed in the last `days` days, newest first. */
export function recentFilings(index: Record<number, HouseFiling[]>, type: string, days: number, today = new Date()): HouseFiling[] {
  const from = new Date(today.getTime() - days * dayMs).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return Object.values(index)
    .flat()
    .filter((f) => f.type === type && f.filed >= from && !seen.has(f.docId) && seen.add(f.docId))
    .sort((a, b) => b.filed.localeCompare(a.filed) || b.docId.localeCompare(a.docId));
}

/**
 * Loads what the screen shows while it is open: the member lists, the House indexes of this year and the two
 * before (trade reports of the window; annual reports of the latest years), the trade reports filed in the last
 * `days` days, and, when `annual`, each current representative's latest annual report.
 */
export function useCongress(days: number, needs: CongressNeed, enabled: boolean) {
  const st = congress.use((s) => s);
  const year = new Date().getUTCFullYear();
  useEffect(() => {
    if (!enabled || !congressAvailable()) return;
    void loadMembers();
    for (const y of [year, year - 1, year - 2]) void loadIndex(y);
    void loadFmp('senate');
    void loadFmp('house');
  }, [enabled, year]);
  useEffect(() => {
    need = needs;
  }, [needs]);
  useEffect(() => {
    if (!enabled || !congressAvailable()) return;
    want('ptr', recentFilings(st.index, 'P', days));
  }, [enabled, st.index, days]);
  const annual = needs !== 'ptr';
  useEffect(() => {
    if (!enabled || !annual || !congressAvailable() || !st.members) return;
    want('annual', [...latestAnnuals(Object.values(st.index).flat(), st.members.house).values()].sort((a, b) => b.filed.localeCompare(a.filed)));
  }, [enabled, annual, st.index, st.members]);
  return st;
}
