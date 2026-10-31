import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { membersAvailable } from './index-members';
import type { KeyedAnswer } from './lookup';
import { yahooGet, YahooDisabled } from './yahoo';

/**
 * The FTSE 100's members for SCREEN, from Wikipedia's article on the index: the table in its "Constituents" section
 * (company, ticker, ISIN, and the sector in FTSE Russell's Industry Classification Benchmark). The main process asks
 * the MediaWiki API for the article's sections; the app finds the one titled "Constituents" by its title and asks
 * for that section's text (electron/index-members.cjs, each answer kept a day). Wikipedia's text is CC BY-SA; the
 * screen names the article as the list's source.
 *
 * Each member's figures come from Yahoo Finance, two requests a member: the annual statement lines of its
 * fundamentals series (the latest fiscal year's gross profit, revenue, net income to common shareholders, common
 * equity and the year before's, diluted EPS) with the latest reported share count, and this year's daily closes and
 * dividends from its chart. Statements are kept 12 hours, prices 30 minutes.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface FtseMember {
  /** As Wikipedia names the company. */
  name: string;
  /** As Wikipedia writes it: BT.A. */
  ticker: string;
  /** The terminal's form, BT/A for BT/A LN Equity. */
  root: string;
  /** Yahoo's symbol: BT-A.L. */
  yahoo: string;
  isin: string;
  /** The ICB sector as the table gives it ("Banks", "Tobacco"). */
  sector: string;
}

