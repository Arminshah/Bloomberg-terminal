import { fmtDay, fmtNum, fmtPct } from '../../core/format';
import type { AnalystPart, RatingTally, TargetConsensus } from './analysts';
import type { FinnhubPart, NextReport } from './finnhub';

/**
 * The analyst figures PROFILE and QUOTE show beside a US stock's own figures, from the parts ANALYSTS and
 * EARNINGS already load (no request of its own): the price target consensus (FMP, else Yahoo), the tally of
 * ratings (FMP, else Finnhub's latest month, else Yahoo's current snapshot) and the next quarter's EPS
 * estimate with its report date (Finnhub's earnings calendar). Every figure carries its source.
 */

export interface SnapshotLine {
  label: string;
  /** The figure, '--' when no source has one, or 'Loading…'. */
  value: string;
  /** Where the figure comes from, with its period or receipt date. */
  source?: string;
  /** Why there is no figure: the sources' own words, naming the key or switch that would enable it. */
  missing?: string;
}

export interface AnalystSnapshot {
  lines: SnapshotLine[];
  /** Set only when no source can be asked: what would enable one. */
  notConnected?: string;
  /** A remark in place of the lines (a stock the sources do not cover). */
  note?: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const usable = (p: AnalystPart | FinnhubPart | undefined) => p?.state === 'ok' && !!p.data;
const loading = (p: AnalystPart | FinnhubPart | undefined) => !p || p.state === 'loading';
const gated = (p: AnalystPart | FinnhubPart | undefined) => p?.state === 'needs-key' || p?.state === 'off';
const received = (p: { at?: number; stale?: boolean }) => `${p.at ? `, received ${fmtDay(p.at)}` : ''}${p.stale ? ', STALE' : ''}`;

/** The month a tally counts, as its source dates it: Finnhub's first of the month, Yahoo's relative months. */
export function ratingPeriod(period: string | undefined): string {
  if (!period) return '';
  if (period === '0m') return 'current month';
  const rel = /^-(\d+)m$/.exec(period);
  if (rel) return `${rel[1]} month${rel[1] === '1' ? '' : 's'} earlier`;
  const iso = /^(\d{4})-(\d{2})-\d{2}$/.exec(period);
  return iso ? `${MONTHS[Number(iso[2]) - 1]} ${iso[1]}` : period;
}

/** FMP's average target; Yahoo's mean target. Against the last price only when both are in the same currency. */
export function targetLine(part: AnalystPart<TargetConsensus | null> | undefined, last: number, ccy: string): SnapshotLine {
  const label = 'Price target (consensus)';
  if (loading(part)) return { label, value: 'Loading…' };
  if (!usable(part)) return { label, value: '--', missing: part?.message ?? 'No price targets from the sources.' };
  const c = part!.data!;
  // FMP does not name a currency for US listings, whose targets are in dollars; Yahoo names the quote currency.
  const cur = part!.currency ?? (part!.source === 'Yahoo Finance' ? undefined : ccy);
  const up = cur === ccy && last > 0 ? (c.mean / last - 1) * 100 : NaN;
  return { label, value: `${fmtNum(c.mean, 2)} ${cur ?? '(currency not supplied)'}${Number.isFinite(up) ? ` (${fmtPct(up, 1)} vs last)` : ''}`, source: `${part!.source ?? 'FMP'}${received(part!)}` };
}

/** Buy (strong buy and buy), hold and sell (sell and strong sell), with the source's own consensus word. */
export function ratingsLine(part: AnalystPart<RatingTally | null> | undefined): SnapshotLine {
  const label = 'Ratings buy / hold / sell';
  if (loading(part)) return { label, value: 'Loading…' };
  if (!usable(part)) return { label, value: '--', missing: part?.message ?? 'No ratings from the sources.' };
  const r = part!.data!;
  const buy = r.strongBuy + r.buy;
  const sell = r.sell + r.strongSell;
  const period = ratingPeriod(r.period);
  return { label, value: `${buy} / ${r.hold} / ${sell}${r.consensus ? ` (${r.consensus})` : ''}`, source: `${part!.source ?? 'FMP'}${period ? `, ${period}` : ''}${part!.stale ? ', STALE' : ''}` };
}

const WHEN: Record<string, string> = { bmo: 'before the open', amc: 'after the close', dmh: 'during the session' };

/** Finnhub's next report within its calendar's window (about three months) and that quarter's EPS estimate. */
export function nextQuarterLine(part: FinnhubPart<NextReport | null> | undefined): SnapshotLine {
  const label = 'EPS estimate, next quarter';
  if (loading(part)) return { label, value: 'Loading…' };
  if (part!.state !== 'ok') return { label, value: '--', missing: part!.message ?? 'Finnhub did not answer.' };
  const n = part!.data;
  if (!n) return { label, value: '--', source: `Finnhub${received(part!)}`, missing: 'Finnhub lists no report for the next three months.' };
  const date = Date.parse(`${n.date}T00:00:00Z`);
  const quarter = Number.isFinite(n.quarter) && Number.isFinite(n.year) ? ` for Q${n.quarter} ${n.year}` : '';
  const when = WHEN[n.hour] ? ` ${WHEN[n.hour]}` : '';
  return { label, value: `${Number.isFinite(n.epsEstimate) ? fmtNum(n.epsEstimate, 2) : '--'}${quarter}, report ${fmtDay(date)}${when}`, source: `Finnhub${received(part!)}` };
}

export interface SnapshotInput {
  /** The desktop app, which asks the research sources (analystsAvailable). */
  desktop: boolean;
  /** The US ticker the sources know the stock by; null for a stock they do not cover. */
  symbol: string | null;
  ticker: string;
  consensus?: AnalystPart<TargetConsensus | null>;
  ratings?: AnalystPart<RatingTally | null>;
  calendar?: FinnhubPart<NextReport | null>;
  /** Yahoo research is switched on (a source without a key). */
  yahooResearch: boolean;
  last: number;
  ccy: string;
}

export function analystSnapshot(i: SnapshotInput): AnalystSnapshot {
  if (!i.desktop) {
    return {
      lines: [],
      notConnected:
        'Analyst price targets, ratings and estimates: not connected in the browser. The desktop app shows them from Financial Modeling Prep (FMP_API_KEY), Finnhub (FINNHUB_API_KEY) or Yahoo Finance research (no key; YAHOO_RESEARCH_ENABLED).',
    };
  }
  if (!i.symbol) return { lines: [], note: `Analyst research here covers US-listed stocks; ${i.ticker} is not one.` };
  const lines = [targetLine(i.consensus, i.last, i.ccy), ratingsLine(i.ratings), nextQuarterLine(i.calendar)];
  // Not connected only when every source is unset or switched off; a source that answers without coverage is
  // not the same thing, and its own words stay on the line.
  const parts = [i.consensus, i.ratings, i.calendar];
  if (!i.yahooResearch && parts.every(gated)) {
    const fmp = i.consensus?.state === 'off' ? 'FMP_ENABLED switched on' : 'FMP_API_KEY';
    const finnhub = i.calendar?.state === 'off' ? 'FINNHUB_ENABLED switched on' : 'FINNHUB_API_KEY';
    return {
      lines: [],
      notConnected: `Analyst price targets, ratings and estimates: not connected. On PROVIDERS, ${fmp} would enable price targets and ratings (Financial Modeling Prep), ${finnhub} recommendation counts and the next quarter's EPS estimate (Finnhub), and YAHOO_RESEARCH_ENABLED price targets and ratings from Yahoo Finance without a key.`,
    };
  }
  return { lines };
}
