import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { IexHistoryNotice } from '../components/IexHistoryNotice';
import { Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { IEX_PROVIDER } from '../data/live/iex-engine';
import { aggregate, type Periodicity } from '../data/series';
import { freshnessOf } from '../data/freshness';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const RANGES = [
  { n: 1, id: '1M', days: 31 },
  { n: 2, id: '3M', days: 92 },
  { n: 3, id: '6M', days: 183 },
  { n: 4, id: '1Y', days: 366 },
  { n: 5, id: '2Y', days: 731 },
  { n: 6, id: '5Y', days: 1827 },
  { n: 7, id: '10Y', days: 3660 },
];

export function HP({ sec }: FnProps) {
  const s = sec!;
  const q = useQuote(s.id);
  const iex = q?.provider === IEX_PROVIDER;
  const panel = usePanelId();
  const [range, setRange] = useState(2);
  const [per, setPer] = useState<Periodicity>('D');
  const tick = useTick(per === 'D' ? 3 : 10);
  const yld = s.quote === 'yield';
  const rows = useMemo(() => {
    const d = engine.daily(s.id);
    const series = aggregate(d, per);
    const from = engine.now() - RANGES[range - 1].days * 86_400_000;
    const out: { t: number; o: number; h: number; l: number; c: number; v: number; chg: number; pct: number }[] = [];
    for (let i = series.length - 1; i >= 0; i--) {
      if (series.t[i] < from) break;
      const prev = i > 0 ? series.c[i - 1] : iex ? NaN : series.o[i];
      out.push({ t: series.t[i], o: series.o[i], h: series.h[i], l: series.l[i], c: series.c[i], v: series.v[i], chg: series.c[i] - prev, pct: (series.c[i] / prev - 1) * 100 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, range, per, tick, iex]);
  const hi = Math.max(...rows.map((r) => r.h));
  const lo = Math.min(...rows.map((r) => r.l));
  const avg = rows.reduce((a, r) => a + r.c, 0) / Math.max(1, rows.length);
  const first = rows[rows.length - 1];
  const last = rows[0];
  const totalChg = last && first ? last.c - (first.c - first.chg) : NaN;
  const hasVol = rows.some((r) => r.v > 0);
  // The newest row is still moving only while the source streams the session.
  const fresh = q ? freshnessOf(q, s, Date.now()) : null;
  const liveSession = !!fresh && (fresh.label === 'REAL-TIME' || fresh.label === 'DELAYED' || fresh.label === 'DEMO DATA');
  const csv = () => [
    ['Date', 'Open', 'High', 'Low', 'Close', 'Change', 'Change %', 'Volume'],
    ...rows.map((r) => [fmtDay(r.t, true), r.o.toFixed(s.dec), r.h.toFixed(s.dec), r.l.toFixed(s.dec), r.c.toFixed(s.dec), r.chg.toFixed(s.dec + 1), r.pct.toFixed(3), r.v || '']),
  ];
  return (
    <div>
      <FnHeader
        code="HISTORY"
        title="Historical Price Table"
        sec={s}
        tabs={iex ? undefined : RANGES.map((r) => ({ n: r.n, label: r.id }))}
        tab={range}
        onTab={setRange}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${per}.csv`, csv)}
      />
      <QuoteStrip sec={s} />
      {iex && <IexHistoryNotice />}
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="Periodicity">
          {(['D', 'W', 'M', 'Q', 'Y'] as Periodicity[]).map((p) => (
            <button key={p} type="button" className={per === p ? 'on' : ''} onClick={() => setPer(p)}>
              {{ D: 'Daily', W: 'Weekly', M: 'Monthly', Q: 'Quarterly', Y: 'Yearly' }[p]}
            </button>
          ))}
        </span>
        <span>
          <span className="amber">High</span> {fmtNum(hi, s.dec)} <span className="amber">Low</span> {fmtNum(lo, s.dec)} <span className="amber">Avg</span> {fmtNum(avg, s.dec)}{' '}
          <span className="amber">Net chg</span> {yld ? <><Chg v={totalChg} bp /> bp</> : <Chg v={totalChg} dec={s.dec} />}{' '}
          {!yld && first && <Chg v={(totalChg / (first.c - first.chg)) * 100} pct />}
        </span>
        <span className="muted">{rows.length} rows</span>
      </div>
      <table className="tbl zebra">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Open</th>
            <th className="num">High</th>
            <th className="num">Low</th>
            <th className="num">{yld ? 'Yield' : 'Last'}</th>
            <th className="num">{yld ? 'Chg (bp)' : 'Net Chg'}</th>
            {!yld && <th className="num">% Chg</th>}
            {hasVol && <th className="num hide-m">Volume</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.t}>
              <td className={i === 0 ? 'amber' : ''}>
                {fmtDay(r.t)}
                {i === 0 && per === 'D' ? ' *' : ''}
              </td>
              <td className="num">{fmtNum(r.o, s.dec)}</td>
              <td className="num">{fmtNum(r.h, s.dec)}</td>
              <td className="num">{fmtNum(r.l, s.dec)}</td>
              <td className="num white">{fmtNum(r.c, s.dec)}</td>
              <td className="num">{yld ? <Chg v={r.chg} bp /> : <Chg v={r.chg} dec={s.dec} />}</td>
              {!yld && <td className="num">{<span className={r.pct > 0 ? 'up' : r.pct < 0 ? 'dn' : ''}>{fmtPct(r.pct)}</span>}</td>}
              {hasVol && <td className="num hide-m">{fmtBig(r.v)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {per === 'D' && rows.length > 0 && (
        <div className="note">
          {liveSession ? '* Current session, updating as prices arrive.' : `* Latest session as the source last reported it${fresh ? ` (${fresh.label.toLowerCase()})` : ''}.`}
        </div>
      )}
    </div>
  );
}
