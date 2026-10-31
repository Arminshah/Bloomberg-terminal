import { dayNum } from '../calendar';
import { engine } from '../market';
import { terminal } from '../../terminal/state';
import { watchlists } from '../../terminal/userdata';
import { nasdaqNumber } from './earnings-calendar';
import { nasdaqTicker } from './nasdaq-book';

/**
 * The volume of a finished session of a US-listed stock, from Nasdaq's historical prices (all venues, as the
 * consolidated tape reports them). Yahoo's quote keeps the volume it had at the close, short of the late reports:
 * Apple on 27 October 2026 showed 39.05M against 39.98M at Nasdaq and Massive, JPMorgan 4.58M against 4.71M.
 */

export const SETTLED_SOURCE = 'Nasdaq historical prices · consolidated volume of all US venues';
export const SETTLED_OPEN_SOURCE = 'Nasdaq historical prices · official opening price';
export const SETTLED_RANGE_SOURCE = 'Nasdaq historical prices · official session high and low';

/** Nasdaq's historical rows as sessions (day number) with their volume, open and close; rows it cannot read are left out. */
export function parseNasdaqDays(text: string): { day: number; volume: number; close: number; open: number; high: number; low: number }[] {
  try {
    const rows = JSON.parse(text)?.data?.tradesTable?.rows;
    if (!Array.isArray(rows)) return [];
    const out: { day: number; volume: number; close: number; open: number; high: number; low: number }[] = [];
    for (const r of rows) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.date ?? ''));
      const volume = nasdaqNumber(r?.volume);
      if (!m || !(volume > 0)) continue;
      out.push({ day: dayNum(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]))), volume: Math.round(volume), close: nasdaqNumber(r?.close), open: nasdaqNumber(r?.open), high: nasdaqNumber(r?.high), low: nasdaqNumber(r?.low) });
    }
    return out;
  } catch {
    return [];
  }
}

const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Whether a US session (day number of its New York date) has ended and its volume can be settled: from 16:10 New
 * York time that day, when the closing auction and the late reports are in, or any later day.
 */
export function settleDue(day: number, now: number): boolean {
  const p = Object.fromEntries(NY.formatToParts(now).map((x) => [x.type, x.value]));
  const today = dayNum(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  return day < today || (day === today && Number(p.hour) * 60 + Number(p.minute) >= 16 * 60 + 10);
}

/** The New York date of a moment, as a day number: the session a US quote time belongs to. */
export function nyDay(ms: number): number {
  const p = Object.fromEntries(NY.formatToParts(ms).map((x) => [x.type, x.value]));
  return dayNum(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}

const asked = new Map<string, { at: number; day: number; times: number; failed: number }>();
/** A request that got no answer is asked again after two minutes, up to five times a session, and is not one of the four. */
const RETRY_MS = 2 * 60_000;
const QUICK_RETRIES = 5;

/** The US stocks on screen and in watchlists, the first 60. */
function wanted(): string[] {
  const ids = new Set<string>();
  for (const p of terminal.get().panels) {
    const r = p.history[p.idx];
    if (r?.sec) ids.add(r.sec);
    if (p.loadedSec) ids.add(p.loadedSec);
  }
  for (const l of watchlists.get().lists) for (const id of l.ids) ids.add(id);
  return [...ids].filter((id) => nasdaqTicker(id) !== null).slice(0, 60);
}

/** Asks Nasdaq for a session's row and settles it; 'failed' when no answer came (an error, a refusal, a throttle). */
async function settle(id: string, symbol: string, day: number, active: () => boolean): Promise<'answered' | 'failed'> {
  const api = window.arminDesktop;
  if (!api?.nasdaq) return 'failed';
  try {
    const res = await api.nasdaq('historical', symbol);
    if (!res.text || (res.status !== undefined && res.status !== 200)) return 'failed';
    if (!active()) return 'answered';
    const row = parseNasdaqDays(res.text).find((r) => r.day === day);
    if (row) {
      // Flushed whether or not a figure changed: a session checked against its record is no longer provisional.
      engine.settleVolume(id, day, row.volume, SETTLED_SOURCE, { price: row.open, source: SETTLED_OPEN_SOURCE }, { high: row.high, low: row.low, source: SETTLED_RANGE_SOURCE });
      engine.flush([id]);
    }
    return 'answered';
  } catch {
    return 'failed';
  }
}

/** Settles the finished session's volume of the US stocks in view: each at most every 30 minutes, four times a session (a request that got no answer is asked again sooner). */
export function startSettledVolumes(): () => void {
  if (typeof window === 'undefined' || !window.arminDesktop?.nasdaq) return () => undefined;
  let stopped = false;
  let visible = new Set<string>();
  const pending = new Set<string>();
  let queued: ReturnType<typeof setTimeout> | undefined;
  const check = (ids: Iterable<string>) => {
    if (stopped) return;
    const now = Date.now();
    for (const id of ids) {
      if (!visible.has(id)) continue;
      const q = engine.quote(id);
      const d = engine.daily(id);
      if (!q || q.src === 'SIM' || q.src === 'NONE' || !d.length) continue;
      const day = dayNum(d.t[d.length - 1]);
      const a = asked.get(id);
      if (a && a.day === day && (a.times >= 4 || now - a.at < 30 * 60_000)) continue;
      if (!settleDue(day, now)) continue;
      const failed = a && a.day === day ? a.failed : 0;
      asked.set(id, { at: now, day, times: a && a.day === day ? a.times + 1 : 1, failed });
      void settle(id, nasdaqTicker(id)!, day, () => !stopped).then((outcome) => {
        const e = asked.get(id);
        if (outcome !== 'failed' || !e || e.day !== day || e.failed >= QUICK_RETRIES) return;
        // Not an attempt: a throttled or refused request at start-up must not leave a provisional volume for half an hour.
        asked.set(id, { at: e.at - 30 * 60_000 + RETRY_MS, day, times: e.times - 1, failed: e.failed + 1 });
      });
    }
  };
  // A newly opened line or its first history must not wait for the minute poll.
  // Batch source/store notifications, ignoring clock ticks and unrelated lines.
  const schedule = (ids: Iterable<string>) => {
    if (stopped) return;
    for (const id of ids) if (visible.has(id)) pending.add(id);
    if (!pending.size || queued !== undefined) return;
    queued = setTimeout(() => {
      queued = undefined;
      const ids = [...pending];
      pending.clear();
      check(ids);
    }, 100);
  };
  const refresh = () => {
    if (stopped) return;
    const next = new Set(wanted());
    const added = [...next].filter((id) => !visible.has(id));
    visible = next;
    schedule(added);
  };
  const offTerminal = terminal.subscribe(refresh);
  const offWatchlists = watchlists.subscribe(refresh);
  const offEngine = engine.subscribe(schedule);
  refresh();
  const tick = () => { refresh(); check(visible); };
  const first = setTimeout(tick, 15_000);
  const timer = setInterval(tick, 60_000);
  return () => {
    stopped = true;
    offTerminal();
    offWatchlists();
    offEngine();
    if (queued !== undefined) clearTimeout(queued);
    pending.clear();
    clearTimeout(first);
    clearInterval(timer);
  };
}
