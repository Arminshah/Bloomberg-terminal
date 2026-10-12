import { useQuote } from '../data/market';
import type { SecurityDef } from '../data/types';
import { fmtBig, fmtBp, fmtNum, fmtPct, fmtSigned, fmtTime, signClass } from '../core/format';
import { Flash } from './Flash';

const SRC_TITLE: Record<string, string> = {
  LIVE: 'Real price, market open',
  CLOSE: 'Real price, market closed: the last trade of the latest session',
  DELAYED: 'Real price, delayed',
  EOD: 'Real end-of-day value: the source publishes once a day, after the close',
  SIM: 'Price from the simulator, not a real market',
};

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
          <span className="lbl">Vol</span>
          {fmtBig(q.volume)}
        </span>
      )}
      <span className="muted hide-m">{fmtTime(q.time)}</span>
      <span className={`src ${q.src === 'LIVE' ? 'up' : q.src === 'SIM' ? 'amber' : 'white'}`} title={SRC_TITLE[q.src]}>
        {q.src === 'SIM' ? 'SIMULATED' : q.src}
      </span>
    </div>
  );
}
