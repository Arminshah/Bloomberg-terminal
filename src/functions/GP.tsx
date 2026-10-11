import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { ChartView } from '../components/chart/ChartView';
import { COMPARE_COLORS, type ChartOptions, type ChartType, type LowerKind, type Overlay } from '../components/chart/PriceChart';
import { createStore } from '../core/store';
import { fmtDay, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { resolveSecurity, searchSecurities } from '../data/registry';
import { aggregate, barsSince, type Periodicity, type Series } from '../data/series';
import { horizonStart, type Horizon } from '../data/analytics';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

interface ChartPrefs {
  type: ChartType;
  studies: string[];
  lower: LowerKind[];
}

const prefs = createStore<ChartPrefs>({ type: 'mountain', studies: ['SMA50'], lower: ['VOL'] }, 'chart-prefs', 1);
const intradayPrefs = createStore<ChartPrefs>({ type: 'line', studies: [], lower: ['VOL'] }, 'chart-prefs-intraday', 1);

const STUDIES: { id: string; label: string; ov: Overlay }[] = [
  { id: 'SMA20', label: 'SMA 20', ov: { kind: 'SMA', n: 20, color: '#45d3e6' } },
  { id: 'SMA50', label: 'SMA 50', ov: { kind: 'SMA', n: 50, color: '#d77bff' } },
  { id: 'SMA200', label: 'SMA 200', ov: { kind: 'SMA', n: 200, color: '#ffd23f' } },
  { id: 'EMA20', label: 'EMA 20', ov: { kind: 'EMA', n: 20, color: '#7aa2ff' } },
  { id: 'BOLL', label: 'BOLL', ov: { kind: 'BOLL', n: 20, color: '#bdbdbd' } },
];

const PERIODS = [
  { n: 1, id: '1D', label: '1D' },
  { n: 2, id: '1M', label: '1M', bars: 21 },
  { n: 3, id: '3M', label: '3M', bars: 63 },
  { n: 4, id: '6M', label: '6M', bars: 126 },
  { n: 5, id: 'YTD', label: 'YTD' },
  { n: 6, id: '1Y', label: '1Y', bars: 252 },
  { n: 7, id: '2Y', label: '2Y', bars: 504 },
  { n: 8, id: '5Y', label: '5Y', bars: 1260 },
  { n: 9, id: 'MAX', label: 'Max', bars: 100000 },
];

const TYPES: { id: ChartType; label: string }[] = [
  { id: 'line', label: 'Line' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'candle', label: 'Candle' },
  { id: 'bar', label: 'Bar' },
];

const PERIOD_HORIZON: Record<string, Horizon | undefined> = { '1M': '1M', '3M': '3M', '6M': '6M', YTD: 'YTD', '1Y': '1Y', '2Y': '2Y', '5Y': '5Y' };

/** Visible bars for a period, measured in calendar time from today. */
function barsFor(period: string, freq: Periodicity, daily: Series): number {
  const h = PERIOD_HORIZON[period];
  const bars = h ? barsSince(daily, horizonStart(h)) : daily.length;
  if (freq === 'W') return Math.max(8, Math.ceil(bars / 5) + 1);
  if (freq === 'M') return Math.max(6, Math.ceil(bars / 21) + 1);
  return Math.max(5, bars);
}

function CompareBox({ sec, list, setList }: { sec: SecurityDef; list: string[]; setList: (l: string[]) => void }) {
  const [text, setText] = useState('');
  const hits = useMemo(() => (text.trim() ? searchSecurities(text, 6) : []), [text]);
  const add = (id: string) => {
    if (id !== sec.id && !list.includes(id) && list.length < 5) setList([...list, id]);
    setText('');
  };
  return (
    <span style={{ position: 'relative', display: 'inline-flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {list.map((id, i) => (
        <span key={id} className="cmp-chip" style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>
          {engine.get(id)?.ticker ?? id}
          <button type="button" aria-label={`Remove ${id}`} onClick={() => setList(list.filter((x) => x !== id))}>
            ×
          </button>
        </span>
      ))}
      <input
        className="inp"
        style={{ width: 120 }}
        placeholder="+ Compare"
        aria-label="Add comparison security"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const r = resolveSecurity(text) ?? hits[0]?.def;
            if (r) add(r.id);
          }
          if (e.key === 'Escape') setText('');
        }}
      />
      {hits.length > 0 && (
        <div className="ac" style={{ left: 0, right: 'auto', minWidth: 300 }}>
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
  );
}

