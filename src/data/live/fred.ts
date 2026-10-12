import { createStore } from '../../core/store';
import { setFeed } from './status';
import { euroAreaCode, official, parseJsonStat, parseOnsCsv, parseOnsMonths } from './official';

/**
 * US economic releases and international statistics for the desktop app from
 * the FRED API (Federal Reserve Bank of St. Louis), which needs the user's own
 * free key: the scheduled release dates of each release, and the published
 * values of each series. FRED republishes the agencies' figures (BLS, BEA,
 * Census, the Fed, the OECD) and gives release dates without times of day.
 * Consensus forecasts are not public, so there is no survey.
 */

export type Obs = [string, number][];

export interface FredState {
  /** Series id -> observations in date order. */
  series: Record<string, Obs>;
  /** Release id -> scheduled release dates (ISO), in order. */
  releases: Record<number, string[]>;
  loaded: boolean;
  /** True when the FRED API key is not configured, so nothing from FRED loads. */
  needsKey: boolean;
}

export const fredData = createStore<FredState>({ series: {}, releases: {}, loaded: false, needsKey: false });

export type Calc = 'level' | 'diff' | 'mom' | 'yoy';
export type Freq = 'm' | 'q' | 'w';

export interface FredEvent {
  rid: number;
  name: string;
  series: string;
  calc: Calc;
  freq: Freq;
  /** Earliest the source publishes a period: days after the period ends (see expectedPeriod). */
  minDelay: number;
  unit: string;
  dec: number;
  /** Multiplier from the series' units to the shown ones (claims in people to thousands, say). */
  scale?: number;
  rel: number;
  kind: 'activity' | 'inflation' | 'rate' | 'other';
  /** For a release with two reports a month: true for the one late in the month, false for the one early in the month. */
  early?: boolean;
}

