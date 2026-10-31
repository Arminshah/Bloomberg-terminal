// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import type { SecurityDef } from '../types';
import { filingLinks, loadFiler, loadFilingIndex, loadFilingXbrl, resolveFiler, secTicker, type Filing, type SecResult } from './sec';

/**
 * Executive pay as a company's proxy statement (DEF 14A) reports it, from the pay-versus-performance table that SEC
 * rules (Item 402(v) of Regulation S-K) require in XBRL since 2023: for each of the last years, the chief
 * executive's total compensation as the Summary Compensation Table gives it (salary, bonus, stock and option awards at
 * their grant-date value, incentive pay and other compensation), the compensation "actually paid" (equity awards
 * valued at year end), and the same two figures averaged over the other named executives. SEC company facts do not
 * include proxy statements, so the filing's own XBRL instance is read.
 */

export interface PeoPay {
  name: string;
  total: number;
  paid: number;
}

export interface PayYear {
  /** The fiscal year's end, YYYY-MM-DD. */
  end: string;
  /** The chief executive (principal executive officer, PEO); NaN where the table gives none. */
  peoTotal: number;
  peoPaid: number;
  /** Several chief executives in one year, each with their own figures. */
  peos: PeoPay[];
  /** The other named executive officers, on average. */
  neoAvgTotal: number;
  neoAvgPaid: number;
}

const CONCEPTS = ['PeoTotalCompAmt', 'PeoActuallyPaidCompAmt', 'NonPeoNeoAvgTotalCompAmt', 'NonPeoNeoAvgCompActuallyPaidAmt', 'PeoName'] as const;
type Concept = (typeof CONCEPTS)[number];

const decode = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

interface Context {
  end: string;
  /** The ecd:IndividualAxis member, for one of several executives; none for the year's figure. */
  individual?: string;
  /** Another dimension (an adjustment, a measure): not a table figure. */
  other: boolean;
}

/** The pay-versus-performance figures in an XBRL instance, by fiscal year, newest first. */
export function parsePayVsPerformance(xml: string): PayYear[] {
  const contexts = new Map<string, Context>();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const body = m[2];
    const end = /<(?:[\w-]+:)?endDate>\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1] ?? /<(?:[\w-]+:)?instant>\s*(\d{4}-\d{2}-\d{2})/.exec(body)?.[1];
    if (!end) continue;
    const members = [...body.matchAll(/<(?:[\w-]+:)?explicitMember\b[^>]*dimension="([^"]+)"[^>]*>\s*([^<\s]+)\s*</g)];
    const individual = members.find((x) => /(^|:)IndividualAxis$/.test(x[1]))?.[2];
    contexts.set(m[1], { end, ...(individual ? { individual } : {}), other: members.some((x) => !/(^|:)IndividualAxis$/.test(x[1])) });
  }
  const years = new Map<string, PayYear>();
  const names = new Map<string, string>();
  const byPerson = new Map<string, { end: string; total: number; paid: number }>();
  const year = (end: string) => {
    let y = years.get(end);
    if (!y) years.set(end, (y = { end, peoTotal: NaN, peoPaid: NaN, peos: [], neoAvgTotal: NaN, neoAvgPaid: NaN }));
    return y;
  };
  for (const m of xml.matchAll(/<ecd:(\w+)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ecd:\1>)/g)) {
    const concept = m[1] as Concept;
    if (!CONCEPTS.includes(concept)) continue;
    const ctx = contexts.get(/\bcontextRef="([^"]+)"/.exec(m[2])?.[1] ?? '');
    if (!ctx || ctx.other) continue;
    const raw = decode(m[3] ?? '');
    if (concept === 'PeoName') {
      if (raw) names.set(ctx.individual ?? `year:${ctx.end}`, raw);
      continue;
    }
    const neg = /\bsign="-"/.test(m[2]);
    const v = Number(raw.replace(/,/g, '')) * (neg ? -1 : 1);
    if (!Number.isFinite(v)) continue;
    if (ctx.individual && concept.startsWith('Peo')) {
      const key = `${ctx.individual}|${ctx.end}`;
      const p = byPerson.get(key) ?? { end: ctx.end, total: NaN, paid: NaN };
      if (concept === 'PeoTotalCompAmt') p.total = v;
      else p.paid = v;
      byPerson.set(key, p);
      continue;
    }
    const y = year(ctx.end);
    if (concept === 'PeoTotalCompAmt') y.peoTotal = v;
    else if (concept === 'PeoActuallyPaidCompAmt') y.peoPaid = v;
    else if (concept === 'NonPeoNeoAvgTotalCompAmt') y.neoAvgTotal = v;
    else if (concept === 'NonPeoNeoAvgCompActuallyPaidAmt') y.neoAvgPaid = v;
  }
  for (const [key, p] of byPerson) {
    const member = key.split('|')[0];
    // A member's name in the table, else the member as the filer named it (JaneDoeMember → Jane Doe).
    const name = names.get(member) ?? member.replace(/^[\w-]+:/, '').replace(/Member$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    year(p.end).peos.push({ name, total: p.total, paid: p.paid });
  }
  for (const y of years.values()) {
    const named = names.get(`year:${y.end}`);
    if (named && !y.peos.length && (Number.isFinite(y.peoTotal) || Number.isFinite(y.peoPaid))) y.peos.push({ name: named, total: y.peoTotal, paid: y.peoPaid });
  }
  return [...years.values()].filter((y) => [y.peoTotal, y.peoPaid, y.neoAvgTotal, y.neoAvgPaid].some(Number.isFinite) || y.peos.length).sort((a, b) => b.end.localeCompare(a.end));
}

