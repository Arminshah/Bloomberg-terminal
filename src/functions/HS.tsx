import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { ChartView } from '../components/chart/ChartView';
import type { ChartOptions } from '../components/chart/PriceChart';
import { KV, Section } from '../components/cells';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { closeAt } from '../data/analytics';
import { resolveSecurity } from '../data/registry';
import { makeSeries } from '../data/series';
import { mean, percentile, stdev } from '../finance/stats';
import type { FnProps } from '../terminal/types';

const PAIRS: Record<string, string> = {
  'USGG10YR Index': 'USGG2YR Index', 'USGG30YR Index': 'USGG5YR Index', 'CL1 Comdty': 'CO1 Comdty', 'CO1 Comdty': 'CL1 Comdty',
  'GC1 Comdty': 'SI1 Comdty', 'SPX Index': 'NDX Index', 'GDBR10 Index': 'USGG10YR Index', 'XETUSD Curncy': 'XBTUSD Curncy',
};

const WINDOWS = [
  { n: 1, label: '3M', bars: 63 },
  { n: 2, label: '6M', bars: 126 },
  { n: 3, label: '1Y', bars: 252 },
  { n: 4, label: '2Y', bars: 504 },
  { n: 5, label: '5Y', bars: 1260 },
];

export function HS({ sec, route }: FnProps) {
  const a = sec!;
  const argSec = route.args ? resolveSecurity(route.args) : undefined;
  const [bId, setB] = useState(argSec?.id ?? PAIRS[a.id] ?? (a.region === 'Americas' ? 'SPX Index' : 'SXXP Index'));
  const [mode, setMode] = useState<'spread' | 'ratio'>(a.quote === 'yield' ? 'spread' : 'ratio');
  const [tab, setTab] = useState(3);
  const [text, setText] = useState('');
  const tick = useTick(10);
  const b = engine.get(bId)!;
  const yields = a.quote === 'yield' && b.quote === 'yield';
  const series = useMemo(() => {
    const sa = engine.daily(a.id);
    const sb = engine.daily(bId);
    const out = makeSeries(sa.length, sa.span);
    let w = 0;
    for (let i = 0; i < sa.length; i++) {
      const vb = i === sa.length - 1 ? engine.quote(bId)!.last : closeAt(sb, sa.t[i] + 43_200_000);
      const va = i === sa.length - 1 ? engine.quote(a.id)!.last : sa.c[i];
      if (!Number.isFinite(vb) || vb === 0) continue;
      const v = mode === 'spread' ? (va - vb) * (yields ? 100 : 1) : va / vb;
      out.t[w] = sa.t[i];
      out.o[w] = out.h[w] = out.l[w] = out.c[w] = v;
      out.v[w] = 0;
      w++;
    }
    out.length = w;
    return out;
  }, [a.id, bId, mode, yields, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const bars = WINDOWS[tab - 1].bars;
  const win = Array.from(series.c.subarray(Math.max(0, series.length - bars), series.length));
  const cur = win[win.length - 1];
  const mu = mean(win);
  const sd = stdev(win);
  const pctile = (win.filter((x) => x <= cur).length / win.length) * 100;
  const dec = mode === 'ratio' ? 4 : yields ? 1 : Math.max(2, a.dec);
  const options: ChartOptions = useMemo(
    () => ({ type: 'line', dec, label: mode === 'spread' ? `${a.ticker} − ${b.ticker}${yields ? ' (bp)' : ''}` : `${a.ticker} / ${b.ticker}`, intraday: false, overlays: [{ kind: 'BOLL', n: 20, color: '#8a8a8a' }], lower: [], compare: [], percent: false, annotate: true, initialBars: bars, dateLabel: (t) => fmtDay(t) }),
    [a.ticker, b.ticker, mode, yields, dec, bars],
  );
  return (
    <div className="fn-fill">
      <FnHeader
        code="HS"
        title="Historical Spread"
        sec={a}
        sub={`vs ${b.id}`}
        tabs={WINDOWS.map((w) => ({ n: w.n, label: w.label }))}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 11, label: 'Spread', on: mode === 'spread', onClick: () => setMode('spread') },
          { n: 12, label: 'Ratio', on: mode === 'ratio', onClick: () => setMode('ratio') },
        ]}
      />
      <div className="chart-tools">
        <label className="fld" htmlFor="hs-b">
          Versus
        </label>
        <input
          id="hs-b"
          className="inp"
          placeholder={b.id}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const r = resolveSecurity(text);
              if (r && r.id !== a.id) setB(r.id);
              setText('');
            }
          }}
        />
        <span>
          <span className="amber">Current</span> {fmtNum(cur, dec)} <span className="amber">Mean</span> {fmtNum(mu, dec)} <span className="amber">Z-score</span>{' '}
          <span className={Math.abs((cur - mu) / sd) > 2 ? 'yellow b' : ''}>{fmtNum((cur - mu) / sd, 2)}</span>
        </span>
      </div>
      <ChartView series={series} options={options} resetKey={`${bId}|${mode}|${tab}`} />
      <Section title={`Statistics over ${WINDOWS[tab - 1].label}`}>
        <div className="kv-cols">
          <KV items={[['Current', fmtNum(cur, dec)], ['Mean', fmtNum(mu, dec)], ['Std deviation', fmtNum(sd, dec)]]} />
          <KV items={[['High', fmtNum(Math.max(...win), dec)], ['Low', fmtNum(Math.min(...win), dec)], ['Percentile', `${fmtNum(pctile, 0)}%`]]} />
          <KV items={[['Z-score', fmtNum((cur - mu) / sd, 2)], ['5th pct', fmtNum(percentile(win, 0.05), dec)], ['95th pct', fmtNum(percentile(win, 0.95), dec)]]} />
        </div>
      </Section>
    </div>
  );
}