function ChartScreen({ sec, intraday, initialPeriod }: { sec: SecurityDef; intraday: boolean; initialPeriod?: string }) {
  const panel = usePanelId();
  const store = intraday ? intradayPrefs : prefs;
  const p = store.use((s) => s);
  const [period, setPeriod] = useState(initialPeriod ?? '1Y');
  const [freq, setFreq] = useState<Periodicity>('D');
  const [compare, setCompare] = useState<string[]>([]);
  const tick = useTick(intraday ? 1 : freq === 'D' ? 1_000_000 : 5);

  const daily = engine.daily(sec.id);
  const series = useMemo(() => {
    if (intraday) return engine.intraday(sec.id);
    return freq === 'D' ? daily : aggregate(daily, freq);
    // Aggregated series are rebuilt every few ticks so the last bar stays live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec.id, intraday, freq, daily, tick]);

  const compareSeries = useMemo(
    () =>
      compare.map((id, i) => {
        const d = engine.get(id)!;
        const base = intraday ? engine.intraday(id) : engine.daily(id);
        return { label: d.ticker, series: !intraday && freq !== 'D' ? aggregate(base, freq) : base, color: COMPARE_COLORS[i % COMPARE_COLORS.length] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compare, intraday, freq, tick],
  );

  const options: ChartOptions = useMemo(
    () => ({
      type: p.type,
      dec: sec.dec,
      label: sec.quote === 'yield' ? `${sec.ticker} Yield` : `${sec.ticker} Last Price`,
      intraday,
      overlays: STUDIES.filter((st) => p.studies.includes(st.id)).map((st) => st.ov),
      lower: p.lower.filter((k) => k !== 'VOL' || (series.length > 0 && series.v[series.length - 1] + series.v[Math.max(0, series.length - 2)] > 0)),
      compare: compareSeries,
      percent: compareSeries.length > 0,
      annotate: true,
      refLine: intraday ? { value: engine.prevClose(sec.id), label: 'Prev' } : undefined,
      initialBars: intraday ? 100000 : barsFor(period, freq, daily),
      timeLabel: (t) => fmtTime(t, false),
      dateLabel: (t) => fmtDay(t),
    }),
    [p, sec, intraday, compareSeries, period, freq, daily, series],
  );

  const toggleStudy = (id: string) =>
    store.set((s) => ({ ...s, studies: s.studies.includes(id) ? s.studies.filter((x) => x !== id) : [...s.studies, id] }));
  const toggleLower = (k: LowerKind) =>
    store.set((s) => ({ ...s, lower: s.lower.includes(k) ? s.lower.filter((x) => x !== k) : [...s.lower, k] }));

  const tabs = intraday ? undefined : PERIODS.map((x) => ({ n: x.n, label: x.label }));
  const currentTab = PERIODS.find((x) => x.id === period)?.n;
  return (
    <div className="fn-fill">
      <FnHeader
        code={intraday ? 'GIP' : 'GP'}
        title={intraday ? 'Intraday Price Graph' : 'Price Graph'}
        sec={sec}
        sub={sec.name}
        tabs={tabs}
        tab={currentTab}
        onTab={(n) => {
          const per = PERIODS.find((x) => x.n === n)!;
          if (per.id === '1D') execute(panel, `${sec.id} GIP`);
          else setPeriod(per.id);
        }}
        actions={[
          ...(intraday ? [{ n: 95, label: 'Daily', onClick: () => execute(panel, `${sec.id} GP`) }] : []),
          { n: 96, label: 'Table', onClick: () => execute(panel, `${sec.id} HP`) },
          { n: 97, label: 'Compare', onClick: () => execute(panel, `${sec.id} COMP`) },
        ]}
      />
      <QuoteStrip sec={sec} />
      <div className="chart-tools">
        <span className="seg" role="group" aria-label="Chart type">
          {TYPES.map((t) => (
            <button key={t.id} type="button" className={p.type === t.id ? 'on' : ''} onClick={() => store.set((s) => ({ ...s, type: t.id }))}>
              {t.label}
            </button>
          ))}
        </span>
        {!intraday && (
          <span className="seg" role="group" aria-label="Frequency">
            {(['D', 'W', 'M'] as Periodicity[]).map((f) => (
              <button key={f} type="button" className={freq === f ? 'on' : ''} onClick={() => setFreq(f)}>
                {f === 'D' ? 'Daily' : f === 'W' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
          </span>
        )}
        <span className="row" style={{ gap: 3 }}>
          {STUDIES.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`chip-btn${p.studies.includes(st.id) ? ' on' : ''}`}
              style={p.studies.includes(st.id) ? { background: st.ov.color } : undefined}
              onClick={() => toggleStudy(st.id)}
            >
              {st.label}
            </button>
          ))}
          {(['VOL', 'RSI', 'MACD'] as LowerKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip-btn${p.lower.includes(k) ? ' on' : ''}`}
              style={p.lower.includes(k) ? { background: '#9a9a9a' } : undefined}
              onClick={() => toggleLower(k)}
            >
              {k === 'VOL' ? 'Volume' : k}
            </button>
          ))}
        </span>
        <CompareBox sec={sec} list={compare} setList={setCompare} />
      </div>
      <ChartView series={series} options={options} resetKey={`${sec.id}|${period}|${freq}|${intraday}`} />
    </div>
  );
}

export function GP({ sec, route }: FnProps) {
  const arg = route.args?.toUpperCase();
  const initial = PERIODS.find((p) => p.id === arg)?.id;
  return <ChartScreen key={sec!.id} sec={sec!} intraday={false} initialPeriod={initial} />;
}

export function GIP({ sec }: FnProps) {
  return <ChartScreen key={sec!.id} sec={sec!} intraday />;
}
