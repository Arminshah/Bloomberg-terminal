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

/** A transport result, with receipt and confirmation kept apart from the date a value applies. */
export interface OfficialAnswer {
  status: number;
  text: string;
  sourceLabel?: string;
  missing?: string;
  error?: string;
  at?: number;
  cached?: boolean;
  stale?: boolean;
  url?: string;
  publishedAt?: number;
  effectiveAt?: number;
  attemptedAt: number;
  receivedAt: number;
  /** Absent when this call only returned a cache or failed. Never a publication timestamp. */
  checkedAt?: number;
}

/** Preserve failed requests and source timing instead of turning every failure into an empty dataset. */
export async function officialAnswer(source: OfficialSource, since: string): Promise<OfficialAnswer> {
  const attemptedAt = Date.now();
  try {
    const res = await window.arminDesktop!.official(source, since) as Omit<OfficialAnswer, 'attemptedAt' | 'receivedAt'>;
    const receivedAt = Date.now();
    const fresh = res.status === 200 && !res.stale && !res.cached && !res.error;
    return { ...res, attemptedAt, receivedAt, ...(fresh ? { checkedAt: res.checkedAt ?? res.at ?? receivedAt } : { checkedAt: undefined }) };
  } catch (err) {
    return { status: 0, text: '', attemptedAt, receivedAt: Date.now(), error: err instanceof Error ? err.message : 'The official source could not be reached.' };
  }
}

