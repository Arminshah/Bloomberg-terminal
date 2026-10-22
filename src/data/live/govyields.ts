import { engine } from '../market';
import { isoToDay } from '../calendar';
import type { ExtBar } from '../engine';
import { setFeed } from './status';
import { official, officialAvailable, parseBoeColumns, parseBubaCsv, parseMofCsv, parseRbaTable, parseValetGroup, type Obs } from './official';
import type { OfficialSource } from './lookup';
import { registerRefresh } from '../../terminal/refresh';

/**
 * Official government bond yields for the desktop app, end of day, from each
 * country's central bank or finance ministry. Each figure is the number the
 * source publishes, so a line's method is part of its name:
 * - Germany: Deutsche Bundesbank yield curve (Svensson method), zero-coupon yields
 * - United Kingdom: Bank of England nominal par yields (5, 10 and 20 years only)
 * - Japan: Ministry of Finance JGB yields at constant maturities
 * - Canada: Bank of Canada benchmark bond yields (2, 3, 5, 7, 10 years and the long-term benchmark)
 * - Australia: Reserve Bank of Australia interpolated yields (table F2: 2, 3, 5 and 10 years)
 * Other countries have no free official daily source and stay off the desktop app.
 */

interface Line {
  id: string;
  source: OfficialSource;
  /** Series key in the parsed source. */
  key: string;
  /** Who publishes it and how it is measured. */
  method: string;
}

const BUBA = (y: string) => `BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R${y}XX.R.A.A._Z._Z.A`;
const BUBA_METHOD = 'Deutsche Bundesbank, zero-coupon yield from the Svensson curve of listed Federal securities';
const BOE_METHOD = 'Bank of England, nominal par yield from its fitted gilt curve';
const MOF_METHOD = 'Ministry of Finance Japan, JGB yield at constant maturity';
const BOC_METHOD = 'Bank of Canada, benchmark bond yield';
const RBA_METHOD = 'Reserve Bank of Australia, interpolated government bond yield (table F2)';

export const OFFICIAL_LINES: Line[] = [
  { id: 'GDBR2 Index', source: 'bunds', key: BUBA('02'), method: BUBA_METHOD },
  { id: 'GDBR5 Index', source: 'bunds', key: BUBA('05'), method: BUBA_METHOD },
  { id: 'GDBR10 Index', source: 'bunds', key: BUBA('10'), method: BUBA_METHOD },
  { id: 'GDBR30 Index', source: 'bunds', key: BUBA('30'), method: BUBA_METHOD },
  { id: 'GUKG5 Index', source: 'gilts', key: 'IUDSNPY', method: BOE_METHOD },
  { id: 'GUKG10 Index', source: 'gilts', key: 'IUDMNPY', method: BOE_METHOD },
  { id: 'GUKG20 Index', source: 'gilts', key: 'IUDLNPY', method: BOE_METHOD },
  { id: 'GJGB2 Index', source: 'jgb', key: '2Y', method: MOF_METHOD },
  { id: 'GJGB5 Index', source: 'jgb', key: '5Y', method: MOF_METHOD },
  { id: 'GJGB10 Index', source: 'jgb', key: '10Y', method: MOF_METHOD },
  { id: 'GJGB30 Index', source: 'jgb', key: '30Y', method: MOF_METHOD },
  ...[2, 3, 5, 7, 10].map((t) => ({ id: `GCAN${t}YR Index`, source: 'canadas' as const, key: `BD.CDN.${t}YR.DQ.YLD`, method: BOC_METHOD })),
  { id: 'GCAN30YR Index', source: 'canadas', key: 'BD.CDN.LONG.DQ.YLD', method: `${BOC_METHOD} (long-term benchmark, the 30-year bond)` },
  ...[2, 3, 5, 10].map((t) => ({ id: `GACGB${t} Index`, source: 'acgb' as const, key: `FCMYGBAG${t}D`, method: RBA_METHOD })),
];

const BY_ID = new Map(OFFICIAL_LINES.map((l) => [l.id, l]));

/** Lines this module owns in the desktop app. */
export const OFFICIAL_YIELD_IDS = new Set(BY_ID.keys());

/** The publisher of each official source, shown as the line's provider. */
const PUBLISHER: Record<string, string> = { bunds: 'Deutsche Bundesbank', gilts: 'Bank of England', jgb: 'Ministry of Finance Japan', canadas: 'Bank of Canada', acgb: 'Reserve Bank of Australia' };

/** Who publishes a line's yield and how it is measured, for lines on an official source. */
export function yieldMethod(id: string): string | undefined {
  return BY_ID.get(id)?.method;
}

