// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * DS, document search: the SEC's full-text search of every filing since 2001 (EDGAR full-text search, desktop app,
 * SEC_USER_AGENT), filtered by company, form and dates, with the forms and companies that match most as facets.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DocHit {
  id: string;
  cik: number;
  company: string;
  tickers: string[];
  form: string;
  description: string;
  /** Filing date, YYYY-MM-DD. */
  filed: string;
  /** Period of the report, when the form has one. */
  period?: string;
  /** cik/accession/file of the document. */
  path: string;
  /** The document's file name (exhibits are documents of their own). */
  file: string;
}

export interface DocResults {
  total: number;
  /** "gte" when there are more than the count says (the index stops counting at 10,000). */
  more: boolean;
  hits: DocHit[];
  forms: { key: string; count: number }[];
  companies: { key: string; count: number }[];
}

const display = (s: string) => s.replace(/\s+\(CIK.*$/, '').replace(/\s+\([^)]*\)\s*$/, '').trim();

export function parseDocSearch(text: string): DocResults | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const hits: any[] | undefined = j?.hits?.hits;
  if (!Array.isArray(hits)) return null;
  const out: DocHit[] = [];
  for (const h of hits) {
    const src = h?._source;
    const [adsh, file] = String(h?._id ?? '').split(':');
    const cik = Number(src?.ciks?.[0]);
    if (!Number.isFinite(cik) || cik <= 0 || !/^\d{10}-\d{2}-\d{6}$/.test(adsh) || !file || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file)) continue;
    const names = String(src?.display_names?.[0] ?? '');
    out.push({
      id: String(h._id),
      cik,
      company: display(names),
      tickers: (/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/.exec(names)?.[1] ?? '').split(',').map((t) => t.trim()).filter(Boolean),
      form: String(src?.form ?? src?.file_type ?? ''),
      description: String(src?.file_description ?? src?.file_type ?? '').trim(),
      filed: String(src?.file_date ?? ''),
      ...(src?.period_ending ? { period: String(src.period_ending) } : {}),
      path: `${cik}/${adsh.replace(/-/g, '')}/${file}`,
      file,
    });
  }
  const buckets = (b: any) => (Array.isArray(b?.buckets) ? b.buckets.map((x: any) => ({ key: String(x?.key ?? ''), count: Number(x?.doc_count) || 0 })).filter((x: { key: string }) => x.key) : []);
  return {
    total: Number(j?.hits?.total?.value) || out.length,
    more: j?.hits?.total?.relation === 'gte',
    hits: out,
    forms: buckets(j?.aggregations?.form_filter),
    companies: buckets(j?.aggregations?.entity_filter).map((x: { key: string; count: number }) => ({ ...x, key: x.key })),
  };
}

export interface DocQuery {
  words: string;
  forms: string[];
  ciks: number[];
  from?: string;
  to?: string;
  page: number;
}

/** The query string the main process accepts (see electron/supply-chain.cjs searchUrl). */
export function docQueryString(q: DocQuery): string {
  const p = new URLSearchParams();
  p.set('q', q.words.trim());
  if (q.forms.length) p.set('forms', q.forms.join(','));
  if (q.ciks.length) p.set('ciks', q.ciks.map((c) => String(c).padStart(10, '0')).join(','));
  if (q.from && q.to) {
    p.set('startdt', q.from);
    p.set('enddt', q.to);
  }
  if (q.page > 0) p.set('from', String(q.page * 100));
  return p.toString();
}

/**
 * The terms to look for in a document to show where it matches: quoted phrases as they are, else the words of four
 * letters or more, in capitals so the main process matches them in any case.
 */
export function highlightTerms(words: string): string[] {
  const phrases = [...words.matchAll(/"([^"]{2,59})"/g)].map((m) => m[1].trim());
  const rest = words.replace(/"[^"]*"/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !/^(AND|OR|NOT)$/.test(w));
  return [...new Set([...phrases, ...rest].map((t) => t.replace(/[^A-Za-z0-9 .,&'()-]/g, '').trim().toUpperCase()).filter((t) => /^[A-Z0-9][A-Z0-9 .,&'()-]{1,58}$/.test(t)))].slice(0, 8);
}

export const docUrl = (path: string) => `https://www.sec.gov/Archives/edgar/data/${path}`;
/* eslint-enable @typescript-eslint/no-explicit-any */
