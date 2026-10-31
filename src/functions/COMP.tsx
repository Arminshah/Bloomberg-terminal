import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { ChartView } from '../components/chart/ChartView';
import { COMPARE_COLORS, type ChartOptions } from '../components/chart/PriceChart';
import { Chg, SecLink, Section } from '../components/cells';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { closeAt, horizonStart, type Horizon } from '../data/analytics';
import { barsSince } from '../data/series';
import { resolveSecurity, searchSecurities } from '../data/registry';
import type { FnProps } from '../terminal/types';

const DEFAULT_BENCH: Record<string, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };
const H: { n: number; h: Horizon }[] = [
  { n: 1, h: '1M' },
  { n: 2, h: '3M' },
  { n: 3, h: '6M' },
  { n: 4, h: 'YTD' },
  { n: 5, h: '1Y' },
  { n: 6, h: '2Y' },
  { n: 7, h: '5Y' },
];

export function COMP({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(5);
  const bench = s.cls === 'index' ? 'INDU Index' : s.cls === 'fx' ? 'DXY Curncy' : s.cls === 'crypto' ? 'XETUSD Curncy' : s.cls === 'commodity' ? 'SPX Index' : DEFAULT_BENCH[s.region];
  const [others, setOthers] = useState<string[]>(() => [bench === s.id ? 'SPX Index' : bench, ...(s.eq ? [] : [])].filter((x) => x !== s.id));
  const [text, setText] = useState('');
  const tick = useTick(10);
  const ids = [s.id, ...others];
  const daily = engine.daily(s.id);
  const h = H[tab - 1];
  const initialBars = useMemo(() => barsSince(daily, horizonStart(h.h)), [daily, h.h]);
  const options: ChartOptions = useMemo(
    () => ({
      type: 'line',
      dec: s.dec,
      label: s.ticker,
      intraday: false,
      overlays: [],
      lower: [],
      compare: others.map((id, i) => ({ label: engine.get(id)!.ticker, series: engine.daily(id), color: COMPARE_COLORS[i % COMPARE_COLORS.length] })),
      percent: true,
      annotate: false,
      initialBars,
      dateLabel: (t) => fmtDay(t),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [others, initialBars, s, tick],
  );
  const hits = text.trim() ? searchSecurities(text, 6) : [];
  const add = (id: string) => {
    if (!ids.includes(id) && others.length < 5) setOthers([...others, id]);
    setText('');
  };
  const start = horizonStart(h.h);
  return (
    <div className="fn-fill">
      <FnHeader code="RETURNS" title="Comparative Returns" sec={s} tabs={H.map((x) => ({ n: x.n, label: x.h }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        {others.map((id, i) => (
          <span key={id} className="cmp-chip" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
            {engine.get(id)!.ticker}
            <button type="button" aria-label={`Remove ${id}`} onClick={() => setOthers(others.filter((x) => x !== id))}>
              ×
            </button>
          </span>
        ))}
        <span style={{ position: 'relative' }}>
          <input
            className="inp"
            placeholder="+ Add security"
            aria-label="Add security to compare"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const r = resolveSecurity(text) ?? hits[0]?.def;
                if (r) add(r.id);
              }
            }}
          />
          {hits.length > 0 && (
            <div className="ac ac-field" style={{ left: 0, right: 'auto', minWidth: 300 }}>
              {hits.map(({ def }) => (
                <div key={def.id} className="ac-item" onMouseDown={(e) => { e.preventDefault(); add(def.id); }}>
                  <span className="k">{def.id}</span>
                  <span>{def.name}</span>
                  <span />
                </div>
              ))}
            </div>
          )}
        </span>
        <span className="muted">Rebased to 0% at the first visible date; scroll to zoom, drag to pan.</span>
      </div>
      <ChartView series={daily} options={options} resetKey={`${tab}|${others.join()}`} />
      <Section title={`Price return since ${fmtDay(start)} (no dividends)`}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Security</th>
              <th className="num">Start</th>
              <th className="num">Last</th>
              <th className="num">Return</th>
              <th className="num">vs {engine.get(ids[0])!.ticker}</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id, i) => {
              const d = engine.get(id)!;
              const s0 = closeAt(engine.daily(id), start);
              const last = engine.quote(id)!.last;
              const ret = d.quote === 'yield' ? (last - s0) * 100 : (last / s0 - 1) * 100;
              const base0 = closeAt(engine.daily(ids[0]), start);
              const baseRet = (engine.quote(ids[0])!.last / base0 - 1) * 100;
              return (
                <tr key={id}>
                  <td>
                    <span style={{ color: i === 0 ? '#ffb547' : COMPARE_COLORS[(i - 1) % COMPARE_COLORS.length] }}>■ </span>
                    <SecLink id={id}>{d.ticker}</SecLink>
                  </td>
                  <td className="num">{fmtNum(s0, d.dec)}</td>
                  <td className="num">{fmtNum(last, d.dec)}</td>
                  <td className="num">{d.quote === 'yield' ? <><Chg v={ret} dec={0} /> bp</> : <Chg v={ret} pct />}</td>
                  <td className="num">
                    {i === 0 ? null : d.quote === 'yield' ? (
                      <span className="muted" title="Not meaningful: a yield's change in basis points is not a return">NM</span>
                    ) : (
                      <Chg v={ret - baseRet} pct />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
