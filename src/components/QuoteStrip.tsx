import { engine, useQuote } from '../data/market';
import type { Quote, SecurityDef } from '../data/types';
import { QuoteFreshness } from './Freshness';
import { fmtBig, fmtDay, fmtNum, fmtPct, fmtStamp, fmtTime, signClass } from '../core/format';
import { Flash } from './Flash';
import { DayChg } from './cells';

/** The source time in the exchange's own zone, when the source names it and it differs from the display zone. */
function exchangeTime(q: Quote): string {
  if (!q.tz || !Number.isFinite(q.time) || q.src === 'CLOSE' || q.src === 'STALE') return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: q.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }).formatToParts(new Date(q.time));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const there = `${get('hour')}:${get('minute')} ${get('timeZoneName')}`;
    return fmtTime(q.time, false) === `${get('hour')}:${get('minute')}` ? '' : ` (${there} at the exchange)`;
  } catch {
    return '';
  }
}

const SESSION: Record<string, string> = { pre: 'Pre-mkt', post: 'After hrs', overnight: 'Overnight' };

/** One-line live quote under a function header. */
export function QuoteStrip({ sec }: { sec: SecurityDef }) {
  const q = useQuote(sec.id);
  if (!q) return null;
  const y = sec.quote === 'yield';
  const ccy = sec.minor ? sec.ccy : sec.cls === 'rate' ? '%' : sec.ccy;
  return (
    <div className="qstrip">
      <span className="yellow b">{sec.ticker}</span>
      <span className="muted">{ccy}</span>
      <Flash value={q.last} className={`px ${q.tick > 0 ? 'arrow-up' : q.tick < 0 ? 'arrow-dn' : ''}`}>
        {fmtNum(q.last, sec.dec)}
      </Flash>
      {y ? <DayChg q={q} bp unit="bp" /> : <DayChg q={q} dec={sec.dec} />}
      {!y && <DayChg q={q} pct />}
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
      <span
        className="muted hide-m"
        title={
          q.src === 'EOD'
            ? 'Date of the latest published value'
            : q.dayOnly
              ? 'Price from the latest daily bar; the time of the last trade comes with the first quote'
              : 'When the market set the latest price (source time) and when the app received it'
        }
      >
        {q.src === 'NONE' ? '' : q.src === 'EOD' || q.dayOnly ? `as of ${fmtDay(q.time)}` : q.src === 'SIM' ? fmtTime(q.time) : `source ${q.src === 'CLOSE' || q.src === 'STALE' ? fmtStamp(q.time) : fmtTime(q.time)}${exchangeTime(q)}`}
        {q.fetched && q.src !== 'SIM' && q.src !== 'NONE' ? ` · retrieved ${fmtTime(q.fetched)}` : ''}
      </span>
      {q.extended && Number.isFinite(q.last) && (
        <span className="hide-m" title={`${SESSION[q.extended.session]} price at ${fmtTime(q.extended.time)}`}>
          <span className="lbl">{SESSION[q.extended.session]}</span>
          {fmtNum(q.extended.price, sec.dec)} <span className={signClass(q.extended.price - q.last)}>{fmtPct((q.extended.price / q.last - 1) * 100)}</span>
        </span>
      )}
      {q.provider && (
        <span className="muted hide-m" title={q.provider.includes('unofficial') ? 'An unofficial source, kept for personal use: it does not guarantee timeliness or accuracy' : 'Who supplies this line'}>
          {q.provider}
        </span>
      )}
      <span className="src">
        <QuoteFreshness id={sec.id} />
      </span>
    </div>
  );
}
