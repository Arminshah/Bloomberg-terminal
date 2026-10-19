import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { IexHistoryNotice } from '../components/IexHistoryNotice';
import { ChartView } from '../components/chart/ChartView';
import { COMPARE_COLORS, type ChartOptions, type ChartType, type LowerKind, type Overlay } from '../components/chart/PriceChart';
import { createStore } from '../core/store';
import { fmtDay, fmtTime } from '../core/format';
import { engine, useHistoryVersion, useQuote, useTick } from '../data/market';
import { IEX_PROVIDER } from '../data/live/iex-engine';
import { resolveSecurity, searchSecurities } from '../data/registry';
import { aggregate, barsSince, type Periodicity, type Series } from '../data/series';
import { horizonStart, type Horizon } from '../data/analytics';
import type { SecurityDef } from '../data/types';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { styledMnemonic } from '../terminal/legacy';
import { DateRangeFields } from '../components/DateRange';
import { windowBars } from '../terminal/daterange';

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

function ChartScreen({ sec, intraday, initialPeriod, style, mnemonic }: { sec: SecurityDef; intraday: boolean; initialPeriod?: string; style?: ChartType; mnemonic?: string }) {
  const panel = usePanelId();
  const iex = useQuote(sec.id)?.provider === IEX_PROVIDER;
  const store = intraday ? intradayPrefs : prefs;
  const saved = store.use((s) => s);
  // GPO and GPC draw this chart as bars or candles without changing the style other charts open with.
  const [ownType, setOwnType] = useState<ChartType | undefined>(style);
  const p = useMemo(() => (ownType ? { ...saved, type: ownType } : saved), [ownType, saved]);
  const setType = (type: ChartType) => (ownType ? setOwnType(type) : store.set((s) => ({ ...s, type })));
  const [period, setPeriod] = useState(initialPeriod ?? '1Y');
  // Dates typed in the amber range boxes replace the period tab until a tab is chosen again.
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [freq, setFreq] = useState<Periodicity>('D');
  const [compare, setCompare] = useState<string[]>([]);
  const tick = useTick(intraday ? 1 : freq === 'D' ? 1_000_000 : 5);
  // The daily chart barely re-renders on ticks; this brings in a history that arrives after the first render.
  const history = useHistoryVersion();

  const daily = engine.daily(sec.id);
  const series = useMemo(() => {
    if (intraday) return engine.intraday(sec.id);
    return freq === 'D' ? daily : aggregate(daily, freq);
    // Aggregated series are rebuilt every few ticks so the last bar stays live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sec.id, intraday, freq, daily, tick, history]);

  const compareSeries = useMemo(
    () =>
      compare.map((id, i) => {
        const d = engine.get(id)!;
        const base = intraday ? engine.intraday(id) : engine.daily(id);
        return { label: d.ticker, series: !intraday && freq !== 'D' ? aggregate(base, freq) : base, color: COMPARE_COLORS[i % COMPARE_COLORS.length] };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compare, intraday, freq, tick, history],
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
      initialBars: intraday ? 100000 : custom ? Math.max(5, windowBars(series.t, custom.from, custom.to).count) : barsFor(period, freq, daily),
      initialEnd: !intraday && custom ? windowBars(series.t, custom.from, custom.to).after : undefined,
      timeLabel: (t) => fmtTime(t, false),
      dateLabel: (t) => fmtDay(t),
    }),
    [p, sec, intraday, compareSeries, period, freq, daily, series, custom],
  );

  const toggleStudy = (id: string) =>
    store.set((s) => ({ ...s, studies: s.studies.includes(id) ? s.studies.filter((x) => x !== id) : [...s.studies, id] }));
  const toggleLower = (k: LowerKind) =>
    store.set((s) => ({ ...s, lower: s.lower.includes(k) ? s.lower.filter((x) => x !== k) : [...s.lower, k] }));

  const tabs = intraday || iex ? undefined : PERIODS.map((x) => ({ n: x.n, label: x.label }));
  const currentTab = custom ? undefined : PERIODS.find((x) => x.id === period)?.n;
  // The range the boxes show: the typed dates, or the period's first bar to the latest one.
  const shownRange = useMemo(() => {
    if (custom) return custom;
    const n = series.length;
    if (!n) return null;
    const bars = Math.min(n, barsFor(period, freq, daily));
    return { from: series.t[n - bars], to: series.t[n - 1] };
  }, [custom, series, period, freq, daily]);
  return (
    <div className="fn-fill">
      <FnHeader
        code={intraday ? 'INTRADAY' : 'CHART'}
        mnemonic={mnemonic}
        title={intraday ? 'Intraday Chart' : 'Price Chart'}
        sec={sec}
        tabs={tabs}
        tab={currentTab}
        onTab={(n) => {
          const per = PERIODS.find((x) => x.n === n)!;
          if (per.id === '1D') execute(panel, `${sec.id} INTRADAY`);
          else {
            setCustom(null);
            setPeriod(per.id);
          }
        }}
        actions={[
          ...(iex && !intraday ? [{ n: 94, label: 'Intraday', onClick: () => execute(panel, `${sec.id} INTRADAY`) }] : []),
          ...(intraday ? [{ n: 95, label: 'Daily', onClick: () => execute(panel, `${sec.id} CHART`) }] : []),
          { n: 96, label: 'Table', onClick: () => execute(panel, `${sec.id} HISTORY`) },
          { n: 97, label: 'Compare', onClick: () => execute(panel, `${sec.id} RETURNS`) },
        ]}
      />
      <QuoteStrip sec={sec} />
      {iex && <IexHistoryNotice intraday={intraday} />}
      <div className="chart-tools">
        {!intraday && shownRange && <DateRangeFields from={shownRange.from} to={shownRange.to} onChange={(from, to) => setCustom({ from, to })} />}
        <span className="seg" role="group" aria-label="Chart type">
          {TYPES.map((t) => (
            <button key={t.id} type="button" className={p.type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>
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
      <ChartView
        series={series}
        options={options}
        resetKey={`${sec.id}|${period}|${freq}|${intraday}|${custom ? `${custom.from}-${custom.to}` : ''}`}
        readout={{ unit: sec.quote === 'yield' ? 'yield %' : sec.ccy, periodicity: intraday ? 'Intraday' : freq === 'D' ? 'Daily' : freq === 'W' ? 'Weekly' : 'Monthly' }}
      />
    </div>
  );
}

/** Style words CHART accepts: BAR (GPO) and CANDLE (GPC), with LINE and MOUNTAIN for completeness. */
const STYLE_WORDS: Record<string, ChartType> = { BAR: 'bar', OHLC: 'bar', CANDLE: 'candle', LINE: 'line', MOUNTAIN: 'mountain' };

export function GP({ sec, route }: FnProps) {
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  // CHART AAPL 1D is today's intraday chart, the screen the 1) 1D tab opens.
  if (words.includes('1D')) return <ChartScreen key={sec!.id} sec={sec!} intraday />;
  const initial = PERIODS.find((p) => words.includes(p.id))?.id;
  const style = words.map((w) => STYLE_WORDS[w]).find(Boolean);
  const { mnemonic } = styledMnemonic('CHART', route.args);
  return <ChartScreen key={`${sec!.id}|${style ?? ''}`} sec={sec!} intraday={false} initialPeriod={initial} style={style} mnemonic={style === 'bar' || style === 'candle' ? mnemonic : undefined} />;
}

export function GIP({ sec }: FnProps) {
  return <ChartScreen key={sec!.id} sec={sec!} intraday />;
}
