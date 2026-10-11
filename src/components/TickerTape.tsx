import { engine, useTick } from '../data/market';
import { fmtBp, fmtNum, fmtPct } from '../core/format';
import { execute } from '../terminal/exec';
import { terminal } from '../terminal/state';

const TAPE = [
  'SPX Index', 'INDU Index', 'CCMP Index', 'RTY Index', 'VIX Index', 'SX5E Index', 'UKX Index', 'DAX Index', 'NKY Index',
  'HSI Index', 'EURUSD Curncy', 'USDJPY Curncy', 'GBPUSD Curncy', 'DXY Curncy', 'USGG2YR Index', 'USGG10YR Index',
  'CL1 Comdty', 'CO1 Comdty', 'NG1 Comdty', 'GC1 Comdty', 'SI1 Comdty', 'HG1 Comdty', 'XBTUSD Curncy', 'XETUSD Curncy',
  'NVDA US Equity', 'AAPL US Equity', 'MSFT US Equity',
];

export function TickerTape() {
  useTick(2);
  return (
    <div className="tape hide-print" aria-label="Market ticker">
      <div className="tape-track">
        {[0, 1].map((rep) =>
          TAPE.map((id) => {
            const d = engine.get(id);
            const q = engine.quote(id);
            if (!d || !q) return null;
            const y = d.quote === 'yield';
            const cls = q.chg > 0 ? 'up' : q.chg < 0 ? 'dn' : 'muted';
            return (
              <span
                key={`${rep}:${id}`}
                className="tape-item"
                onClick={() => execute(terminal.get().active, `${id} GP`)}
                aria-hidden={rep === 1}
              >
                <span className="t">{d.ticker}</span>
                <span className="p">{fmtNum(q.last, Math.min(d.dec, 4))}</span>
                <span className={cls}>{y ? `${fmtBp(q.chg)}bp` : fmtPct(q.pct)}</span>
              </span>
            );
          }),
        )}
      </div>
    </div>
  );
}