/** A named executive officer in the Summary Compensation Table: salary and total compensation by fiscal year. */
export interface Executive {
  name: string;
  title: string;
  /** Newest first. */
  years: { year: number; salary: number; total: number }[];
}

export interface ProxyPay {
  company: string;
  cik: number;
  filing: Filing;
  /** The proxy statement on sec.gov. */
  link: string;
  years: PayYear[];
  /** The Summary Compensation Table's executives (desktop app), empty when it could not be read. */
  executives: Executive[];
}

/** The Summary Compensation Table of a proxy statement, read by the main process (electron/proxy-pay.cjs). */
async function loadExecutives(cik: number, f: Filing): Promise<Executive[]> {
  const api = typeof window !== 'undefined' ? window.arminDesktop : undefined;
  if (!api?.secPay || !f.doc) return [];
  try {
    const res = await api.secPay(`${cik}/${f.accession.replace(/-/g, '')}/${f.doc}`);
    return Array.isArray(res.executives) ? res.executives.filter((e) => typeof e?.name === 'string' && Array.isArray(e.years) && e.years.length) : [];
  } catch {
    return [];
  }
}

/** The pay table of a company's latest proxy statement with one (the latest two are tried); null when none has it. */
export async function loadProxyPay(def: SecurityDef): Promise<SecResult<ProxyPay | null>> {
  const ticker = secTicker(def);
  if (!ticker) return { ok: false, reason: 'not-found', message: 'Proxy statements are filed with the SEC by US-listed companies.' };
  const filer = await resolveFiler(ticker);
  if (!filer.ok) return filer;
  const sub = await loadFiler(filer.data.cik);
  if (!sub.ok) return sub;
  const cik = sub.data.cik;
  let problem: SecResult<never> | undefined;
  const proxies = sub.data.filings.filter((x) => /^DEF 14A$/i.test(x.form.trim())).slice(0, 2);
  // Every named executive's pay from the latest proxy statement's own table.
  const executives = proxies[0] ? await loadExecutives(cik, proxies[0]) : [];
  for (const f of proxies) {
    const index = await loadFilingIndex(cik, f.accession);
    if (!index.ok) {
      problem ??= index;
      continue;
    }
    const file = index.data.find((n) => /_htm\.xml$/i.test(n));
    if (!file) continue;
    const xbrl = await loadFilingXbrl(cik, f.accession, file);
    if (!xbrl.ok) {
      problem ??= xbrl;
      continue;
    }
    const years = parsePayVsPerformance(xbrl.data);
    const links = filingLinks(cik, f);
    if (years.length) return { ok: true, data: { company: sub.data.name, cik, filing: f, link: links.doc ?? links.index, years, executives }, at: xbrl.at };
  }
  if (executives.length && proxies[0]) {
    const links = filingLinks(cik, proxies[0]);
    return { ok: true, data: { company: sub.data.name, cik, filing: proxies[0], link: links.doc ?? links.index, years: [], executives }, at: Date.now() };
  }
  return problem ?? { ok: true, data: null, at: Date.now() };
}
