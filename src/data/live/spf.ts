/**
 * The ECB's Survey of Professional Forecasters (ECB Data Portal, dataset SPF; electron/main.cjs, official 'ecbSpf'):
 * each quarterly round's average of the panel's point forecasts for euro area real GDP growth, HICP and core inflation
 * and the unemployment rate, for the current calendar year, the next two and the longer term. The app asks the last
 * two rounds, so each figure has its change since the round before.
 */
import { useEffect, useState } from 'react';

export const SPF_TOPICS = [
  { id: 'RGDP', label: 'Real GDP growth', unit: '% y/y' },
  { id: 'HICP', label: 'HICP inflation', unit: '% y/y' },
  { id: 'CORE', label: 'Core inflation (HICP excluding energy and food)', unit: '% y/y' },
  { id: 'UNEM', label: 'Unemployment rate', unit: '% of labour force' },
] as const;
export type SpfTopic = (typeof SPF_TOPICS)[number]['id'];

export interface SpfCell { now: number; before?: number }
export interface EcbSpf {
  /** The latest round ("2026-Q4") and the one before. */
  round: string;
  previous?: string;
  /** The calendar years asked in the latest round, in order. */
  years: string[];
  /** The year the longer-term horizon stands for in the latest round (five years ahead in Q3 and Q4 rounds, four in Q1 and Q2). */
  longTermYear?: string;
  /** Topic → horizon (a year, or "LT") → the latest round's average and the previous round's for the same horizon. */
  values: Record<string, Record<string, SpfCell>>;
}

/** Splits one CSV line, quoted fields and doubled quotes included. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The Data Portal's CSV as the latest round's table. Rolling horizons (12 or 24 months ahead) are dated by their
 * target quarter, not by the round, so only calendar years and the longer term are read; the round is the latest
 * TIME_PERIOD among them.
 */
export function parseEcbSpf(text: string): EcbSpf | { error: string } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = cells(lines[0] ?? '');
  const col = (name: string) => head.indexOf(name);
  const [cTopic, cHorizon, cSource, cPeriod, cValue] = ['FCT_TOPIC', 'FCT_HORIZON', 'FCT_SOURCE', 'TIME_PERIOD', 'OBS_VALUE'].map(col);
  if ([cTopic, cHorizon, cSource, cPeriod, cValue].some((c) => c < 0)) return { error: 'The ECB changed the survey format.' };
  const rows = lines.slice(1).map(cells)
    .map((c) => ({ topic: c[cTopic], horizon: c[cHorizon], source: c[cSource], period: c[cPeriod], value: c[cValue] === '' ? NaN : Number(c[cValue]) }))
    .filter((r) => r.source === 'AVG' && (/^\d{4}$/.test(r.horizon) || r.horizon === 'LT') && /^\d{4}-Q[1-4]$/.test(r.period) && Number.isFinite(r.value));
  if (!rows.length) return { error: 'The ECB gave no survey averages.' };
  const rounds = [...new Set(rows.map((r) => r.period))].sort();
  const round = rounds[rounds.length - 1];
  const previous = rounds.length > 1 ? rounds[rounds.length - 2] : undefined;
  const values: Record<string, Record<string, SpfCell>> = {};
  for (const r of rows.filter((x) => x.period === round)) {
    const before = rows.find((x) => x.period === previous && x.topic === r.topic && x.horizon === r.horizon)?.value;
    (values[r.topic] ??= {})[r.horizon] = before === undefined ? { now: r.value } : { now: r.value, before };
  }
  const roundYear = Number(round.slice(0, 4));
  const asked = [...new Set(rows.filter((r) => r.period === round && r.horizon !== 'LT').map((r) => Number(r.horizon)))].sort((a, b) => a - b);
  // The years the round asks: this year and the next two; a later year is the longer term's.
  const years = asked.filter((y) => y >= roundYear && y <= roundYear + 2).map(String);
  const later = asked.filter((y) => y > roundYear + 2);
  return { round, previous, years, longTermYear: later.length ? String(later[later.length - 1]) : undefined, values };
}

/** "2026-Q4" as "Q4 2026". */
export const roundLabel = (round: string) => `${round.slice(5)} ${round.slice(0, 4)}`;

let cached: { at: number; answer: EcbSpf | { error: string } } | undefined;

/** The latest round, asked once every six hours while ECOFORECASTS shows it. */
export function useEcbSpf(on: boolean): { state: 'none' | 'loading' | 'ok' | 'error'; spf?: EcbSpf; message?: string } {
  const [answer, setAnswer] = useState(cached?.answer);
  const available = typeof window !== 'undefined' && typeof window.arminDesktop?.official === 'function';
  useEffect(() => {
    if (!on || !available || (cached && Date.now() - cached.at < 6 * 3_600_000)) return;
    let stopped = false;
    const today = new Date().toISOString().slice(0, 10);
    void window.arminDesktop!.official('ecbSpf', today).then(
      (res) => {
        const parsed = res.text ? parseEcbSpf(res.text) : { error: res.status ? `The ECB answered HTTP ${res.status}.` : 'The ECB did not answer.' };
        if (!('error' in parsed)) cached = { at: Date.now(), answer: parsed };
        if (!stopped) setAnswer(parsed);
      },
      () => !stopped && setAnswer({ error: 'The ECB did not answer.' }),
    );
    return () => {
      stopped = true;
    };
  }, [on, available]);
  if (!available) return { state: 'none' };
  if (!answer) return { state: 'loading' };
  return 'error' in answer ? { state: 'error', message: answer.error } : { state: 'ok', spf: answer };
}
