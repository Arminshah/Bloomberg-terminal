import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useHistoryVersion } from '../data/market';
import { betaTo } from '../data/analytics';
import { regress } from '../finance/stats';
import { adjustedBeta, defaultBenchmark, FREQUENCY_LABEL, lookbackStart, pairedReturns, periodCloses, type BetaFrequency } from '../finance/beta';
import { resolveSecurity } from '../data/registry';
import type { FnProps } from '../terminal/types';

const PERIODS = [
  { n: 1, label: '6M', months: 6 },
  { n: 2, label: '1Y', months: 12 },
  { n: 3, label: '2Y', months: 24 },
  { n: 4, label: '5Y', months: 60 },
];
const FREQUENCIES: { n: number; freq: BetaFrequency }[] = [{ n: 11, freq: 'D' }, { n: 12, freq: 'W' }, { n: 13, freq: 'M' }];
const PERIOD_NOTE: Record<BetaFrequency, string> = {
  D: 'trading days both lines have a close on',
  W: 'weeks ending Friday (the week’s last session when Friday is a holiday)',
  M: 'calendar months, on each month’s last session',
};

/** Bloomberg BETA defaults: two years of weekly returns against the security's local index. */
export function BETA({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(3);
  const [bench, setBench] = useState(() => defaultBenchmark(s, (id) => !!engine.get(id)));
  const [freq, setFreq] = useState<BetaFrequency>('W');
  const [text, setText] = useState('');
  const months = PERIODS[tab - 1].months;
  const history = useHistoryVersion();
  const data = useMemo(() => {
    const b = engine.daily(bench);
    const y = engine.daily(s.id);
    const benchYield = engine.get(bench)?.quote === 'yield';
    const secYield = s.quote === 'yield';
    // Both lines end on the earlier of their last bars, so neither has a period the other cannot have yet.
    const to = b.length && y.length ? Math.min(b.t[b.length - 1], y.t[y.length - 1]) : NaN;
    const from = Number.isFinite(to) ? lookbackStart(to, months) : NaN;
    const r = Number.isFinite(to)
      ? pairedReturns(periodCloses(b, freq, from, to, benchYield), periodCloses(y, freq, from, to, secYield), benchYield, secYield)
      : { dates: [], x: [], y: [] };
    return { ...r, from, to, reg: regress(r.x, r.y) };
    // Recomputed when daily history arrives, which can be after the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bench, s.id, months, freq, history]);
  const reg = data.reg;
  const adj = adjustedBeta(reg.beta);
  const pts = data.x.map((v, i) => ({ x: v * 100, y: data.y[i] * 100 }));
  const xs = pts.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const line = [
    { x: lo, y: (reg.alpha + reg.beta * (lo / 100)) * 100 },
    { x: hi, y: (reg.alpha + reg.beta * (hi / 100)) * 100 },
  ];
  const b2 = betaTo(s.id, bench, 252);
  const label = FREQUENCY_LABEL[freq];
  const per = { D: 'day', W: 'week', M: 'month' }[freq];
  return (
    <div>
      <FnHeader code="BETA" title="Historical Beta" sec={s} sub={`vs ${bench} · ${PERIODS[tab - 1].label} ${label.toLowerCase()}`} tabs={PERIODS.map((p) => ({ n: p.n, label: p.label }))} tab={tab} onTab={setTab}
        actions={FREQUENCIES.map((f) => ({ n: f.n, label: FREQUENCY_LABEL[f.freq], on: freq === f.freq, onClick: () => setFreq(f.freq) }))} />
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
        <span className="muted">
          {label} returns · {data.x.length} observations{data.dates.length ? ` · ${fmtDay(data.from)} to ${fmtDay(data.to)}` : ''}
        </span>
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
              [`Alpha (intercept, per ${per})`, `${fmtNum(reg.alpha * 100, 4)}%`],
              ['R²', fmtNum(reg.r2, 3)],
              ['Correlation', fmtNum(reg.corr, 3)],
              ['Std error of beta', fmtNum(reg.stdErr, 3)],
              ['Observations', String(reg.n)],
              ['1Y daily beta', fmtNum(b2.beta, 3)],
            ]}
          />
          <div className="note">
            Adjusted beta = 0.67 × raw + 0.33 × 1.0. {label} simple returns over {PERIOD_NOTE[freq]}, from each period’s last available close; a period counts only when both lines have a close in it. Yields use changes.
          </div>
        </Section>
      </div>
    </div>
  );
}