/** Wikipedia's source, as the screen names it. */
export const FTSE_SOURCE = "Wikipedia's FTSE 100 Index article, Constituents table";

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The text of an HTML fragment: tags and footnote markers out, entities decoded, spaces collapsed. */
export function htmlText(html: string): string {
  return html
    .replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A London ticker as Wikipedia or the exchange writes it, in the terminal's form and Yahoo's: "BT.A" is BT/A and
 * BT-A.L; the exchange's trailing dot ("RR.") is dropped. All 100 members of 30 October 2026 answered at Yahoo's
 * chart under these symbols, none needing an exception.
 */
export function londonSymbols(ticker: string): { root: string; yahoo: string } | null {
  const t = ticker.trim().toUpperCase().replace(/\.$/, '');
  const m = /^([A-Z0-9]{1,6})(?:\.([A-Z]))?$/.exec(t);
  if (!m) return null;
  return { root: m[2] ? `${m[1]}/${m[2]}` : m[1], yahoo: `${m[1]}${m[2] ? `-${m[2]}` : ''}.L` };
}

function json(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The number of the article's section titled "Constituents", from the MediaWiki API's sections answer. */
export function constituentsSection(text: string): { index: string } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Wikipedia answered with something other than JSON.' };
  if (j?.error) return { error: `Wikipedia: ${j.error.info ?? j.error.code ?? 'the request was refused'}` };
  const sections: any[] = j?.parse?.tocdata?.sections ?? j?.parse?.sections ?? [];
  const s = sections.find((x) => htmlText(String(x?.line ?? '')).toLowerCase() === 'constituents');
  const index = String(s?.index ?? '');
  return /^[1-9][0-9]?$/.test(index) ? { index } : { error: "Wikipedia's FTSE 100 article has no section titled Constituents." };
}

/**
 * The members in the Constituents section's table, found by its headings (Company, Ticker, ISIN and the industry
 * classification), with the date of the index review the text names when it names one.
 */
export function parseFtseConstituents(text: string): { data: FtseMember[]; asOf?: string } | { error: string } {
  const j = json(text);
  if (j === undefined) return { error: 'Wikipedia answered with something other than JSON.' };
  if (j?.error) return { error: `Wikipedia: ${j.error.info ?? j.error.code ?? 'the request was refused'}` };
  const html: string = typeof j?.parse?.text === 'string' ? j.parse.text : String(j?.parse?.text?.['*'] ?? '');
  for (const table of html.match(/<table\b[\s\S]*?<\/table>/gi) ?? []) {
    const rows = table.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    const head = (rows[0]?.match(/<th\b[^>]*>[\s\S]*?<\/th>/gi) ?? []).map((c) => htmlText(c).toLowerCase());
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const [company, ticker, isin, sector] = [col(/^company/), col(/^(ticker|epic|tidm)/), col(/isin/), col(/industry|sector|icb/)];
    if (company < 0 || ticker < 0) continue;
    const data: FtseMember[] = [];
    for (const row of rows.slice(1)) {
      const cells = (row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []).map(htmlText);
      const symbols = londonSymbols(cells[ticker] ?? '');
      if (!symbols || !cells[company]) continue;
      data.push({ name: cells[company], ticker: (cells[ticker] ?? '').toUpperCase(), ...symbols, isin: isin >= 0 ? cells[isin] ?? '' : '', sector: sector >= 0 ? cells[sector] ?? '' : '' });
    }
    // The index has 100 members (101 while a company has two share classes in it); far fewer is a broken table.
    if (data.length < 90) return { error: `Wikipedia's FTSE 100 table has only ${data.length} members.` };
    const asOf = /after the changes (?:on|of) (\d{1,2} [A-Z][a-z]+ \d{4})/.exec(htmlText(html.slice(0, html.indexOf(table))))?.[1];
    return asOf ? { data, asOf } : { data };
  }
  return { error: "Wikipedia's Constituents section has no table of companies and tickers." };
}

export interface FtseList {
  state: 'loading' | 'ok' | 'error';
  members?: FtseMember[];
  /** The index review the article's text names ("1 October 2026"). */
  asOf?: string;
  /** When the main process received the list (it keeps it a day). */
  at?: number;
  message?: string;
}

export const ftse100 = createStore<{ v: number; list?: FtseList }>({ v: 0 });

const problemOf = (res: KeyedAnswer) => res.error ?? (res.status ? `HTTP ${res.status}` : 'no answer');

let listing: Promise<void> | null = null;
let listAt = 0;

/** Loads the member list: the article's sections, then the one titled Constituents. A failure keeps the last list. */
export function loadFtseList(): Promise<void> {
  const have = ftse100.get().list;
  if (have?.state === 'ok' && Date.now() - listAt < 12 * 3_600_000) return Promise.resolve();
  if (listing) return listing;
  if (!have) ftse100.set((s) => ({ ...s, v: s.v + 1, list: { state: 'loading' } }));
  listing = (async () => {
    let next: FtseList;
    try {
      const api = window.arminDesktop!.indexMembers!;
      const toc = await api('ftse100-sections');
      const found = toc.text ? constituentsSection(toc.text) : { error: `Wikipedia did not answer: ${problemOf(toc)}` };
      if ('error' in found) next = { state: 'error', message: found.error };
      else {
        const res = await api('ftse100', found.index);
        const parsed = res.text ? parseFtseConstituents(res.text) : { error: `Wikipedia did not answer: ${problemOf(res)}` };
        next = 'error' in parsed ? { state: 'error', message: parsed.error } : { state: 'ok', members: parsed.data, ...(parsed.asOf ? { asOf: parsed.asOf } : {}), at: res.at ?? Date.now() };
      }
    } catch {
      next = { state: 'error', message: 'The FTSE 100 member list could not be loaded.' };
    }
    if (next.state === 'ok') listAt = Date.now();
    // A failed refresh keeps the members already shown and says why.
    else if (have?.members) next = { ...have, state: 'error', message: next.message };
    ftse100.set((s) => ({ ...s, v: s.v + 1, list: next }));
  })().finally(() => {
    listing = null;
  });
  return listing;
}

// ------------------------------------------------------------------ Each member's figures from Yahoo

/** The statement lines asked for, and the share counts behind the market value. */
export const STATEMENT_TYPES = ['annualGrossProfit', 'annualTotalRevenue', 'annualNetIncomeCommonStockholders', 'annualCommonStockEquity', 'annualDilutedEPS', 'annualOrdinarySharesNumber', 'quarterlyOrdinarySharesNumber'] as const;

/** Four years of the statement lines (the latest fiscal year and the one before need two). */
export function statementsPath(symbol: string, now: number): string {
  const s = encodeURIComponent(symbol);
  const t = Math.floor(now / 1000);
  return `/ws/fundamentals-timeseries/v1/finance/timeseries/${s}?symbol=${s}&type=${STATEMENT_TYPES.join(',')}&period1=${t - 4 * 365 * 86_400}&period2=${t}`;
}

/** Daily closes and dividends from 1 December last year, so last year's final close is there. */
export function dailyPath(symbol: string, now: number): string {
  const y = new Date(now).getUTCFullYear();
  return `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${Date.UTC(y - 1, 11, 1) / 1000}&period2=${Math.floor(now / 1000)}&events=div`;
}

interface Point {
  end: string;
  value: number;
  currency?: string;
}

/** One line's reported values by period end, oldest first; Yahoo leaves nulls for years it has no figure. */
function points(res: any, type: string): Point[] {
  const out: Point[] = [];
  for (const r of (res?.timeseries?.result ?? []) as any[]) {
    if (r?.meta?.type?.[0] !== type) continue;
    for (const p of (Array.isArray(r[type]) ? r[type] : []) as any[]) {
      const value = p?.reportedValue?.raw;
      if (typeof value !== 'number' || !Number.isFinite(value) || !/^\d{4}-\d{2}-\d{2}$/.test(p?.asOfDate ?? '')) continue;
      out.push({ end: p.asOfDate, value, ...(typeof p.currencyCode === 'string' ? { currency: p.currencyCode } : {}) });
    }
  }
  return out.sort((a, b) => a.end.localeCompare(b.end));
}

export interface AnnualFigures {
  /** The latest fiscal year's end in Yahoo's annual statements, YYYY-MM-DD. */
  end?: string;
  /** The statements' currency that year. */
  currency?: string;
  grossProfit: number;
  revenue: number;
  /** Net income to common shareholders. */
  netIncome: number;
  /** Common equity at the year's end. */
  equity: number;
  /** Common equity at the end of the fiscal year before (the year's start), and that year's end. */
  equityBefore: number;
  beforeEnd?: string;
  /** Diluted EPS of the year, in the statements' currency. */
  eps: number;
  epsCurrency?: string;
  /** The latest reported ordinary share count, quarterly or annual, and its date. */
  shares: number;
  sharesAt?: string;
}

const DAY = 86_400_000;

/**
 * The latest fiscal year's lines from a fundamentals answer: the latest period end any of the four statement lines
 * has, each line at that end only (a line without a figure that year is missing, never an older year's). The year
 * before's equity counts only from a fiscal year 300 to 430 days earlier.
 */
export function annualFigures(res: any): AnnualFigures {
  const lines = ['annualGrossProfit', 'annualTotalRevenue', 'annualNetIncomeCommonStockholders', 'annualCommonStockEquity'];
  const end = lines.flatMap((t) => points(res, t).map((p) => p.end)).sort().at(-1);
  const at = (type: string) => (end ? points(res, type).find((p) => p.end === end) : undefined);
  const before = end ? points(res, 'annualCommonStockEquity').filter((p) => p.end < end).at(-1) : undefined;
  const gap = before && end ? (Date.parse(end) - Date.parse(before.end)) / DAY : NaN;
  const prior = gap >= 300 && gap <= 430 ? before : undefined;
  const shares = [...points(res, 'annualOrdinarySharesNumber'), ...points(res, 'quarterlyOrdinarySharesNumber')].filter((p) => p.value > 0).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
  const revenue = at('annualTotalRevenue');
  const eps = at('annualDilutedEPS');
  return {
    ...(end ? { end } : {}),
    ...((revenue ?? at('annualNetIncomeCommonStockholders'))?.currency ? { currency: (revenue ?? at('annualNetIncomeCommonStockholders'))!.currency } : {}),
    grossProfit: at('annualGrossProfit')?.value ?? NaN,
    revenue: revenue?.value ?? NaN,
    netIncome: at('annualNetIncomeCommonStockholders')?.value ?? NaN,
    equity: at('annualCommonStockEquity')?.value ?? NaN,
    equityBefore: prior?.value ?? NaN,
    ...(prior ? { beforeEnd: prior.end } : {}),
    eps: eps?.value ?? NaN,
    ...(eps?.currency ? { epsCurrency: eps.currency } : {}),
    shares: shares?.value ?? NaN,
    ...(shares ? { sharesAt: shares.end } : {}),
  };
}

export interface DailyFigures {
  /** The price's currency: GBp (pence) for most London lines. */
  currency?: string;
  /** The latest close (or the trade so far today) and its day in London. */
  last: number;
  lastDay: string;
  /** The close of the session before the latest: Price:D-1. */
  prev: number;
  prevDay?: string;
  /** Last year's final close, the base of the year's returns. */
  base: number;
  baseDay?: string;
  priceReturn: number;
  /** With each dividend reinvested at the close of its ex-date. */
  totalReturn: number;
  /** This year's dividends by ex-date, in the price's units. */
  dividends: { day: string; amount: number }[];
}

/**
 * The latest price, the previous session's close and the year's price and total returns from a daily chart with
 * dividends. Days are the exchange's (Yahoo's gmtoffset); a day with two bars keeps the later; a later day the bars
 * leave empty takes the chart's own latest price (meta.regularMarketPrice at regularMarketTime). The total return
 * chains (close + dividends going ex that day) / previous close from last year's final close. Yahoo's own adjusted
 * close is not used: for London lines it moves by a hundredth of each dividend, as if the pence were pounds
 * (British American Tobacco's four dividends of about 1.4% each moved it by 0.06% in all, 30 October 2026).
 */
export function dailyFigures(chart: any, now: number): DailyFigures | null {
  const r = chart?.chart?.result?.[0];
  const ts: unknown[] = Array.isArray(r?.timestamp) ? r.timestamp : [];
  const close: unknown[] = Array.isArray(r?.indicators?.quote?.[0]?.close) ? r.indicators.quote[0].close : [];
  const offset = Number.isFinite(r?.meta?.gmtoffset) ? Number(r.meta.gmtoffset) : 0;
  const dayOf = (t: number) => new Date((t + offset) * 1000).toISOString().slice(0, 10);
  const byDay = new Map<string, number>();
  ts.forEach((t, i) => {
    const c = close[i];
    if (typeof t === 'number' && typeof c === 'number' && Number.isFinite(c) && c > 0) byDay.set(dayOf(t), c);
  });
  // Overnight Yahoo leaves the latest session's bar without a close while the chart's own latest price has it
  // (United Utilities, 31 October 2026 00:28 UTC: the bar of the 30th empty, 1,534p in the chart's price). That price
  // fills its day when no bar has one, so the latest close and the one before stay where they belong.
  const latest = Number(r?.meta?.regularMarketPrice);
  const latestAt = Number(r?.meta?.regularMarketTime);
  if (latest > 0 && Number.isFinite(latestAt)) {
    const day = dayOf(latestAt);
    const lastBar = [...byDay.keys()].sort().at(-1);
    if (!byDay.has(day) && (!lastBar || day > lastBar)) byDay.set(day, latest);
  }
  const bars = [...byDay].sort((a, b) => a[0].localeCompare(b[0]));
  if (!bars.length) return null;
  const year = dayOf(Math.floor(now / 1000)).slice(0, 4);
  const divs = Object.values<any>(r?.events?.dividends ?? {})
    .filter((d) => typeof d?.date === 'number' && typeof d?.amount === 'number' && Number.isFinite(d.amount) && d.amount > 0)
    .map((d) => ({ day: dayOf(d.date), amount: d.amount as number }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const b = bars.findLastIndex(([day]) => day < `${year}-01-01`);
  const [lastDay, last] = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : undefined;
  let growth = NaN;
  if (b >= 0) {
    growth = 1;
    for (let i = b + 1; i < bars.length; i++) {
      const paid = divs.filter((d) => d.day > bars[i - 1][0] && d.day <= bars[i][0]).reduce((a, d) => a + d.amount, 0);
      growth *= (bars[i][1] + paid) / bars[i - 1][1];
    }
  }
  return {
    ...(typeof r?.meta?.currency === 'string' ? { currency: r.meta.currency } : {}),
    last,
    lastDay,
    prev: prev?.[1] ?? NaN,
    ...(prev ? { prevDay: prev[0] } : {}),
    base: b >= 0 ? bars[b][1] : NaN,
    ...(b >= 0 ? { baseDay: bars[b][0] } : {}),
    priceReturn: b >= 0 ? (last / bars[b][1] - 1) * 100 : NaN,
    totalReturn: (growth - 1) * 100,
    dividends: b >= 0 ? divs.filter((d) => d.day > bars[b][0] && d.day <= lastDay) : [],
  };
}

/**
 * An amount in another currency: pence and pounds by 100, others through each currency's dollar value (`usd`, the
 * engine's real rates in the desktop app; NaN without one, so no figure is made up).
 */
export function convertMoney(amount: number, from: string | undefined, to: string | undefined, usd: (ccy: string) => number): number {
  if (!from || !to) return NaN;
  if (from === to) return amount;
  if (from === 'GBp') return convertMoney(amount / 100, 'GBP', to, usd);
  if (to === 'GBp') return convertMoney(amount, from, 'GBP', usd) * 100;
  return (amount * usd(from)) / usd(to);
}

export interface MemberFigures {
  /** Null: Yahoo has no statements for the symbol. */
  annual?: AnnualFigures | null;
  annualAt?: number;
  /** Null: Yahoo has no chart for the symbol. */
  daily?: DailyFigures | null;
  dailyAt?: number;
  /** The last request's failure, when it failed. */
  error?: string;
  failedAt?: number;
}

export const ftseFigures = createStore<{ v: number; by: Record<string, MemberFigures>; problem?: string }>({ v: 0, by: {} });

const STATEMENTS_TTL = 12 * 3_600_000;
const PRICES_TTL = 30 * 60_000;
/** A member whose request failed is asked again after this long. */
const RETRY_MS = 2 * 60_000;

let pendingBump = false;
function bump(patch: (s: ReturnType<typeof ftseFigures.get>) => Partial<ReturnType<typeof ftseFigures.get>>) {
  ftseFigures.set((s) => ({ ...s, ...patch(s) }));
  if (pendingBump) return;
  pendingBump = true;
  setTimeout(() => {
    pendingBump = false;
    ftseFigures.set((s) => ({ ...s, v: s.v + 1 }));
  }, 400);
}

const setMember = (symbol: string, patch: Partial<MemberFigures>) => bump((s) => ({ by: { ...s.by, [symbol]: { ...s.by[symbol], ...patch } } }));

let running = false;

/** Asks for the members' figures that are missing or old, three members at a time. */
export async function loadFtseFigures(members: readonly FtseMember[]): Promise<void> {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const due = members.filter((m) => {
      const f = ftseFigures.get().by[m.yahoo];
      if (f?.failedAt && now - f.failedAt < RETRY_MS) return false;
      return !f || f.annual === undefined || now - (f.annualAt ?? 0) > STATEMENTS_TTL || f.daily === undefined || now - (f.dailyAt ?? 0) > PRICES_TTL;
    });
    let next = 0;
    let off = false;
    const worker = async () => {
      while (next < due.length && !off) {
        const m = due[next++];
        const f = ftseFigures.get().by[m.yahoo];
        try {
          if (!f || f.annual === undefined || Date.now() - (f.annualAt ?? 0) > STATEMENTS_TTL) {
            const res = await yahooGet(statementsPath(m.yahoo, Date.now()));
            setMember(m.yahoo, { annual: res ? annualFigures(res) : null, annualAt: Date.now() });
          }
          if (!f || f.daily === undefined || Date.now() - (f.dailyAt ?? 0) > PRICES_TTL) {
            const res = await yahooGet(dailyPath(m.yahoo, Date.now()));
            setMember(m.yahoo, { daily: res ? dailyFigures(res, Date.now()) : null, dailyAt: Date.now(), error: undefined, failedAt: undefined });
          }
        } catch (err) {
          if (err instanceof YahooDisabled) {
            off = true;
            bump(() => ({ problem: 'Yahoo Finance is switched off (YAHOO_PRICES_ENABLED): no figures for the members.' }));
          } else setMember(m.yahoo, { error: `Yahoo Finance did not answer: ${String((err as Error)?.message ?? err)}`, failedAt: Date.now() });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (!off && ftseFigures.get().problem) bump(() => ({ problem: undefined }));
  } finally {
    running = false;
  }
}

/**
 * The FTSE 100's members and their figures while `on` (a screen shows the universe): the list first, then each
 * member's statements and prices; checked again every minute, so a failed list or member is asked for again and
 * prices older than half an hour are refreshed.
 */
export function useFtse100(on: boolean): { list?: FtseList; by: Record<string, MemberFigures>; problem?: string } {
  ftse100.use((s) => s.v);
  ftseFigures.use((s) => s.v);
  useEffect(() => {
    if (!on || !membersAvailable()) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return;
      await loadFtseList();
      const members = ftse100.get().list?.members;
      if (!stopped && members?.length) await loadFtseFigures(members);
    };
    void tick();
    const timer = setInterval(() => void tick(), 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [on]);
  const figures = ftseFigures.get();
  return { list: ftse100.get().list, by: figures.by, problem: figures.problem };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