/** The US releases shown in ECO, by FRED release id. */
export const US_EVENTS: FredEvent[] = [
  { rid: 50, name: 'Change in Nonfarm Payrolls', series: 'PAYEMS', calc: 'diff', freq: 'm', minDelay: 1, unit: 'k', dec: 0, rel: 3, kind: 'activity' },
  { rid: 50, name: 'Unemployment Rate', series: 'UNRATE', calc: 'level', freq: 'm', minDelay: 1, unit: '%', dec: 1, rel: 3, kind: 'other' },
  { rid: 10, name: 'CPI MoM', series: 'CPIAUCSL', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI YoY', series: 'CPIAUCNS', calc: 'yoy', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI Ex Food and Energy MoM', series: 'CPILFESL', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI Ex Food and Energy YoY', series: 'CPILFENS', calc: 'yoy', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 46, name: 'PPI Final Demand MoM', series: 'PPIFIS', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 2, kind: 'inflation' },
  { rid: 9, name: 'Retail Sales Advance MoM', series: 'RSAFS', calc: 'mom', freq: 'm', minDelay: 10, unit: '%', dec: 1, rel: 3, kind: 'activity' },
  { rid: 13, name: 'Industrial Production MoM', series: 'INDPRO', calc: 'mom', freq: 'm', minDelay: 10, unit: '%', dec: 1, rel: 2, kind: 'activity' },
  { rid: 27, name: 'Housing Starts', series: 'HOUST', calc: 'level', freq: 'm', minDelay: 12, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 97, name: 'New Home Sales', series: 'HSN1F', calc: 'level', freq: 'm', minDelay: 18, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 95, name: 'Durable Goods Orders MoM', series: 'DGORDER', calc: 'mom', freq: 'm', minDelay: 20, unit: '%', dec: 1, rel: 2, kind: 'activity', early: true },
  { rid: 95, name: 'Factory Orders MoM', series: 'AMTMNO', calc: 'mom', freq: 'm', minDelay: 28, unit: '%', dec: 1, rel: 1, kind: 'activity', early: false },
  { rid: 53, name: 'GDP Annualized QoQ', series: 'A191RL1Q225SBEA', calc: 'level', freq: 'q', minDelay: 20, unit: '%', dec: 1, rel: 3, kind: 'activity' },
  // BEA computes these from unrounded data; two decimals keep the figure from the rounded index consistent with it.
  { rid: 54, name: 'PCE Core Deflator MoM', series: 'PCEPILFE', calc: 'mom', freq: 'm', minDelay: 20, unit: '%', dec: 2, rel: 3, kind: 'inflation' },
  { rid: 54, name: 'PCE Core Deflator YoY', series: 'PCEPILFE', calc: 'yoy', freq: 'm', minDelay: 20, unit: '%', dec: 2, rel: 3, kind: 'inflation' },
  { rid: 54, name: 'PCE Deflator YoY', series: 'PCEPI', calc: 'yoy', freq: 'm', minDelay: 20, unit: '%', dec: 2, rel: 2, kind: 'inflation' },
  { rid: 180, name: 'Initial Jobless Claims', series: 'ICSA', calc: 'level', freq: 'w', minDelay: 4, unit: 'k', dec: 0, scale: 0.001, rel: 2, kind: 'other' },
  { rid: 192, name: 'JOLTS Job Openings', series: 'JTSJOL', calc: 'level', freq: 'm', minDelay: 28, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 51, name: 'Trade Balance', series: 'BOPGSTB', calc: 'level', freq: 'm', minDelay: 28, unit: 'bn', dec: 1, scale: 0.001, rel: 2, kind: 'other' },
];

/**
 * Country statistics for ECST: [series, frequency, calculation], the calculation defaulting to the
 * year-on-year change for GDP and prices. Wherever a statistics office publishes the headline rate
 * itself, that published rate is used: BEA's real GDP growth on a year earlier, Eurostat's HICP
 * annual rate, GDP growth and unemployment, and the ONS's CPI, GDP growth and unemployment.
 * Japan, Canada and Australia have no such series here: their GDP growth is worked out from OECD
 * real GDP levels and their unemployment is the OECD harmonised rate.
 */
export const COUNTRY_STATS: Record<string, { gdp?: [string, Freq, Calc?]; cpi?: [string, Freq, Calc?]; un?: [string, Freq] }> = {
  US: { gdp: ['A191RO1Q156NBEA', 'q', 'level'], cpi: ['CPIAUCNS', 'm'], un: ['UNRATE', 'm'] },
  EZ: { gdp: ['ESTAT:GDP:EA', 'q', 'level'], cpi: ['ESTAT:HICP:EA', 'm', 'level'], un: ['ESTAT:UN:EA', 'm'] },
  DE: { gdp: ['ESTAT:GDP:DE', 'q', 'level'], cpi: ['ESTAT:HICP:DE', 'm', 'level'], un: ['ESTAT:UN:DE', 'm'] },
  FR: { gdp: ['ESTAT:GDP:FR', 'q', 'level'], cpi: ['ESTAT:HICP:FR', 'm', 'level'], un: ['ESTAT:UN:FR', 'm'] },
  IT: { gdp: ['ESTAT:GDP:IT', 'q', 'level'], cpi: ['ESTAT:HICP:IT', 'm', 'level'], un: ['ESTAT:UN:IT', 'm'] },
  ES: { gdp: ['ESTAT:GDP:ES', 'q', 'level'], cpi: ['ESTAT:HICP:ES', 'm', 'level'], un: ['ESTAT:UN:ES', 'm'] },
  NL: { gdp: ['ESTAT:GDP:NL', 'q', 'level'], cpi: ['ESTAT:HICP:NL', 'm', 'level'], un: ['ESTAT:UN:NL', 'm'] },
  GB: { gdp: ['ONS:IHYR', 'q', 'level'], cpi: ['ONS:D7G7', 'm', 'level'], un: ['ONS:MGSX', 'm'] },
  JP: { gdp: ['JPNRGDPEXP', 'q'], un: ['LRHUTTTTJPM156S', 'm'] },
  CA: { gdp: ['NGDPRSAXDCCAQ', 'q'], un: ['LRHUTTTTCAM156S', 'm'] },
  AU: { gdp: ['NGDPRSAXDCAUQ', 'q'], un: ['LRHUTTTTAUM156S', 'm'] },
};

/** Countries whose growth figure is worked out here rather than published as a rate. */
export const COMPUTED_GROWTH = new Set(['JP', 'CA', 'AU']);

// ------------------------------------------------------------------ parsing

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * fred/series/observations JSON: {observations: [{date: "2026-08-01", value: "334.131"}]}.
 * Values are strings; "." marks a period without a value and is left out.
 */
export function parseFredObservations(text: string): Obs {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out: Obs = [];
  for (const o of (json?.observations ?? []) as any[]) {
    const d = String(o?.date ?? '');
    const c = String(o?.value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^-?\d*\.?\d+$/.test(c)) continue;
    out.push([d, Number(c)]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** fred/release/dates JSON: {release_dates: [{release_id: 10, date: "2026-10-14"}]}. The release's dates, in order. */
export function parseFredReleaseDates(text: string, rid: number): string[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const r of (json?.release_dates ?? []) as any[]) {
    const d = String(r?.date ?? '');
    if (Number(r?.release_id) === rid && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d);
  }
  return [...out].sort();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------- calculations

const iso = (y: number, m0: number, d = 1) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

/**
 * The period a release publishes: the latest one that has ended at least
 * `minDelay` days before the release (for weekly claims, the latest week
 * ending on a Saturday at least four days before). Delays do not shift it:
 * a late report still covers the period the agency was due to publish.
 */
export function expectedPeriod(ev: Pick<FredEvent, 'freq' | 'minDelay'>, release: number): string {
  const day = Math.floor(release / 86_400_000) * 86_400_000;
  if (ev.freq === 'w') {
    let t = day - ev.minDelay * 86_400_000;
    while (new Date(t).getUTCDay() !== 6) t -= 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  const step = ev.freq === 'q' ? 3 : 1;
  const d = new Date(day);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() - (d.getUTCMonth() % step);
  for (let k = 0; k < 24; k++) {
    const end = Date.UTC(y, m + step, 0);
    if (end + ev.minDelay * 86_400_000 <= day) return iso(y, m);
    m -= step;
    if (m < 0) {
      m += 12;
      y--;
    }
  }
  return iso(y, m);
}

/** The period before `p` (a month, quarter or week earlier). */
export function previousPeriod(p: string, freq: Freq, steps = 1): string {
  const [y, m, d] = p.split('-').map(Number);
  if (freq === 'w') return new Date(Date.UTC(y, m - 1, d) - 7 * steps * 86_400_000).toISOString().slice(0, 10);
  return iso(y, m - 1 - (freq === 'q' ? 3 : 1) * steps);
}

/** A series value transformed for display at period `p`, or null when the source has not published it. */
export function valueAt(obs: Obs | undefined, p: string, calc: Calc, freq: Freq, scale = 1): number | null {
  if (!obs?.length) return null;
  const at = (q: string) => obs.find(([d]) => d === q)?.[1];
  const v = at(p);
  if (v == null) return null;
  switch (calc) {
    case 'level':
      return v * scale;
    case 'diff': {
      const prev = at(previousPeriod(p, freq));
      return prev == null ? null : (v - prev) * scale;
    }
    case 'mom': {
      const prev = at(previousPeriod(p, freq));
      return prev == null || prev === 0 ? null : (v / prev - 1) * 100;
    }
    case 'yoy': {
      const prev = at(previousPeriod(p, freq, freq === 'q' ? 4 : freq === 'w' ? 52 : 12));
      return prev == null || prev === 0 ? null : (v / prev - 1) * 100;
    }
  }
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026", "2Q 2026" or "Wk 10/03". */
export function periodLabel(p: string, freq: Freq): string {
  const [y, m, d] = p.split('-').map(Number);
  if (freq === 'q') return `${Math.floor((m - 1) / 3) + 1}Q ${y}`;
  if (freq === 'w') return `Wk ${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
  return `${SHORT[m - 1]} ${y}`;
}

/**
 * Releases of one event: which of a release id's dates belong to it. The Census
 * M3 survey has two reports a month under one release: the advance report on
 * durable goods late in the month and the full report early in the next, so
 * the day of the month tells them apart.
 */
export function eventDates(ev: FredEvent, dates: string[]): string[] {
  if (ev.early == null) return dates;
  return dates.filter((d) => Number(d.slice(8, 10)) >= 15 === ev.early);
}

// ------------------------------------------------------------------ loading

export function fredAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.fred === 'function';
}

/** The answer to one FRED request, '' when it fails, or null when no API key is configured. */
async function get(kind: 'release-dates' | 'observations', arg: string, from?: string): Promise<string | null> {
  try {
    const res = await window.arminDesktop!.fred!(kind, arg, from);
    if (res.missing) return null;
    return res.status === 200 ? res.text : '';
  } catch {
    return '';
  }
}

/** Every FRED series the app reads: the US releases and the OECD figures for Japan, Canada and Australia. */
function fredSeriesIds(): string[] {
  const ids = new Set<string>();
  for (const ev of US_EVENTS) ids.add(ev.series);
  for (const c of Object.values(COUNTRY_STATS)) for (const s of [c.gdp, c.cpi, c.un]) if (s && !s[0].includes(':')) ids.add(s[0]);
  return [...ids];
}

/** Headline rates the statistics offices publish themselves (ONS, Eurostat), under pseudo series ids. */
async function loadOfficialStats(series: Record<string, Obs>) {
  const since = new Date(Date.now() - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const [cpi, gdp, unemp, hicp, eun, egdp] = await Promise.all(
    (['ukcpi', 'ukgdp', 'ukunemp', 'estatHicp', 'estatUnemp', 'estatGdp'] as const).map((k) => official(k, since)),
  );
  const put = (id: string, obs: Obs | undefined) => {
    if (obs?.length) series[id] = obs;
  };
  put('ONS:D7G7', parseOnsCsv(cpi));
  put('ONS:IHYR', parseOnsCsv(gdp, 'q'));
  const lfs = parseOnsMonths(unemp);
  put('ONS:MGSX', lfs.obs);
  for (const [d, label] of lfs.labels) periodNames.set(`ONS:MGSX|${d}`, label);
  for (const [kind, text] of [['HICP', hicp], ['UN', eun], ['GDP', egdp]] as const) {
    const flags = new Map<string, string>();
    const m = parseJsonStat(text, flags);
    const ea = euroAreaCode(m);
    for (const [g, as] of [...(ea ? [[ea, 'EA']] : []), ...['DE', 'FR', 'IT', 'ES', 'NL'].map((x) => [x, x])]) {
      const id = `ESTAT:${kind}:${as}`;
      put(id, m.get(g));
      for (const [d] of m.get(g) ?? []) {
        const f = flags.get(`${g}|${d}`);
        if (f) statusFlags.set(`${id}|${d}`, f);
      }
    }
  }
}

/** Status of an official figure, "estimate" or "provisional", when the source flags it. */
export function figureStatus(id: string, date: string): string | undefined {
  const f = statusFlags.get(`${id}|${date}`);
  return f === 'e' ? 'estimate' : f === 'p' ? 'provisional' : undefined;
}

/** The period a figure covers: the source's own name for it ("May-Jul 2026" for a UK three-month average), else from its date. */
export function figurePeriod(id: string, date: string, freq: Freq): string {
  return periodNames.get(`${id}|${date}`) ?? periodLabel(date, freq);
}

const statusFlags = new Map<string, string>();
const periodNames = new Map<string, string>();

async function loadSeries(): Promise<boolean> {
  const series = { ...fredData.get().series };
  let any = false;
  let needsKey = false;
  const official = loadOfficialStats(series);
  for (const id of fredSeriesIds()) {
    const text = await get('observations', id);
    if (text === null) {
      needsKey = true;
      break;
    }
    const obs = parseFredObservations(text);
    if (obs.length) {
      series[id] = obs;
      any = true;
    }
  }
  await official;
  any ||= Object.keys(series).some((id) => id.includes(':'));
  fredData.set((s) => ({ ...s, series, loaded: s.loaded || any, needsKey }));
  return any;
}

async function loadCalendars(): Promise<boolean> {
  // A month back (ECO's "last week") onwards, scheduled dates included.
  const from = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const rids = [...new Set(US_EVENTS.map((e) => e.rid))];
  const releases = { ...fredData.get().releases };
  let any = false;
  for (const rid of rids) {
    const text = await get('release-dates', String(rid), from);
    if (text === null) {
      fredData.set((s) => ({ ...s, needsKey: true }));
      return false;
    }
    const dates = parseFredReleaseDates(text, rid);
    if (dates.length) {
      releases[rid] = dates;
      any = true;
    }
  }
  if (any) fredData.set((s) => ({ ...s, releases, needsKey: false }));
  return any;
}

let reload: (() => void) | null = null;

/** Loads FRED again now, after the user saves an API key. */
export function reloadFred() {
  reload?.();
}

/** Loads release dates (every 12 hours) and series values (every 10 minutes); retries every 2 minutes until both answer. */
export function startFred(): () => void {
  if (!fredAvailable()) return () => undefined;
  setFeed('eco', 'connecting', 'FRED API (St. Louis Fed), ONS and Eurostat');
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const report = () => {
    const s = fredData.get();
    const fredOk = Object.keys(s.releases).length > 0 && US_EVENTS.some((e) => s.series[e.series]?.length);
    const officialOk = Object.keys(s.series).some((id) => id.includes(':'));
    if (fredOk) setFeed('eco', 'live', 'US releases and values from the FRED API; UK and euro area statistics from the ONS and Eurostat');
    else if (s.needsKey) setFeed('eco', officialOk ? 'live' : 'blocked', `FRED needs your API key (open PROV to add it)${officialOk ? '; ONS and Eurostat statistics are live' : ''}`);
    else setFeed('eco', officialOk ? 'live' : 'error', officialOk ? 'FRED unavailable; ONS and Eurostat statistics are live' : 'Economic data sources unavailable');
    return fredOk;
  };
  const first = async () => {
    if (retry) clearTimeout(retry);
    retry = null;
    await Promise.all([loadCalendars(), loadSeries()]);
    if (stopped) return;
    if (!report()) retry = setTimeout(() => void first(), 120_000);
  };
  reload = () => void first();
  void first();
  const seriesTimer = setInterval(() => void loadSeries().then(report), 10 * 60_000);
  const calTimer = setInterval(() => void loadCalendars().then(report), 12 * 3600_000);
  return () => {
    stopped = true;
    reload = null;
    clearInterval(seriesTimer);
    clearInterval(calTimer);
    if (retry) clearTimeout(retry);
  };
}