/** Text compatibility for parsers that do not yet consume request provenance. */
export async function official(source: OfficialSource, since: string): Promise<string> {
  const res = await officialAnswer(source, since);
  return res.status === 200 && !res.stale && !res.error ? res.text : '';
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

/**
 * The Cleveland Fed's monthly inflation nowcasts (charts in FusionCharts' layout, one per target month, its month in
 * "subcaption" as 2026-10): for each measure, the latest nowcast of each month, as [the month's first day, % change
 * on the month]. A past month's figure is its last nowcast before the actual; "Actual ..." series are left out.
 */
export function parseClevelandNowcast(text: string): Map<'CPI' | 'CORECPI' | 'PCE' | 'COREPCE', Obs> {
  const KEYS: Record<string, 'CPI' | 'CORECPI' | 'PCE' | 'COREPCE'> = { 'CPI Inflation': 'CPI', 'Core CPI Inflation': 'CORECPI', 'PCE Inflation': 'PCE', 'Core PCE Inflation': 'COREPCE' };
  const out = new Map<'CPI' | 'CORECPI' | 'PCE' | 'COREPCE', Obs>();
  let charts: unknown;
  try { charts = JSON.parse(text); } catch { return out; }
  for (const c of Array.isArray(charts) ? charts : []) {
    const m = /^(\d{4})-(\d{1,2})$/.exec(String((c as { chart?: { subcaption?: unknown } })?.chart?.subcaption ?? ''));
    const sets = (c as { dataset?: unknown })?.dataset;
    if (!m || !Array.isArray(sets)) continue;
    const month = `${m[1]}-${m[2].padStart(2, '0')}-01`;
    for (const s of sets as { seriesname?: unknown; data?: unknown }[]) {
      const key = KEYS[String(s?.seriesname ?? '')];
      if (!key || !Array.isArray(s.data)) continue;
      const values = (s.data as { value?: unknown }[]).map((d) => num(String(d?.value ?? ''))).filter(Number.isFinite);
      if (values.length) push(out as Map<string, Obs>, key, month, values[values.length - 1]);
    }
  }
  for (const obs of out.values()) obs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

const SPANISH_MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/**
 * Banco de España's yields, by series code: its table CSV (a row of series codes, then "28 OCT 2026",3.150,...,
 * with "_" for no value and Spanish month names) or its BIE API's JSON ([{serie, fechas: [ISO], valores}]).
 */
export function parseBde(text: string): Map<string, Obs> {
  const out = new Map<string, Obs>();
  const body = text.replace(/^\uFEFF/, '').trimStart();
  if (body.startsWith('[')) {
    let rows: unknown;
    try { rows = JSON.parse(body); } catch { return out; }
    for (const r of Array.isArray(rows) ? rows : []) {
      const s = r as { serie?: unknown; fechas?: unknown; valores?: unknown };
      if (typeof s.serie !== 'string' || !Array.isArray(s.fechas) || !Array.isArray(s.valores) || s.fechas.length !== s.valores.length) continue;
      const values = s.valores;
      s.fechas.forEach((d, i) => {
        const v = values[i];
        if (typeof d === 'string' && ISO.test(d.slice(0, 10)) && typeof v === 'number') push(out, s.serie as string, d.slice(0, 10), v);
      });
    }
    return out;
  }
  const rows = lines(body).map((l) => l.split(',').map((c) => c.replace(/"/g, '').trim()));
  const codes = rows[0] ?? [];
  for (const cells of rows.slice(1)) {
    const m = /^(\d{1,2}) ([A-Z]{3}) (\d{4})$/.exec(cells[0] ?? '');
    const month = m ? SPANISH_MONTHS.indexOf(m[2]) : -1;
    if (!m || month < 0) continue;
    const day = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    cells.forEach((c, i) => { if (i > 0 && /^[A-Z]_\w+$/.test(codes[i] ?? '')) push(out, codes[i], day, num(c)); });
  }
  return out;
}

/** The BIS's policy-rate CSV without attributes ("FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE"): one country's daily levels. Weekends and holidays come as NaN. */
export function parseBisCbpol(text: string, area: string): Obs {
  const rows = lines(text);
  const head = rows[0]?.split(',').map((c) => c.trim());
  const at = (name: string) => head?.indexOf(name) ?? -1;
  const [ref, time, value] = [at('REF_AREA'), at('TIME_PERIOD'), at('OBS_VALUE')];
  if (ref < 0 || time < 0 || value < 0) return [];
  const out: Obs = [];
  for (const line of rows.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells[ref] !== area || !ISO.test(cells[time] ?? '')) continue;
    const v = num(cells[value] ?? '');
    if (Number.isFinite(v)) out.push([cells[time], v]);
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

const MONTH_CAPS: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/**
 * ONS time series CSV: metadata rows, then yearly, quarterly and monthly rows such as
 * "2026 Q2","1.4" or "2026 AUG","3.1". Quarterly or monthly rows, as `freq` says;
 * a quarter is dated by its first month, the way FRED dates it.
 */
export function parseOnsCsv(text: string, freq: 'm' | 'q' = 'm'): Obs {
  const out: Obs = [];
  for (const line of lines(text)) {
    const m = /^"(\d{4}) ([A-Z]{3}|Q[1-4])","(-?[\d.]+)"$/.exec(line.trim());
    if (!m) continue;
    if (freq === 'q' && m[2].startsWith('Q')) out.push([`${m[1]}-${String((Number(m[2][1]) - 1) * 3 + 1).padStart(2, '0')}-01`, Number(m[3])]);
    if (freq === 'm' && MONTH_CAPS[m[2]]) out.push([`${m[1]}-${MONTH_CAPS[m[2]]}-01`, Number(m[3])]);
  }
  return out;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Monthly rows of an ONS time series JSON (.../timeseries/<cdid>/<dataset>/data):
 * {months: [{date: "2026 JUN", label: "2026 MAY-JUL", value: "4.9"}]}. Labour Force
 * Survey rates are three-month averages that the ONS dates by the middle month and
 * labels with the whole window (the label's year is the first month's). Such a
 * figure is dated here by the last month it covers, and `labels` names its window
 * ("May-Jul 2026") under that date.
 */
export function parseOnsMonths(text: string): { obs: Obs; labels: Map<string, string> } {
  const obs: Obs = [];
  const labels = new Map<string, string>();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { obs, labels };
  }
  for (const row of (json?.months ?? []) as any[]) {
    const v = num(String(row?.value ?? ''));
    const d = /^(\d{4}) ([A-Z]{3})$/.exec(String(row?.date ?? ''));
    if (!d || !MONTH_CAPS[d[2]] || !Number.isFinite(v)) continue;
    let y = Number(d[1]);
    let mo = Number(MONTH_CAPS[d[2]]);
    const w = /^(\d{4}) ([A-Z]{3})-([A-Z]{3})$/.exec(String(row?.label ?? ''));
    let label = '';
    if (w && MONTH_CAPS[w[2]] && MONTH_CAPS[w[3]]) {
      const a = Number(MONTH_CAPS[w[2]]);
      const b = Number(MONTH_CAPS[w[3]]);
      const y0 = Number(w[1]);
      y = b < a ? y0 + 1 : y0;
      mo = b;
      label = b < a ? `${SHORT_MONTHS[a - 1]} ${y0}-${SHORT_MONTHS[b - 1]} ${y}` : `${SHORT_MONTHS[a - 1]}-${SHORT_MONTHS[b - 1]} ${y}`;
    }
    const date = `${y}-${String(mo).padStart(2, '0')}-01`;
    obs.push([date, v]);
    if (label) labels.set(date, label);
  }
  obs.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0));
  return { obs, labels };
}

/**
 * Eurostat's JSON-stat answer for a query that fixes every dimension but geo
 * and time: {id, size, dimension: {geo, time}, value: {flat index: number}}.
 * Times such as "2026-09" or "2026-Q2" become the first day of the period.
 * Status flags, when asked for, go into `flags` under "geo|date".
 */
export function parseJsonStat(text: string, flags?: Map<string, string>): Map<string, Obs> {
  const out = new Map<string, Obs>();
  let d: any;
  try {
    d = JSON.parse(text);
  } catch {
    return out;
  }
  const ids: string[] = Array.isArray(d?.id) ? d.id : [];
  const size: number[] = Array.isArray(d?.size) ? d.size : [];
  const gi = ids.indexOf('geo');
  const ti = ids.indexOf('time');
  if (gi < 0 || ti < 0 || size.length !== ids.length) return out;
  const stride = size.map((_, i) => size.slice(i + 1).reduce((a, b) => a * b, 1));
  const geos: Record<string, number> = d.dimension?.geo?.category?.index ?? {};
  const times: Record<string, number> = d.dimension?.time?.category?.index ?? {};
  const date = (t: string) => {
    const q = /^(\d{4})-Q([1-4])$/.exec(t);
    if (q) return `${q[1]}-${String((Number(q[2]) - 1) * 3 + 1).padStart(2, '0')}-01`;
    const m = /^(\d{4})-(\d{2})$/.exec(t);
    return m ? `${m[1]}-${m[2]}-01` : '';
  };
  for (const [g, gv] of Object.entries(geos)) {
    const obs: Obs = [];
    for (const [t, tv] of Object.entries(times).sort((a, b) => a[1] - b[1])) {
      const k = String(gv * stride[gi] + tv * stride[ti]);
      const v = d.value?.[k];
      const iso = date(t);
      if (iso && typeof v === 'number' && Number.isFinite(v)) {
        obs.push([iso, v]);
        // Eurostat's status flags: "e" estimated (a flash estimate), "p" provisional.
        const f = d.status?.[k];
        if (flags && typeof f === 'string' && f) flags.set(`${g}|${iso}`, f);
      }
    }
    if (obs.length) out.set(g, obs);
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The euro area's aggregate code the source fills: EA, else the largest EAnn. */
export function euroAreaCode(m: Map<string, Obs>): string | undefined {
  if (m.get('EA')?.length) return 'EA';
  const codes = [...m.keys()].filter((k) => /^EA\d{2}$/.test(k)).sort();
  return codes[codes.length - 1];
}

/**
 * Statistics Canada Web Data Service, getDataFromVectorByReferencePeriodRange: one entry per
 * vector, each point dated by its reference period (the first of the month), in date order.
 * Points StatCan marks as not available (a status code other than 0) are left out.
 */
export function parseStatcanVectors(text: string): Map<number, Obs> {
  const out = new Map<number, Obs>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const entry of parsed as { status?: string; object?: { vectorId?: number; vectorDataPoint?: { refPer?: string; value?: number | null; statusCode?: number }[] } }[]) {
    const o = entry?.object;
    if (entry?.status !== 'SUCCESS' || !o || typeof o.vectorId !== 'number') continue;
    const obs: Obs = [];
    for (const p of o.vectorDataPoint ?? []) {
      if (typeof p.refPer !== 'string' || !ISO.test(p.refPer) || (p.statusCode ?? 0) !== 0) continue;
      const v = Number(p.value);
      if (p.value != null && Number.isFinite(v)) obs.push([p.refPer, v]);
    }
    obs.sort((a, b) => a[0].localeCompare(b[0]));
    out.set(o.vectorId, obs);
  }
  return out;
}

/**
 * The ABS Data API's CSV (format=csv): a header row, then one row per period with TIME_PERIOD
 * (YYYY-MM) and OBS_VALUE, not necessarily in order. Monthly figures dated by the first day.
 */
export function parseAbsCsv(text: string): Obs {
  const rows = lines(text);
  if (!rows.length) return [];
  const head = rows[0].split(',').map((c) => c.trim());
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) return [];
  const out: Obs = [];
  for (const row of rows.slice(1)) {
    const cells = row.split(',');
    const m = /^(\d{4})-(\d{2})$/.exec(cells[ti]?.trim() ?? '');
    const v = num(cells[vi]);
    if (m && Number.isFinite(v)) out.push([`${m[1]}-${m[2]}-01`, v]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
