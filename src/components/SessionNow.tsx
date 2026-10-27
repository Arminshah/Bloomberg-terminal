import { zonedParts } from '../core/format';
import { exchangeOfListing, exchangeStatus, fmtCountdown, US_MARKET, usSession, type UsPhase } from '../data/exchanges';
import { IEX_PROVIDER } from '../data/live/iex-engine';
import { engine } from '../data/market';

/**
 * Which session US stocks are trading in now (pre-market, the regular session, after hours, or none), when that
 * changes, and which watchlist column holds the live prices; and whether the other markets in the list are open.
 */

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The watchlist columns that move in a phase: the pre-market's, the last price's, or after hours'. */
export function liveColumns(phase: UsPhase): string[] {
  return phase === 'pre' ? ['ARMIN_PRE_MARKET', 'ARMIN_PRE_PX'] : phase === 'regular' ? ['PX_LAST'] : phase === 'post' ? ['ARMIN_AFTER_HOURS', 'ARMIN_POST_PX'] : [];
}

const LABEL: Record<UsPhase, string> = { pre: 'PRE-MARKET', regular: 'OPEN', post: 'AFTER HOURS', closed: 'CLOSED' };
const BADGE: Record<UsPhase, string> = { pre: 'session-pre', regular: 'session-open', post: 'session-post', closed: 'session-closed' };

/** "04:00" today, "Mon 04:00" another day, in New York. */
function nyTime(t: number, now: number): string {
  const a = zonedParts(t, US_MARKET.tz);
  const b = zonedParts(now, US_MARKET.tz);
  const hhmm = `${String(a.h).padStart(2, '0')}:${String(a.mi).padStart(2, '0')}`;
  const sameDay = a.y === b.y && a.mo === b.mo && a.d === b.d;
  return sameDay ? hhmm : `${WEEKDAY[new Date(Date.UTC(a.y, a.mo - 1, a.d)).getUTCDay()]} ${hhmm}`;
}

/**
 * What the line says for US stocks now: the session, when it changes, and which column to read. `iex`: the list's US
 * prices come from IEX, whose last price is its latest trade, made outside the regular session too.
 */
export function usSessionText(now: number, shown: string[], iex = false): { phase: UsPhase; label: string; text: string } {
  const s = usSession(now);
  const left = Number.isFinite(s.until) ? fmtCountdown(s.until - now) : '';
  const missing = (ids: string[]) => (ids.some((c) => shown.includes(c)) ? '' : ' (not among the columns: 94) Columns adds it)');
  const last = (otherwise: string) => (iex ? "Last is IEX's latest trade, outside the regular session too" : otherwise);
  let text: string;
  if (s.phase === 'pre') text = `pre-market, ${s.from} to ${s.to} New York · the regular session opens in ${left} · Pre-mkt is live${missing(liveColumns('pre'))}; ${last('Last is the previous close')}`;
  else if (s.phase === 'regular') text = `regular session, ${s.from} to ${s.to} New York · closes in ${left} · Last is live`;
  else if (s.phase === 'post') text = `after hours, ${s.from} to ${s.to} New York · ends in ${left} · After-hrs is live${missing(liveColumns('post'))}; ${last("Last is today's close")}`;
  else {
    const why = s.closedFor === 'holiday' ? `closed for ${s.holiday}` : s.closedFor === 'weekend' ? 'closed for the weekend' : 'closed until the pre-market';
    const opens = Number.isFinite(s.until) ? ` · pre-market opens ${nyTime(s.until, now)} New York (in ${left})` : '';
    text = `${why}${opens} · nothing is live: ${iex ? "Last is IEX's latest trade" : 'Last is the latest close'}, After-hrs the last after-hours trade`;
  }
  return { phase: s.phase, label: LABEL[s.phase], text };
}

export function SessionNow({ ids, columns, now }: { ids: string[]; columns: string[]; now: number }) {
  const defs = ids.map((id) => engine.get(id)).filter((d) => d?.cls === 'equity');
  const us = defs.some((d) => exchangeOfListing(d!.ticker) === US_MARKET);
  const others = [...new Set(defs.map((d) => exchangeOfListing(d!.ticker)).filter((x) => x && x !== US_MARKET))];
  if (!us && !others.length) return null;
  const iex = ids.some((id) => engine.quote(id)?.provider === IEX_PROVIDER);
  const u = us ? usSessionText(now, columns, iex) : null;
  return (
    <div className="session-now" role="status" aria-label="Market sessions now">
      {u ? (
        <span>
          <span className={`badge ${BADGE[u.phase]}`}>{u.label}</span> <span className="white">US stocks:</span> {u.text}
        </span>
      ) : null}
      {others.length ? (
        <span className="muted">
          {u ? ' · ' : ''}
          Other markets in this list:{' '}
          {others
            .map((ex) => {
              const st = exchangeStatus(ex!, now);
              return `${ex!.label} ${st.state === 'OPEN' ? 'open' : st.state === 'HOLIDAY' ? 'closed (holiday)' : st.state === 'WEEKEND' ? 'closed (weekend)' : 'closed'}`;
            })
            .join(', ')}
        </span>
      ) : null}
    </div>
  );
}
