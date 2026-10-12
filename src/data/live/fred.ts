import { createStore } from '../../core/store';
import { zonedToUtc } from '../../core/format';
import { setFeed } from './status';
import { euroAreaCode, official, parseJsonStat, parseOnsCsv, parseOnsMonths } from './official';

/**
 * US economic releases and international statistics for the desktop app from
 * FRED (Federal Reserve Bank of St. Louis): official release dates and times
 * for each release, and the published values of each series. FRED republishes
 * the agencies' figures (BLS, BEA, Census, the Fed, Eurostat, the OECD).
 * Consensus forecasts are not public, so there is no survey.
 */

export type Obs = [string, number][];

export interface FredState {
  /** Series id -> observations in date order. */
  series: Record<string, Obs>;
  /** Release id -> release times (epoch ms), in order. */
  releases: Record<number, number[]>;
  loaded: boolean;
}

export const fredData = createStore<FredState>({ series: {}, releases: {}, loaded: false });

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
  /** For a release with two reports a month: true for the 7:30 am Central one, false for the other. */
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

/** FRED graph CSV: "observation_date,A,B" then "2026-08-01,334.131,". Blanks and "." are skipped. */
export function parseFredCsv(text: string): Record<string, Obs> {
  const out: Record<string, Obs> = {};
  const rows = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const head = (rows[0] ?? '').split(',');
  if (head[0] !== 'observation_date') return out;
  for (const id of head.slice(1)) out[id] = [];
  for (const row of rows.slice(1)) {
    const cells = row.split(',');
    const d = cells[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    head.forEach((id, i) => {
      if (i === 0) return;
      const c = (cells[i] ?? '').trim();
      const v = Number(c);
      if (c !== '' && c !== '.' && Number.isFinite(v)) out[id].push([d, v]);
    });
  }
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * FRED's release calendar page: a bold "Wednesday October 14, 2026" row for
 * each day, then each release's time ("7:30 am", US Central) and link. A blank
 * time repeats the one above it.
 */
export function parseFredCalendar(html: string, rid: number): number[] {
  const out: number[] = [];
  const re = /<span style="font-weight: bold;">\s*[A-Za-z]+ ([A-Za-z]+) (\d{1,2}), (\d{4})\s*<\/span>|<td nowrap[^>]*>\s*([^<]*?)\s*<\/td>\s*<td[^>]*>\s*<a href="\/release\?rid=(\d+)">/g;
  let day: [number, number, number] | null = null;
  let time: [number, number] | null = null;
  for (const m of html.matchAll(re)) {
    if (m[1]) {
      const mo = MONTHS.indexOf(m[1]);
      day = mo >= 0 ? [Number(m[3]), mo, Number(m[2])] : null;
      time = null;
      continue;
    }
    const t = /^(\d{1,2}):(\d{2})\s*(am|pm)$/i.exec(m[4] ?? '');
    if (t) time = [(Number(t[1]) % 12) + (t[3].toLowerCase() === 'pm' ? 12 : 0), Number(t[2])];
    else if ((m[4] ?? '').trim() !== '') time = null; // "N/A": no time given
    if (!day || !time || Number(m[5]) !== rid) continue;
    out.push(zonedToUtc(day[0], day[1], day[2], time[0], time[1], 'America/Chicago'));
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

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

/** Releases of one event: which of a release id's times belong to it (the M3 survey has two reports a month). */
export function eventTimes(ev: FredEvent, times: number[]): number[] {
  if (ev.early == null) return times;
  const early = (t: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: false }).format(new Date(t));
    return p === '07:30' || p === '7:30';
  };
  return times.filter((t) => early(t) === ev.early);
}

// ------------------------------------------------------------------ loading

export function fredAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.fred === 'function';
}

async function get(kind: 'calendar' | 'series', arg: string, from?: string): Promise<string> {
  try {
    const res = await window.arminDesktop!.fred!(kind, arg, from);
    return res.status === 200 ? res.text : '';
  } catch {
    return '';
  }
}

/** Series grouped by frequency (FRED answers a mixed request with a zip), at most 12 per request. */
function seriesBatches(): string[] {
  const byFreq: Record<Freq, Set<string>> = { m: new Set(), q: new Set(), w: new Set() };
  for (const ev of US_EVENTS) byFreq[ev.freq].add(ev.series);
  for (const c of Object.values(COUNTRY_STATS)) for (const s of [c.gdp, c.cpi, c.un]) if (s && !s[0].includes(':')) byFreq[s[1]].add(s[0]);
  const out: string[] = [];
  for (const set of Object.values(byFreq)) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i += 12) out.push(ids.slice(i, i + 12).join(','));
  }
  return out;
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
  const [texts] = await Promise.all([Promise.all(seriesBatches().map((b) => get('series', b))), loadOfficialStats(series)]);
  let any = false;
  for (const t of texts) {
    const parsed = parseFredCsv(t);
    for (const [id, obs] of Object.entries(parsed)) {
      if (!obs.length) continue;
      series[id] = obs;
      any = true;
    }
  }
  if (any) fredData.set((s) => ({ ...s, series, loaded: true }));
  return any;
}

async function loadCalendars(): Promise<boolean> {
  // A month back (ECO's "last week") to five months ahead.
  const from = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const rids = [...new Set(US_EVENTS.map((e) => e.rid))];
  const releases = { ...fredData.get().releases };
  let any = false;
  await Promise.all(
    rids.map(async (rid) => {
      const times = parseFredCalendar(await get('calendar', String(rid), from), rid);
      if (times.length) {
        releases[rid] = times;
        any = true;
      }
    }),
  );
  if (any) fredData.set((s) => ({ ...s, releases }));
  return any;
}

/** Loads release calendars (every 12 hours) and series values (every 10 minutes). */
export function startFred(): () => void {
  if (!fredAvailable()) return () => undefined;
  setFeed('eco', 'connecting', 'FRED (St. Louis Fed)');
  let retry: ReturnType<typeof setTimeout> | null = null;
  const report = () => {
    const s = fredData.get();
    const ok = s.loaded && Object.keys(s.releases).length > 0;
    setFeed('eco', ok ? 'live' : 'error', ok ? 'US release calendar and published values from FRED (St. Louis Fed)' : 'FRED unavailable: no economic releases');
    return ok;
  };
  const first = async () => {
    await Promise.all([loadCalendars(), loadSeries()]);
    if (!report()) retry = setTimeout(() => void first(), 120_000);
  };
  void first();
  const seriesTimer = setInterval(() => void loadSeries().then(report), 10 * 60_000);
  const calTimer = setInterval(() => void loadCalendars().then(report), 12 * 3600_000);
  return () => {
    clearInterval(seriesTimer);
    clearInterval(calTimer);
    if (retry) clearTimeout(retry);
  };
}
