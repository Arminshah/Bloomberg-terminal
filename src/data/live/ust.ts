import { engine } from '../market';
import { dayNum } from '../calendar';
import type { ExtBar } from '../engine';
import { setFeed } from './status';

/**
 * Official US Treasury par yields (home.treasury.gov) for the desktop app:
 * every tenor of the generic curve, end of day, ten years of history. Yahoo
 * streams 5Y, 10Y and 30Y during the session; the other tenors have no free
 * intraday source and show the latest official close. The Treasury's 3-month
 * rate is used rather than Yahoo's 13-week bill index, which is quoted on a
 * discount basis and sits below the rest of the curve.
 */

const COLUMNS: Record<string, string> = {
  '3 Mo': 'USGG3M Index',
  '6 Mo': 'USGG6M Index',
  '1 Yr': 'USGG12M Index',
  '2 Yr': 'USGG2YR Index',
  '3 Yr': 'USGG3YR Index',
  '7 Yr': 'USGG7YR Index',
  '20 Yr': 'USGG20YR Index',
};

/** Lines this source owns; the Yahoo service leaves them alone. */
export const TREASURY_IDS = new Set(Object.values(COLUMNS));

/** Who publishes a US generic yield in the desktop app and how it is measured. */
export function usYieldMethod(d: { id: string; yahoo?: string }): string | undefined {
  if (TREASURY_IDS.has(d.id)) return 'US Department of the Treasury, daily par yield curve rate (end of day)';
  if (d.yahoo) return `Cboe Treasury yield index ${d.yahoo} (latest auctioned note or bond), via Yahoo Finance`;
  return undefined;
}

export function treasuryAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.treasury === 'function';
}

/** Parses one year's CSV into {line id -> {day -> yield}}. */
export function parseTreasuryCsv(text: string): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return out;
  const head = lines[0].split(',').map((h) => h.replace(/"/g, '').trim());
  const cols = head.map((h) => COLUMNS[h]);
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cells[0]?.trim() ?? '');
    if (!m) continue;
    const day = dayNum(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
    cells.forEach((c, i) => {
      const id = cols[i];
      const v = Number(c);
      if (!id || c.trim() === '' || !Number.isFinite(v)) return;
      const series = out.get(id) ?? new Map<number, number>();
      series.set(day, v);
      out.set(id, series);
    });
  }
  return out;
}

const history = new Map<string, Map<number, number>>();

function merge(parsed: Map<string, Map<number, number>>) {
  for (const [id, days] of parsed) {
    const all = history.get(id) ?? new Map<number, number>();
    for (const [d, v] of days) all.set(d, v);
    history.set(id, all);
  }
}

function apply(): string[] {
  const changed: string[] = [];
  for (const [id, days] of history) {
    if (!engine.get(id)) continue;
    const bars: ExtBar[] = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([day, c]) => ({ day, o: c, h: c, l: c, c, v: 0 }));
    if (bars.length < 2) continue;
    engine.setExternalDaily(id, bars, { eod: true });
    changed.push(id);
  }
  if (changed.length) engine.flush(changed);
  return changed;
}

async function loadYear(year: number): Promise<boolean> {
  try {
    const res = await window.arminDesktop!.treasury(year);
    if (res.status !== 200 || !res.text) return false;
    merge(parseTreasuryCsv(res.text));
    return true;
  } catch {
    return false;
  }
}

/** Loads the curve (this year first, then nine back) and refreshes it every 30 minutes. */
export function startTreasury(): () => void {
  if (!treasuryAvailable()) return () => undefined;
  let stopped = false;
  const year = new Date().getUTCFullYear();
  void (async () => {
    // The current year alone is enough to put real levels on screen.
    if (await loadYear(year)) apply();
    for (let y = year - 1; y >= year - 9 && !stopped; y--) await loadYear(y);
    if (!stopped && apply().length) setFeed('rates', 'live', 'US Treasury par yields, end of day');
    else if (!stopped) setFeed('rates', 'error', 'US Treasury yields unavailable; tenors stay simulated');
  })();
  const timer = setInterval(() => {
    void loadYear(new Date().getUTCFullYear()).then((ok) => ok && apply());
  }, 30 * 60_000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
