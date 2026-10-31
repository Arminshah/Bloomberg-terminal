// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useEffect } from 'react';
import { createStore } from '../../core/store';
import type { KeyedAnswer } from './lookup';

/**
 * Bills and laws from Congress.gov's API (desktop app, the owner's key): the latest bills by update with their latest
 * action, the laws of the current Congress, and one bill's sponsor, cosponsors, committees, actions, summaries,
 * subjects and text (BILL).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BillLine {
  congress: number;
  /** HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES. */
  type: string;
  number: string;
  title: string;
  chamber: string;
  introduced: string;
  action: { date: string; text: string };
  updated: string;
  /** "119-134" for a public law. */
  laws: string[];
}

/** The Congress in session on a day: the 119th from 3 January 2025 to 3 January 2027. */
export function congressOn(ms: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const started = y % 2 === 1 && (d.getUTCMonth() > 0 || d.getUTCDate() >= 3) ? y : y % 2 === 1 ? y - 2 : y - 1;
  return (started - 1789) / 2 + 1;
}

const NAMES: Record<string, string> = { HR: 'H.R.', S: 'S.', HJRES: 'H.J.Res.', SJRES: 'S.J.Res.', HCONRES: 'H.Con.Res.', SCONRES: 'S.Con.Res.', HRES: 'H.Res.', SRES: 'S.Res.' };

/** A bill's citation: "H.R. 7831". */
export const billName = (b: Pick<BillLine, 'type' | 'number'>) => `${NAMES[b.type.toUpperCase()] ?? b.type} ${b.number}`;
/** The key the API's paths use: "119/hr/7831". */
export const billKey = (b: Pick<BillLine, 'congress' | 'type' | 'number'>) => `${b.congress}/${b.type.toLowerCase()}/${b.number}`;

/** A bill a command names ("BILL HR 7831", "BILL H.R.7831", "BILL S 12"), or null. */
export function billRef(args: string | undefined): { type: string; number: string } | null {
  const m = /^(HR|S|HJRES|SJRES|HCONRES|SCONRES|HRES|SRES)(\d{1,5})$/.exec((args ?? '').toUpperCase().replace(/[\s.]/g, ''));
  return m ? { type: m[1], number: m[2] } : null;
}

export type Stage = 'Became law' | 'Vetoed' | 'To the President' | 'Passed a chamber' | 'Reported' | 'In committee' | 'Other';
export const STAGES: Stage[] = ['Became law', 'Vetoed', 'To the President', 'Passed a chamber', 'Reported', 'In committee', 'Other'];

/** Where a bill stands, from its latest action's wording. A bill signed by the President is law; one received in the
 *  other chamber, held at its desk or sent back with the other chamber's action has passed a chamber. */
export function stageOf(text: string): Stage {
  if (/Became (Public|Private) Law|Signed by President/i.test(text)) return 'Became law';
  if (/\bVetoed\b|Veto message/i.test(text)) return 'Vetoed';
  if (/Presented to President/i.test(text)) return 'To the President';
  if (/Passed\/agreed to in|Passed (the )?(House|Senate)|agreed to in the (House|Senate)|Resolution agreed to|On passage Passed|cleared for White House|Received in the (House|Senate)|Held at the desk|Message on (Senate|House) action sent/i.test(text)) return 'Passed a chamber';
  if (/\breported\b|Placed on (the )?(Union|House|Senate Legislative) Calendar|\b[HS]\. ?Rpt\.|Star Print/i.test(text)) return 'Reported';
  if (/Referred to|Introduced in|Read twice|Hearings? held|Forwarded by Subcommittee|Mark-?up/i.test(text)) return 'In committee';
  return 'Other';
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function lineOf(b: any): BillLine | null {
  const congress = Number(b?.congress);
  const type = str(b?.type).toUpperCase();
  const number = str(b?.number);
  if (!Number.isInteger(congress) || !NAMES[type] || !/^\d+$/.test(number)) return null;
  return {
    congress,
    type,
    number,
    title: str(b?.title),
    chamber: str(b?.originChamber),
    introduced: str(b?.introducedDate),
    action: { date: str(b?.latestAction?.actionDate), text: str(b?.latestAction?.text) },
    updated: str(b?.updateDate),
    laws: Array.isArray(b?.laws) ? b.laws.map((l: any) => str(l?.number)).filter(Boolean) : [],
  };
}

/** A list answer, of bills or of laws: {bills: [...]} with the total count. Null when it is not one. */
export function parseBillList(text: string): { bills: BillLine[]; count: number } | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(j?.bills)) return null;
  return { bills: j.bills.map(lineOf).filter((b: BillLine | null): b is BillLine => !!b), count: Number(j?.pagination?.count) || j.bills.length };
}

