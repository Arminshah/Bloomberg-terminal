/**
 * The Philadelphia Fed's Survey of Professional Forecasters (electron/philfed.cjs): the latest quarter's medians as
 * the Bank's release page tabulates them, each beside the previous survey's. Real GDP growth, the unemployment rate
 * and payroll gains by quarter and year; headline and core CPI and PCE inflation by quarter, fourth quarter over
 * fourth quarter, and over five and ten years; the risk of a negative quarter. The page's own figures are shown, not
 * recomputed: the annual GDP growth of the current year needs the year before's actual level, which only the Bank's
 * tabulation has.
 */
import { useEffect, useState } from 'react';
import type { KeyedAnswer } from './lookup';

/** Each median as the page prints it ("2.50", "64.0"), so its decimals are the Bank's; null where it prints N.A. */
export interface SpfSection { title: string; rows: { label: string; previous: (string | null)[]; current: (string | null)[] }[] }
export interface SpfTable { caption: string; columns: string[]; sections: SpfSection[] }
export interface UsSpf { quarter: number; year: number; title: string; month?: string; tables: SpfTable[] }

const ORD: Record<string, number> = { First: 1, Second: 2, Third: 3, Fourth: 4 };
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/\s+/g, ' ').trim();

/** The newest release the survey's page links ("Third Quarter 2026 Survey of Professional Forecasters / August 2026"). */
export function latestSurvey(indexHtml: string): { quarter: number; year: number; month?: string } | null {
  let best: { quarter: number; year: number; month?: string } | null = null;
  for (const m of indexHtml.matchAll(/href="\/surveys-and-data\/real-time-data-research\/spf-q([1-4])-(20\d\d)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const quarter = Number(m[1]);
    const year = Number(m[2]);
    const month = /\/\s*([A-Z][a-z]+ 20\d\d)\s*$/.exec(text(m[3]))?.[1];
    if (!best || year * 4 + quarter > best.year * 4 + best.quarter) best = { quarter, year, ...(month ? { month } : {}) };
  }
  return best;
}

/** A table's rows as cells of text, the header rows (th) apart from the body's. */
function rows(table: string): { head: string[][]; body: string[][] } {
  const read = (part: string) => [...part.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((r) => [...r[0].matchAll(/<t[hd]\b([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((c) => text(c[2])));
  const thead = /<thead[\s\S]*?<\/thead>/.exec(table)?.[0] ?? '';
  return { head: read(thead), body: read(table.replace(thead, '')) };
}

const value = (s: string) => (/^-?\d+(\.\d+)?$/.test(s) ? s : null);

/** The tables the app shows, found by the title the page gives each just before it. */
const CAPTIONS: { match: RegExp; caption: string; single?: string }[] = [
  { match: /Median Forecasts for Selected Variables in the Current and Previous Surveys\s*$/, caption: 'Median forecasts for selected variables' },
  { match: /Median Short-Run and Long-Run Projections for Inflation[^<]*$/, caption: 'Median short-run and long-run projections for inflation (annualized percentage points)' },
  { match: /Risk of a Negative Quarter \(%\)\s*Survey Means\s*$/, caption: 'Risk of a negative quarter (%), survey means', single: 'Risk of a negative quarter (%)' },
];

/** A quarter's release page as its tables of previous and new medians. */
export function parseUsSpf(html: string, quarter: number, year: number): UsSpf | { error: string } {
  const title = text(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? '');
  const named = /^(First|Second|Third|Fourth) Quarter (20\d\d) Survey of Professional Forecasters/.exec(title);
  if (!named || ORD[named[1]] !== quarter || Number(named[2]) !== year) return { error: 'The Philadelphia Fed changed the survey page.' };
  const tables: SpfTable[] = [];
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const before = text(html.slice(Math.max(0, (m.index ?? 0) - 600), m.index)).replace(/\s+/g, ' ');
    const kind = CAPTIONS.find((c) => c.match.test(before));
    if (!kind) continue;
    const { head, body } = rows(m[0]);
    const sections: SpfSection[] = [];
    let columns: string[];
    let current: SpfSection | undefined;
    if (kind.single) {
      // One variable: the header row is the section's title with Previous and New.
      columns = [kind.single];
      current = { title: (head[0]?.[0] ?? '').replace(/:$/, ''), rows: [] };
      sections.push(current);
    } else {
      columns = (head[0] ?? []).filter((c) => c !== '');
    }
    for (const cells of body) {
      if (cells.length === 1 || (cells.length > 1 && cells.slice(1).every((c) => c === '') && !/\d/.test(cells[0]))) {
        if (!cells[0]) continue;
        current = { title: cells[0].replace(/:$/, ''), rows: [] };
        sections.push(current);
        continue;
      }
      const values = cells.slice(1).map(value);
      if (!current || values.length !== columns.length * 2) return { error: 'The Philadelphia Fed changed the survey tables.' };
      current.rows.push({ label: cells[0], previous: columns.map((_, i) => values[i * 2]), current: columns.map((_, i) => values[i * 2 + 1]) });
    }
    tables.push({ caption: kind.caption, columns, sections: sections.filter((s) => s.rows.length) });
  }
  if (tables.length < 2) return { error: 'The Philadelphia Fed changed the survey tables.' };
  return { quarter, year, title, tables };
}

function problem(res: KeyedAnswer | undefined): string {
  if (!res) return 'The Philadelphia Fed did not answer.';
  if (res.status === 429 || res.throttled) return 'The Philadelphia Fed asked the app to wait.';
  return res.error ?? (res.status ? `The Philadelphia Fed answered HTTP ${res.status}.` : 'The Philadelphia Fed did not answer.');
}

/** The latest survey: the survey's page for the newest release, then that release. */
export async function loadUsSpf(ask: (kind: 'index' | 'survey', quarter?: number, year?: number) => Promise<KeyedAnswer>): Promise<UsSpf | { error: string }> {
  const index = await ask('index').catch(() => undefined);
  if (!index?.text) return { error: problem(index) };
  const latest = latestSurvey(index.text);
  if (!latest) return { error: 'The survey page links no release.' };
  const page = await ask('survey', latest.quarter, latest.year).catch(() => undefined);
  if (!page?.text) return { error: problem(page) };
  const parsed = parseUsSpf(page.text, latest.quarter, latest.year);
  return 'error' in parsed || !latest.month ? parsed : { ...parsed, month: latest.month };
}

let cached: { at: number; answer: UsSpf | { error: string } } | undefined;

export function useUsSpf(on: boolean): { state: 'none' | 'loading' | 'ok' | 'error'; spf?: UsSpf; message?: string } {
  const [answer, setAnswer] = useState(cached?.answer);
  const ask = typeof window !== 'undefined' ? window.arminDesktop?.philfed : undefined;
  useEffect(() => {
    if (!on || !ask || (cached && !('error' in cached.answer) && Date.now() - cached.at < 6 * 3_600_000)) return;
    let stopped = false;
    void loadUsSpf(ask).then((a) => {
      if (!('error' in a)) cached = { at: Date.now(), answer: a };
      if (!stopped) setAnswer(a);
    });
    return () => {
      stopped = true;
    };
  }, [on, ask]);
  if (!ask) return { state: 'none' };
  if (!answer) return { state: 'loading' };
  return 'error' in answer ? { state: 'error', message: answer.error } : { state: 'ok', spf: answer };
}
