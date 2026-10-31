import { useEffect, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { fmtBig, fmtNum, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import type { SecurityDef, Trade } from '../data/types';
import type { FnProps } from '../terminal/types';
import { priceSource, SimBadge } from '../components/Source';

export function TradeTape({ sec, rows = 200, minSize = 0 }: { sec: SecurityDef; rows?: number; minSize?: number }) {
  useTick(1);
  useEffect(() => engine.backfillTrades(sec.id), [sec.id]);
  const trades = engine.trades(sec.id).filter((t) => t.size >= minSize).slice(0, rows);
  const sizeDec = sec.cls === 'crypto' ? 4 : 0;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Time</th>
          <th className="num">Price</th>
          <th className="num">Size</th>
          <th>Exch</th>
          <th>Cond</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t: Trade, i) => {
          const next = trades[i + 1];
          const dir = next ? Math.sign(t.px - next.px) : 0;
          return (
            <tr key={`${t.t}:${i}`}>
              <td className="muted">{fmtTime(t.t)}</td>
              <td className={`num ${dir > 0 ? 'up' : dir < 0 ? 'dn' : 'white'}`}>
                {dir > 0 ? '▲ ' : dir < 0 ? '▼ ' : '  '}
                {fmtNum(t.px, sec.dec)}
              </td>
              <td className={`num ${t.size >= 10_000 && sec.cls === 'equity' ? 'yellow b' : ''}`}>{sizeDec ? fmtNum(t.size, sizeDec) : fmtNum(t.size, 0)}</td>
              <td className="muted">{t.venue}</td>
              <td className="muted">{t.cond}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Says what the prints on a line's tape are. */
export function TapeSource({ id, short }: { id: string; short?: boolean }) {
  switch (priceSource(id)) {
    case 'real': {
      const q = engine.quote(id);
      const provider = q?.provider ?? 'the source';
      if (/IEX/i.test(provider)) {
        return <>{short ? 'IEX snapshots only' : `${provider}: snapshots show the latest IEX trade; they do not provide a complete trade tape`}</>;
      }
      const kraken = engine.get(id)?.cls === 'crypto' && provider === 'Kraken';
      if (engine.get(id)?.cls === 'crypto' && !kraken) {
        return <>{short ? 'no prints' : `${provider} gives crypto volume over a rolling 24 hours, which does not show when trades happened, so there are no prints`}</>;
      }
      return (
        <>
          <span className="badge live">REAL</span>{' '}
          {short
            ? 'volume per update'
            : kraken
              ? "volume from Kraken's ticker, coins traded since 00:00 UTC: each print is the volume traded on Kraken between two polls, about 5 seconds apart, at the last price"
              : `volume from ${provider}, which reports totals rather than single trades: each print is the volume since the last update, at the last price`}
        </>
      );
    }
    case 'live':
      return (
        <>
          <span className="badge live">LIVE</span> {short ? 'feed prints' : 'trade prints from the streaming feed, newest first'}
        </>
      );
    case 'none':
      return <>{short ? 'no data' : 'No prices from the source yet'}</>;
    default:
      return short ? (
        <SimBadge />
      ) : (
        <>
          <SimBadge /> trade prints from the simulator
        </>
      );
  }
}

export function TAS({ sec }: FnProps) {
  const s = sec!;
  const [minSize, setMinSize] = useState(0);
  useTick(1);
  const trades = engine.trades(s.id);
  const iex = /IEX/i.test(engine.quote(s.id)?.provider ?? '');
  const vol = trades.reduce((a, t) => a + t.size, 0);
  const vwap = vol ? trades.reduce((a, t) => a + t.px * t.size, 0) / vol : NaN;
  return (
    <div>
      <FnHeader code="TRADES" title="Time and Sales" sec={s} sub={<TapeSource id={s.id} />} />
      <div className="chart-tools">
        <label className="fld" htmlFor="tas-min">
          Min size
        </label>
        <select id="tas-min" className="sel-inp" value={minSize} onChange={(e) => setMinSize(Number(e.target.value))}>
          {[0, 100, 500, 1000, 5000, 10000].map((v) => (
            <option key={v} value={v}>
              {v === 0 ? 'All' : fmtBig(v)}
            </option>
          ))}
        </select>
        <span>
          <span className="amber">Prints</span> {trades.length} <span className="amber">Volume</span> {fmtBig(vol)} <span className="amber">VWAP</span> {fmtNum(vwap, s.dec)}
        </span>
        <span className="muted">{iex ? 'IEX snapshots do not provide a complete trade tape.' : engine.realOnly ? 'AGG: volume added up between updates · CONS: all venues together · large prints in yellow' : 'I odd lot · F intermarket sweep · large prints in yellow'}</span>
      </div>
      <TradeTape sec={s} minSize={minSize} />
    </div>
  );
}