/** HTML from the API (a summary) as paragraphs of plain text. */
export function paragraphs(html: string): string[] {
  const ent: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', sect: '§' };
  return html
    .replace(/<\/(p|li|h\d|div)>|<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ent[e.toLowerCase()] ?? m)))
    .split('\n')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export interface Person {
  name: string;
  party: string;
  state: string;
  bioguide: string;
  since?: string;
}

export interface BillDetail {
  line: BillLine;
  sponsors: Person[];
  cosponsors: number;
  policyArea: string;
  url: string;
}

/** A bill's answer: {bill: {...}}. */
export function parseBill(text: string): BillDetail | null {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const b = j?.bill;
  const line = lineOf(b);
  if (!line) return null;
  return {
    line,
    sponsors: (Array.isArray(b.sponsors) ? b.sponsors : []).map((p: any) => ({ name: str(p?.fullName), party: str(p?.party), state: str(p?.state), bioguide: str(p?.bioguideId) })),
    cosponsors: Number(b?.cosponsors?.count) || 0,
    policyArea: str(b?.policyArea?.name),
    url: str(b?.legislationUrl),
  };
}

export interface BillParts {
  actions: { date: string; text: string; type: string }[];
  summary: { date: string; label: string; paragraphs: string[] } | null;
  subjects: string[];
  committees: { name: string; chamber: string; activity: string }[];
  cosponsors: Person[];
  texts: { type: string; date: string; formats: { type: string; url: string }[] }[];
}

