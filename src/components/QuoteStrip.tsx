import { engine, useQuote } from '../data/market';
import type { SecurityDef } from '../data/types';
import { fmtBig, fmtBp, fmtDay, fmtNum, fmtPct, fmtSigned, fmtStamp, fmtTime, signClass } from '../core/format';
import { Flash } from './Flash';

const SRC_TITLE: Record<string, string> = {
  LIVE: 'The source labels this quote real time',
  DELAYED: 'The source labels this quote delayed by the minutes shown',
  UNCONFIRMED: 'The source does not say whether this quote is real time or delayed',
  CLOSE: 'Market closed: the last trade of the latest session',
  EOD: 'End-of-day value: the source publishes once a day, after the close',
  STALE: 'The data source is not answering: this is the last price received',
  NONE: 'No price yet from the source',
  SIM: 'Demo data: simulated, not a market price',
};

/** Short source badge text for tables: LIVE, DELAYED 15M, NOT CONFIRMED, CLOSED and so on. */
export function srcLabel(q: { src: string; delay?: number }): string {
  if (q.src === 'SIM') return 'DEMO DATA';
  if (q.src === 'NONE') return 'NO DATA';
  if (q.src === 'UNCONFIRMED') return 'NOT CONFIRMED';
  if (q.src === 'CLOSE') return 'CLOSED';
  if (q.src === 'DELAYED' && q.delay) return `DELAYED ${q.delay}M`;
  return q.src;
}

/** The freshness label in words: "Live (provider-labelled)", "Delayed 15 min (provider-labelled)", "Timing not confirmed" and so on. */
export function srcLabelLong(q: { src: string; delay?: number }): string {
  switch (q.src) {
    case 'LIVE':
      return 'Live (provider-labelled)';
    case 'DELAYED':
      return q.delay ? `Delayed ${q.delay} min (provider-labelled)` : 'Delayed (provider-labelled)';
    case 'UNCONFIRMED':
      return 'Timing not confirmed';
    case 'CLOSE':
      return 'Market closed';
    case 'EOD':
      return 'End of day';
    case 'STALE':
      return 'Stale';
    case 'NONE':
      return 'No data';
    default:
      return 'DEMO DATA';
  }
}

const SESSION: Record<string, string> = { pre: 'Pre-mkt', post: 'After hrs', overnight: 'Overnight' };

/** One-line live quote under a function header. */
export function QuoteStrip({ sec }: { sec: SecurityDef }) {
  const q = useQuote(sec.id);
  if (!q) return null;
  const y = sec.quote === 'yield';
  const cls = signClass(q.chg);
  const ccy = sec.minor ? sec.ccy : sec.cls === 'rate' ? '%' : sec.ccy;
  return (
    <div className="qstrip">
      <span className="yellow b">{sec.ticker}</span>
      <span className="muted">{ccy}</span>
      <Flash value={q.last} className={`px ${q.tick > 0 ? 'arrow-up' : q.tick < 0 ? 'arrow-dn' : ''}`}>
        {fmtNum(q.last, sec.dec)}
      </Flash>
      <span className={cls}>{y ? `${fmtBp(q.chg)}bp` : fmtSigned(q.chg, sec.dec)}</span>
      {!y && <span className={cls}>{fmtPct(q.pct)}</span>}
      {Number.isFinite(q.bid) && (
        <span className="hide-m">
          <span className="lbl">B/A</span>
          {fmtNum(q.bid, sec.dec)}/{fmtNum(q.ask, sec.dec)}
        </span>
      )}
      <span>
        <span className="lbl">O</span>
        {fmtNum(q.open, sec.dec)}
      </span>
      <span>
        <span className="lbl">H</span>
        {fmtNum(q.high, sec.dec)}
      </span>
      <span>
        <span className="lbl">L</span>
        {fmtNum(q.low, sec.dec)}
      </span>
      <span className="hide-m">
        <span className="lbl">Prev</span>
        {fmtNum(q.prevClose, sec.dec)}
      </span>
      {q.volume > 0 && (
        <span>
          {/* The source reports crypto volume in dollars, not coins. */}
          <span className="lbl">{sec.cls === 'crypto' && engine.realOnly ? 'Vol USD' : 'Vol'}</span>
          {fmtBig(q.volume)}
        </span>
      )}
      <span className="muted hide-m" title={q.src === 'EOD' ? 'Date of the latest published value' : 'When the market set the latest price (source time) and when the app received it'}>
        {q.src === 'EOD' ? `as of ${fmtDay(q.time)}` : q.src === 'SIM' ? fmtTime(q.time) : `source ${q.src === 'CLOSE' || q.src === 'STALE' ? fmtStamp(q.time) : fmtTime(q.time)}`}
        {q.fetched && q.src !== 'SIM' && q.src !== 'NONE' ? ` · retrieved ${fmtTime(q.fetched)}` : ''}
      </span>
      {q.extended && Number.isFinite(q.last) && (
        <span className="hide-m" title={`${SESSION[q.extended.session]} price at ${fmtTime(q.extended.time)}`}>
          <span className="lbl">{SESSION[q.extended.session]}</span>
          {fmtNum(q.extended.price, sec.dec)} <span className={signClass(q.extended.price - q.last)}>{fmtPct((q.extended.price / q.last - 1) * 100)}</span>
        </span>
      )}
      <span className={`src ${q.src === 'LIVE' ? 'up' : q.src === 'SIM' || q.src === 'STALE' || q.src === 'NONE' || q.src === 'UNCONFIRMED' ? 'amber' : 'white'}`} title={`${SRC_TITLE[q.src]}${q.sourceName ? ` (Yahoo Finance: "${q.sourceName}")` : ''}`}>
        {srcLabelLong(q)}
      </span>
    </div>
  );
}
