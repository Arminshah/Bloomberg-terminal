import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtNum } from '../core/format';
import { engine } from '../data/market';
import { alignedReturns, betaTo } from '../data/analytics';
import { regress } from '../finance/stats';
import { resolveSecurity } from '../data/registry';
import type { FnProps } from '../terminal/types';

const BENCH: Record<string, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };
const PERIODS = [
  { n: 1, label: '6M', bars: 126 },
  { n: 2, label: '1Y', bars: 252 },
  { n: 3, label: '2Y', bars: 504 },
  { n: 4, label: '5Y', bars: 1260 },
];

export function BETA({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(3);
  const [bench, setBench] = useState(s.id === 'SPX Index' ? 'INDU Index' : BENCH[s.region] ?? 'SPX Index');
  const [weekly, setWeekly] = useState(false);
  const [text, setText] = useState('');
  const bars = PERIODS[tab - 1].bars;
  const data = useMemo(() => {
    const { rets } = alignedReturns([bench, s.id], bars);
    let x = rets[0];
    let y = rets[1];
    if (weekly) {
      const agg = (a: number[]) => {
        const out: number[] = [];
        for (let i = 0; i + 5 <= a.length; i += 5) out.push(a.slice(i, i + 5).reduce((p, r) => p * (1 + r), 1) - 1);
        return out;
      };
      x = agg(x);
      y = agg(y);
    }
    return { x, y, reg: regress(x, y) };
  }, [bench, s.id, bars, weekly]);
  const reg = data.reg;
  const adj = 0.67 * reg.beta + 0.33;
  const pts = data.x.map((v, i) => ({ x: v * 100, y: data.y[i] * 100 }));
  const xs = pts.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const line = [
    { x: lo, y: (reg.alpha + reg.beta * (lo / 100)) * 100 },
    { x: hi, y: (reg.alpha + reg.beta * (hi / 100)) * 100 },
  ];
  const b2 = betaTo(s.id, bench, 252);
  return (
    <div>
      <FnHeader code="BETA" title="Historical Beta" sec={s} sub={`vs ${bench}`} tabs={PERIODS.map((p) => ({ n: p.n, label: p.label }))} tab={tab} onTab={setTab} actions={[{ n: 11, label: weekly ? 'Weekly' : 'Daily', on: weekly, onClick: () => setWeekly((w) => !w) }]} />
      <QuoteStrip sec={s} />
      <div className="chart-tools">
        <label className="fld" htmlFor="beta-bench">
          Relative index
        </label>
        <input
          id="beta-bench"
          className="inp"
          value={text}
          placeholder={bench}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const r = resolveSecurity(text);
              if (r && r.id !== s.id) setBench(r.id);
              setText('');
            }
          }}
        />
        <span className="muted">{weekly ? 'Weekly' : 'Daily'} returns · {data.x.length} observations</span>
      </div>
      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)' }}>
        <Section title={`${s.ticker} vs ${engine.get(bench)?.ticker} (% returns)`}>
          <XYChart
            height={340}
            legend={false}
            series={[
              { label: 'Obs', color: '#ffb547', kind: 'scatter', points: pts },
              { label: 'Fit', color: '#45d3e6', points: line, width: 2 },
            ]}
            xFormat={(v) => `${fmtNum(v, 1)}%`}
            yFormat={(v) => `${fmtNum(v, 1)}%`}
            refLines={[{ y: 0, color: '#3a3a3a' }, { x: 0, color: '#3a3a3a' }]}
          />
        </Section>
        <Section title="Regression">
          <KV
            items={[
              ['Raw beta', <span key="b" className="white b">{fmtNum(reg.beta, 3)}</span>],
              ['Adjusted beta', fmtNum(adj, 3)],
              ['Alpha (intercept)', `${fmtNum(reg.alpha * 100, 4)}%`],
              ['R²', fmtNum(reg.r2, 3)],
              ['Correlation', fmtNum(reg.corr, 3)],
              ['Std error of beta', fmtNum(reg.stdErr, 3)],
              ['Observations', String(reg.n)],
              ['1Y daily beta', fmtNum(b2.beta, 3)],
            ]}
          />
          <div className="note">Adjusted beta = 0.67 × raw + 0.33 × 1.0</div>
        </Section>
      </div>
    </div>
  );
}