/** The parts of a bill from their answers (each may be missing). */
export function parseParts(answers: Partial<Record<keyof BillParts | 'summaries', string>>): BillParts {
  const json = (t?: string): any => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };
  const a = json(answers.actions)?.actions;
  const s = json(answers.summaries)?.summaries;
  const latest = Array.isArray(s) && s.length ? [...s].sort((x: any, y: any) => str(x?.updateDate).localeCompare(str(y?.updateDate)) || str(x?.actionDate).localeCompare(str(y?.actionDate)))[s.length - 1] : null;
  const c = json(answers.committees)?.committees;
  const cs = json(answers.cosponsors)?.cosponsors;
  const t = json(answers.texts)?.textVersions;
  return {
    actions: (Array.isArray(a) ? a : []).map((x: any) => ({ date: str(x?.actionDate), text: str(x?.text), type: str(x?.type) })).filter((x) => x.date && x.text),
    summary: latest ? { date: str(latest.actionDate), label: str(latest.actionDesc), paragraphs: paragraphs(str(latest.text)) } : null,
    subjects: (json(answers.subjects)?.subjects?.legislativeSubjects ?? []).map((x: any) => str(x?.name)).filter(Boolean),
    committees: (Array.isArray(c) ? c : []).map((x: any) => ({ name: str(x?.name), chamber: str(x?.chamber), activity: (Array.isArray(x?.activities) ? x.activities : []).map((v: any) => str(v?.name)).filter(Boolean).join(', ') })),
    cosponsors: (Array.isArray(cs) ? cs : []).map((p: any) => ({ name: str(p?.fullName), party: str(p?.party), state: str(p?.state), bioguide: str(p?.bioguideId), since: str(p?.sponsorshipDate) })),
    texts: (Array.isArray(t) ? t : []).map((v: any) => ({ type: str(v?.type), date: str(v?.date).slice(0, 10), formats: (Array.isArray(v?.formats) ? v.formats : []).map((f: any) => ({ type: str(f?.type), url: str(f?.url) })).filter((f: { url: string }) => /^https:\/\/www\.congress\.gov\//.test(f.url)) })),
  };
}

type Part<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error'; message: string };

export const legislation = createStore<{
  v: number;
  bills: Record<number, Part<{ bills: BillLine[]; count: number }>>;
  laws: Record<number, Part<{ bills: BillLine[]; count: number }>>;
  bill: Record<string, Part<BillDetail>>;
  parts: Record<string, Part<BillParts>>;
}>({ v: 0, bills: {}, laws: {}, bill: {}, parts: {} });

export function legislationAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.congressGov === 'function';
}

const asked = new Map<string, number>();
const due = (key: string, ms: number) => {
  if (Date.now() - (asked.get(key) ?? 0) < ms) return false;
  asked.set(key, Date.now());
  return true;
};
const bump = (f: (s: ReturnType<typeof legislation.get>) => Partial<ReturnType<typeof legislation.get>>) => legislation.set((s) => ({ ...s, ...f(s), v: s.v + 1 }));

/** Why an answer has no data, in words. */
export function answerProblem(a: Partial<KeyedAnswer> | undefined): string {
  if (!a) return 'Congress.gov did not answer.';
  if (a.missing) return 'BILL needs a Congress.gov API key: enter CONGRESS_GOV_API_KEY on PROVIDERS (free at api.congress.gov/sign-up).';
  if (a.refused) return `The Congress.gov key was not sent: ${a.refused}.`;
  if (a.error) return `Congress.gov did not answer: ${a.error}`;
  return `Congress.gov answered HTTP ${a.status}.`;
}

async function ask(kind: 'bills' | 'laws' | 'bill' | 'part', arg: string): Promise<{ text: string } | { error: string }> {
  try {
    const a = await window.arminDesktop!.congressGov!(kind, arg);
    return a.text && a.status >= 200 && a.status < 300 ? { text: a.text } : { error: answerProblem(a) };
  } catch (err) {
    return { error: answerProblem({ error: String((err as Error)?.message ?? err) }) };
  }
}

async function loadList(which: 'bills' | 'laws', page: number, congress: number) {
  const key = `${which}:${page}:${congress}`;
  if (!due(key, 10 * 60_000)) return;
  bump((s) => (s[which][page]?.state === 'ok' ? {} : { [which]: { ...s[which], [page]: { state: 'loading' } } }));
  const r = await ask(which, which === 'bills' ? String(page * 250) : `${congress}:${page * 250}`);
  const data = 'text' in r ? parseBillList(r.text) : null;
  if (!data) asked.delete(key);
  bump((s) => ({ [which]: { ...s[which], [page]: data ? { state: 'ok', data } : { state: 'error', message: 'error' in r ? r.error : 'Congress.gov answered in a format the app does not recognise.' } } }));
}

async function loadBill(key: string) {
  if (!due(`bill:${key}`, 10 * 60_000)) return;
  bump((s) => ({ bill: { ...s.bill, [key]: { state: 'loading' } }, parts: { ...s.parts, [key]: { state: 'loading' } } }));
  const head = await ask('bill', key);
  const detail = 'text' in head ? parseBill(head.text) : null;
  if (!detail) asked.delete(`bill:${key}`);
  bump((s) => ({ bill: { ...s.bill, [key]: detail ? { state: 'ok', data: detail } : { state: 'error', message: 'error' in head ? head.error : 'Congress.gov answered in a format the app does not recognise.' } } }));
  if (!detail) return;
  const names = ['actions', 'summaries', 'subjects', 'committees', 'cosponsors', 'text'] as const;
  const got = await Promise.all(names.map((p) => ask('part', `${key}/${p}`)));
  const answers: Record<string, string> = {};
  names.forEach((p, i) => {
    const g = got[i];
    if ('text' in g) answers[p === 'text' ? 'texts' : p] = g.text;
  });
  bump((s) => ({ parts: { ...s.parts, [key]: { state: 'ok', data: parseParts(answers) } } }));
}

/** The latest bills (`pages` of 250) and the current Congress's laws, loaded while a screen shows them. */
export function useLegislation(pages: number, congress: number, bill: string) {
  legislation.use((s) => s.v);
  useEffect(() => {
    if (!legislationAvailable()) return;
    for (let p = 0; p < pages; p++) void loadList('bills', p, congress);
  }, [pages, congress]);
  useEffect(() => {
    if (legislationAvailable()) void loadList('laws', 0, congress);
  }, [congress]);
  useEffect(() => {
    if (legislationAvailable() && bill) void loadBill(bill);
  }, [bill]);
  const s = legislation.get();
  const lawsMore = s.laws[0]?.state === 'ok' && s.laws[0].data.count > 250;
  // More than 250 laws: the rest, 250 at a time.
  useEffect(() => {
    if (!lawsMore || !legislationAvailable()) return;
    const count = (legislation.get().laws[0] as { data: { count: number } }).data.count;
    for (let p = 1; p * 250 < count && p < 4; p++) void loadList('laws', p, congress);
  }, [lawsMore, congress]);
  return s;
}
