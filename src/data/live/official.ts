import type { OfficialSource } from './lookup';

/**
 * Official statistics for the desktop app: central banks and finance
 * ministries publish rates and yields as CSV or JSON. The main process fetches
 * them from fixed URLs (electron/main.cjs); the parsers here read each format.
 */

export type Obs = [string, number][];

export function officialAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.official === 'function';
}

/** Text of one official source, or '' when it does not answer. */
export async function official(source: OfficialSource, since: string): Promise<string> {
  try {
    const res = await window.arminDesktop!.official(source, since);
    return res.status === 200 ? res.text : '';
  } catch {
    return '';
  }
}

const MON: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function lines(text: string): string[] {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/);
}

/** A number cell, or NaN for blanks and placeholders such as "-" or ".". */
function num(cell: string | undefined): number {
  const c = (cell ?? '').replace(/"/g, '').trim();
  return c === '' || !/^-?\d*\.?\d+$/.test(c) ? NaN : Number(c);
}

function push(out: Map<string, Obs>, key: string, d: string, v: number) {
  if (!Number.isFinite(v)) return;
  const list = out.get(key) ?? [];
  list.push([d, v]);
  out.set(key, list);
}

/** Bank of England database CSV: "DATE,IUDSNPY,IUDMNPY" then "08 Oct 2026,4.8917,5.3341", one series per column. */
export function parseBoeColumns(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  const all = lines(text);
  const head = (all[0] ?? '').split(',').map((h) => h.trim());
  if (head[0] !== 'DATE') return out;
  for (const line of all.slice(1)) {
    const cells = line.split(',');
    const m = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(cells[0]?.trim() ?? '');
    if (!m || !MON[m[2]]) continue;
    const d = `${m[3]}-${MON[m[2]]}-${m[1]}`;
    head.forEach((code, i) => i > 0 && push(out, code, d, num(cells[i])));
  }
  return out;
}

/** RBA statistical table CSV: title rows, a "Series ID" row naming each column, then "07-Oct-2026,4.940,...". */
export function parseRbaTable(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  let ids: string[] | null = null;
  for (const line of lines(text)) {
    const cells = line.split(',');
    if (!ids) {
      if (cells[0] === 'Series ID') ids = cells.map((c) => c.trim());
      continue;
    }
    const m = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/.exec(cells[0]?.trim() ?? '');
    if (!m || !MON[m[2]]) continue;
    const d = `${m[3]}-${MON[m[2]]}-${m[1]}`;
    ids.forEach((id, i) => i > 0 && id && push(out, id, d, num(cells[i])));
  }
  return out;
}

/** SNB data portal cube CSV: "Date";"D0";"Value" rows such as "2026-10-02";"LZ";"0". */
export function parseSnbCube(text: string, item: string): Obs {
  const out: Obs = [];
  for (const line of lines(text)) {
    const cells = line.split(';').map((c) => c.replace(/"/g, '').trim());
    if (cells.length < 3 || cells[1] !== item || !ISO.test(cells[0])) continue;
    const v = num(cells[2]);
    if (Number.isFinite(v)) out.push([cells[0], v]);
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Banco Central do Brasil SGS series JSON: [{data: "dd/mm/yyyy", valor: "13.75"}]. Dates after `today` (targets already set ahead) are left out. */
export function parseSgs(text: string, today: string): Obs {
  let rows: any;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: Obs = [];
  for (const r of rows) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.data ?? ''));
    const v = num(String(r?.valor ?? ''));
    if (!m || !Number.isFinite(v)) continue;
    const d = `${m[3]}-${m[2]}-${m[1]}`;
    if (d <= today) out.push([d, v]);
  }
  return out;
}

/** Bank of Canada Valet observations for one series or a group: {observations: [{d, SERIES: {v}}]}. */
export function parseValetGroup(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return out;
  }
  for (const o of (json?.observations ?? []) as any[]) {
    const d = String(o?.d ?? '');
    if (!ISO.test(d)) continue;
    for (const [k, x] of Object.entries(o)) if (k !== 'd') push(out, k, d, num(String((x as any)?.v ?? '')));
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Bundesbank time series download (CSV): a header row naming each series and
 * its _FLAGS column, a few description rows, then "2026-10-09,3.08,,3.21,,...".
 * "." marks a day without a value. Keyed by series id.
 */
export function parseBubaCsv(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  const all = lines(text);
  const head = (all[0] ?? '').split(',').map((h) => h.replace(/"/g, '').trim());
  const cols = head.map((h, i) => (i > 0 && h && !h.endsWith('_FLAGS') ? h : ''));
  for (const line of all.slice(1)) {
    const cells = line.split(',');
    const d = cells[0]?.trim() ?? '';
    if (!ISO.test(d)) continue;
    cols.forEach((id, i) => id && push(out, id, d, num(cells[i])));
  }
  return out;
}

/** Japan Ministry of Finance JGB yields CSV: "Date,1Y,2Y,..." then "2026/10/1,1.668,1.939,...". Keyed by tenor ("10Y"). */
export function parseMofCsv(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  let head: string[] | null = null;
  for (const line of lines(text)) {
    const cells = line.split(',');
    if (!head) {
      if (cells[0] === 'Date') head = cells.map((c) => c.trim());
      continue;
    }
    const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(cells[0]?.trim() ?? '');
    if (!m) continue;
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    head.forEach((t, i) => i > 0 && push(out, t, d, num(cells[i])));
  }
  return out;
}