/** Turns [ISO date, yield] observations into daily bars, one per date. */
export function obsToBars(obs: Obs): ExtBar[] {
  const byDay = new Map<number, number>();
  for (const [d, v] of obs) if (Number.isFinite(v)) byDay.set(isoToDay(d), v);
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, c]) => ({ day, o: c, h: c, l: c, c, v: 0 }));
}

/** Parses one source's text into {series key -> observations}. */
export function parseSource(source: OfficialSource, text: string): Map<string, Obs> {
  switch (source) {
    case 'bunds':
      return parseBubaCsv(text);
    case 'gilts':
      return parseBoeColumns(text);
    case 'jgb':
    case 'jgbHistory':
      return parseMofCsv(text);
    case 'canadas':
      return parseValetGroup(text);
    case 'acgb':
      return parseRbaTable(text);
    default:
      return new Map();
  }
}

const history = new Map<string, Map<number, number>>();

function merge(source: OfficialSource, parsed: Map<string, Obs>) {
  const target = source === 'jgbHistory' ? 'jgb' : source;
  for (const line of OFFICIAL_LINES) {
    if (line.source !== target) continue;
    const obs = parsed.get(line.key);
    if (!obs?.length) continue;
    const days = history.get(line.id) ?? new Map<number, number>();
    for (const b of obsToBars(obs)) days.set(b.day, b.c);
    history.set(line.id, days);
  }
}

function apply(): string[] {
  const changed: string[] = [];
  for (const [id, days] of history) {
    if (!engine.get(id)) continue;
    const bars = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, c]) => ({ day, o: c, h: c, l: c, c, v: 0 }));
    if (bars.length < 2) continue;
    engine.setExternalDaily(id, bars, { eod: true, provider: PUBLISHER[OFFICIAL_LINES.find((l) => l.id === id)?.source ?? ''] });
    changed.push(id);
  }
  if (changed.length) engine.flush(changed);
  return changed;
}

async function load(source: OfficialSource, since: string): Promise<boolean> {
  const text = await official(source, since);
  if (!text) return false;
  const parsed = parseSource(source, text);
  if (!parsed.size) return false;
  merge(source, parsed);
  return true;
}

const SOURCES: OfficialSource[] = ['bunds', 'gilts', 'jgb', 'canadas', 'acgb'];
const NAMES: Record<string, string> = { bunds: 'Bundesbank', gilts: 'Bank of England', jgb: 'MoF Japan', canadas: 'Bank of Canada', acgb: 'RBA' };

/**
 * Loads ten years of history, then refreshes the latest values every hour. A
 * source that fails is tried again (with its full history) two minutes later.
 */
export function startGovYields(): () => void {
  if (!officialAvailable()) return () => undefined;
  setFeed('yields', 'connecting', 'Official government bond yields');
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  const since = (years: number) => new Date(Date.now() - years * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const loaded = new Set<OfficialSource>();
  const report = () => {
    if (stopped) return;
    const ok = SOURCES.filter((s) => loaded.has(s));
    if (ok.length) setFeed('yields', 'live', `Official end-of-day yields: ${ok.map((s) => NAMES[s]).join(', ')}`);
    else setFeed('yields', 'error', 'Official government yield sources unavailable');
  };
  // A source already loaded only needs its latest weeks; one that is not gets ten years. Returns those that answered.
  const fetchAll = async (sources: OfficialSource[]): Promise<OfficialSource[]> => {
    const answered: OfficialSource[] = [];
    const jobs = sources.map(async (s) => {
      if (await load(s, since(loaded.has(s) ? 0.1 : 10))) {
        loaded.add(s);
        answered.push(s);
      }
    });
    // The Japanese history file holds every month before the current one.
    if (sources.includes('jgb') && !loaded.has('jgbHistory')) jobs.push(load('jgbHistory', since(10)).then((ok) => void (ok && loaded.add('jgbHistory'))));
    await Promise.all(jobs);
    if (stopped) return answered;
    apply();
    report();
    const missing = SOURCES.filter((s) => !loaded.has(s));
    if (missing.length && retries < 5) {
      retries++;
      if (retry) clearTimeout(retry);
      retry = setTimeout(() => void fetchAll(missing), 120_000);
    }
    return answered;
  };
  void fetchAll(SOURCES);
  const timer = setInterval(() => void fetchAll(SOURCES), 3600_000);
  const offRefresh = registerRefresh({
    source: 'Government bond yields',
    run: async () => {
      const ok = await fetchAll(SOURCES);
      const missing = SOURCES.filter((s) => !ok.includes(s)).map((s) => NAMES[s]);
      return { source: 'Government bond yields', state: missing.length ? 'failed' : 'asked', detail: `${ok.length} of ${SOURCES.length} sources answered${missing.length ? `; not answering: ${missing.join(', ')}` : ''}` };
    },
  });
  return () => {
    stopped = true;
    clearInterval(timer);
    if (retry) clearTimeout(retry);
    offRefresh();
  };
}
