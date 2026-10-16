import type { Quote, SecurityDef } from './types';

/**
 * The freshness label every price carries, from what the source states and
 * the source's own timestamps, never from how often the app asks:
 *
 * - REAL-TIME: the source labels the market real time and its latest price is
 *   recent enough for the instrument (see `staleAfter`).
 * - DELAYED: the source states a delay.
 * - END OF DAY: a completed session's price (the market is closed) or a
 *   once-a-day series that is not an official reference value.
 * - REFERENCE: an official value published once a day (Treasury yields,
 *   central bank rates): a reference, not a price anyone can trade at.
 * - STALE: older than the instrument's threshold while its market should be
 *   updating, or the source has stopped answering.
 * - DEMO DATA: simulated by the demo.
 * - UNKNOWN FRESHNESS: the source does not say.
 */
export type FreshnessLabel = 'REAL-TIME' | 'DELAYED' | 'END OF DAY' | 'REFERENCE' | 'STALE' | 'DEMO DATA' | 'UNKNOWN FRESHNESS';

export interface FreshnessInfo {
  label: FreshnessLabel;
  /** What the label rests on, in a sentence. */
  why: string;
}

const MIN = 60_000;
const DAY = 86_400_000;

/**
 * How old a price may be, beyond any delay the source states, before it is
 * called stale while its market is open. Currencies, crypto and indices
 * update many times a minute; a single stock or future can go some minutes
 * without a trade.
 */
export function staleAfter(def: Pick<SecurityDef, 'cls'> | undefined): number {
  switch (def?.cls) {
    case 'fx':
    case 'crypto':
    case 'index':
      return 10 * MIN;
    default:
      return 30 * MIN;
  }
}

/** A once-a-day series is stale when its latest value is older than a long weekend. */
export const DAILY_STALE_AFTER = 5 * DAY;

/** Official publishers: their once-a-day values are reference values. */
export function isOfficialProvider(provider: string | undefined): boolean {
  return !!provider && !/yahoo|coingecko|binance|kraken|massive|twelve|financial modeling|alpha vantage/i.test(provider);
}

function age(ms: number): string {
  const m = Math.round(ms / MIN);
  if (m < 1) return `${Math.max(0, Math.round(ms / 1000))} s`;
  if (m < 120) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The label for a quote at `now`; null when there is no value at all. */
export function freshnessOf(q: Pick<Quote, 'src' | 'time' | 'delay' | 'sourceName' | 'provider' | 'dayOnly'>, def: Pick<SecurityDef, 'cls'> | undefined, now: number): FreshnessInfo | null {
  const old = now - q.time;
  switch (q.src) {
    case 'SIM':
      return { label: 'DEMO DATA', why: 'Simulated by the demo: not a market price' };
    case 'NONE':
      return null;
    case 'EOD': {
      if (Number.isFinite(old) && old > DAILY_STALE_AFTER) return { label: 'STALE', why: `The latest published value is from ${isoDay(q.time)}, ${age(old)} ago; the source publishes once a business day` };
      return isOfficialProvider(q.provider)
        ? { label: 'REFERENCE', why: `Official value published once a day${q.provider ? ` by ${q.provider}` : ''}, as of ${isoDay(q.time)}: a reference rate, not a price to trade at` }
        : { label: 'END OF DAY', why: `End-of-day value as of ${isoDay(q.time)}` };
    }
    case 'STALE':
      return { label: 'STALE', why: 'The source has stopped answering: this is the last value received' };
    case 'CLOSE':
      return { label: 'END OF DAY', why: `Market closed: the last price of its latest session${Number.isFinite(q.time) ? ` (${isoDay(q.time)})` : ''}` };
    case 'LIVE':
    case 'DELAYED':
    case 'UNCONFIRMED': {
      if (q.dayOnly) return { label: 'UNKNOWN FRESHNESS', why: 'Price from the latest daily bar: no quote has arrived yet to say how current it is' };
      const delay = (q.delay ?? 0) * MIN;
      if (Number.isFinite(old) && old > delay + staleAfter(def)) {
        return { label: 'STALE', why: `No new price for ${age(old)} while the market is open (stale after ${age(staleAfter(def))}${delay ? ` beyond the stated ${q.delay}-minute delay` : ''})` };
      }
      if (q.src === 'LIVE') return { label: 'REAL-TIME', why: `The source labels this market real time${q.sourceName ? ` ("${q.sourceName}")` : ''}; its latest price is ${age(Math.max(0, old))} old` };
      if (q.src === 'DELAYED') return { label: 'DELAYED', why: q.delay ? `Delayed ${q.delay} minutes, as the source states` : 'Delayed, as the source states' };
      return { label: 'UNKNOWN FRESHNESS', why: 'The source does not say whether this price is real time or delayed' };
    }
  }
}

/** The market session in words, kept apart from the data's freshness. */
export function sessionLabel(session: Quote['session']): string | null {
  switch (session) {
    case 'open':
      return 'OPEN';
    case 'pre':
      return 'PRE-MARKET';
    case 'post':
      return 'AFTER HOURS';
    case 'overnight':
      return 'OVERNIGHT';
    case 'closed':
      return 'CLOSED';
    default:
      return null;
  }
}

/** The one-letter mark a price cell carries for its label; none for real time. */
export const FRESHNESS_MARK: Record<FreshnessLabel, string> = {
  'REAL-TIME': '',
  DELAYED: 'D',
  'END OF DAY': 'E',
  REFERENCE: 'R',
  STALE: 'S',
  'DEMO DATA': 'DEMO',
  'UNKNOWN FRESHNESS': '?',
};
