import { useEffect } from 'react';
import { createStore } from '../../core/store';
import { membersAvailable } from './index-members';
import type { KeyedAnswer } from './lookup';

/**
 * The FTSE 100's members for SCREEN, from Wikipedia's article on the index: the table in its "Constituents" section
 * (company, ticker, ISIN, and the sector in FTSE Russell's Industry Classification Benchmark). The main process asks
 * the MediaWiki API for the article's sections; the app finds the one titled "Constituents" by its title and asks
 * for that section's text (electron/index-members.cjs, each answer kept a day). Wikipedia's text is CC BY-SA; the
 * screen names the article as the list's source.
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

/** The member list while `on` (a screen shows the FTSE 100), asked again every minute after a failure. */
export function useFtseList(on: boolean): FtseList | undefined {
  ftse100.use((s) => s.v);
  useEffect(() => {
    if (!on || !membersAvailable()) return;
    void loadFtseList();
    const timer = setInterval(() => {
      if (ftse100.get().list?.state === 'error') void loadFtseList();
    }, 60_000);
    return () => clearInterval(timer);
  }, [on]);
  return ftse100.get().list;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
