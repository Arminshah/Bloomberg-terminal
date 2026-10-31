// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
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
import { realDividends, realSplits } from '../data/live/yahoo';
import { earningsHistory, peers } from '../data/fundamentals';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import { exportActions } from '../components/ExportActions';
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

// The 20-day average is pale green, as the report's GP captures draw it, so it differs from the first comparison line.
const STUDIES: { id: string; label: string; ov: Overlay }[] = [
  { id: 'SMA10', label: 'SMA 10', ov: { kind: 'SMA', n: 10, color: '#ffb066' } },
  { id: 'SMA20', label: 'SMA 20', ov: { kind: 'SMA', n: 20, color: '#b5f2a0' } },
  { id: 'SMA30', label: 'SMA 30', ov: { kind: 'SMA', n: 30, color: '#e0d9a0' } },
  { id: 'SMA50', label: 'SMA 50', ov: { kind: 'SMA', n: 50, color: '#d77bff' } },
  { id: 'SMA200', label: 'SMA 200', ov: { kind: 'SMA', n: 200, color: '#ffd23f' } },
  { id: 'EMA20', label: 'EMA 20', ov: { kind: 'EMA', n: 20, color: '#7aa2ff' } },
  { id: 'BOLL', label: 'BOLL', ov: { kind: 'BOLL', n: 20, color: '#bdbdbd' } },
];

/** The volume average the report's GP captures add under the price (Simple MA(15,0) on volume). */
const VOLUME_AVERAGE = { id: 'VMA15', label: 'Vol MA 15', n: 15 };

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
        className="inp gp-add"
        style={{ width: 120 }}
        placeholder="Add Data"
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
  );
}

/**
 * Edit Chart's side panel (TE02 04:43): a field to find a study, Normalize, and a tree of the charted securities, each
 * with tick boxes for its lines, a colour swatch and a red mark to take it off the chart.
 */
function EditChart({ sec, studies, lower, compare, onStudy, onLower, onRemove, onClose }: {
  sec: SecurityDef; studies: string[]; lower: LowerKind[]; compare: string[];
  onStudy: (id: string) => void; onLower: (k: LowerKind) => void; onRemove: (id: string) => void; onClose: () => void;
}) {
  const [find, setFind] = useState('');
  const all: { id: string; label: string; color: string; on: boolean; toggle: () => void }[] = [
    ...STUDIES.map((st) => ({ id: st.id, label: st.label, color: st.ov.color, on: studies.includes(st.id), toggle: () => onStudy(st.id) })),
    { id: VOLUME_AVERAGE.id, label: VOLUME_AVERAGE.label, color: '#9a9a9a', on: studies.includes(VOLUME_AVERAGE.id), toggle: () => onStudy(VOLUME_AVERAGE.id) },
    ...(['VOL', 'RSI', 'MACD'] as LowerKind[]).map((k) => ({ id: k, label: k === 'VOL' ? 'Volume' : k, color: '#9a9a9a', on: lower.includes(k), toggle: () => onLower(k) })),
  ];
  const shown = all.filter((x) => x.on);
  const offer = all.filter((x) => !x.on && (!find.trim() || x.label.toLowerCase().includes(find.trim().toLowerCase())));
  return (
    <aside className="gp-edit-panel" aria-label="Edit Chart">
      <div className="gp-edit-top">
        <input className="inp gp-find" aria-label="Browse data and studies" placeholder="Browse Data, Studies, Events, etc" value={find} onChange={(e) => setFind(e.target.value)} />
        <button type="button" className="gp-plain" aria-label="Close Edit Chart" onClick={onClose}>»</button>
      </div>
      <label className="gp-edit-row" title="Compared lines are drawn as the change since the first day shown">
        <input type="checkbox" checked={compare.length > 0} readOnly disabled={compare.length === 0} /> Normalize
      </label>
      <div className="gp-tree">
        <div className="gp-tree-sec white">▾ {sec.id}</div>
        <label className="gp-tree-line"><input type="checkbox" checked readOnly disabled /> <i style={{ background: '#e8e8e8' }} /> {sec.quote === 'yield' ? 'Yield' : 'Last Price'}</label>
        {shown.map((x) => (
          <label key={x.id} className="gp-tree-line">
            <input type="checkbox" aria-label={x.label} checked onChange={x.toggle} /> <i style={{ background: x.color }} /> {x.label}
          </label>
        ))}
        {compare.map((id, i) => (
          <div key={id}>
            <div className="gp-tree-sec white">
              ▾ {id}
              <button type="button" className="gp-remove" aria-label={`Remove ${id}`} title="Take off the chart" onClick={() => onRemove(id)}>⊗</button>
            </div>
            <label className="gp-tree-line"><input type="checkbox" checked readOnly disabled /> <i style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }} /> Last Price</label>
          </div>
        ))}
      </div>
      <div className="gp-tree-add">
        <div className="amber">Studies</div>
        {offer.map((x) => (
          <label key={x.id} className="gp-tree-line">
            <input type="checkbox" aria-label={x.label} checked={false} onChange={x.toggle} /> {x.label}
          </label>
        ))}
        {!offer.length && <div className="muted">{find.trim() ? 'No study by that name.' : 'Every study is on the chart.'}</div>}
      </div>
    </aside>
  );
}

/** The market each country's stocks are charted against in + Related Data: its main index. */
const HOME_INDEX: Record<string, string> = { US: 'SPX Index', GB: 'UKX Index', DE: 'DAX Index', FR: 'CAC Index', JP: 'NKY Index', HK: 'HSI Index', NL: 'AEX Index', CH: 'SMI Index', ES: 'IBEX Index', IT: 'FTSEMIB Index', CA: 'SPTSX Index', AU: 'AS51 Index', KR: 'KOSPI Index', TW: 'TWSE Index', IN: 'NIFTY Index' };

/** GP's "+ Related Data ▾" (TE02 01:55): Index & Sector and Peers, each a choice that adds the line to the chart. */
function RelatedData({ related, onAdd }: { related: { index?: SecurityDef; peers: SecurityDef[] }; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="gp-related">
      <button type="button" className="gp-plain" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>+ Related Data ▾</button>
      {open && (
        <div className="gp-related-menu" role="menu" onMouseLeave={() => setOpen(false)}>
          <div className="white">Index &amp; Sector</div>
          {related.index ? (
            <button type="button" role="menuitem" className="amber" onClick={() => { onAdd(related.index!.id); setOpen(false); }}>
              Relative Index ({related.index.name})
            </button>
          ) : <div className="muted">None for this security</div>}
          <div className="white">Peers</div>
          {related.peers.length ? related.peers.map((d) => (
            <button key={d.id} type="button" role="menuitem" className="amber" onClick={() => { onAdd(d.id); setOpen(false); }}>
              {d.name} ({d.id})
            </button>
          )) : <div className="muted">None in the app&apos;s list</div>}
        </div>
      )}
    </span>
  );
}

/** The key events GP marks: ex-dividend dates and splits from the price history's source, and earnings report dates. */
export function chartEvents(sec: SecurityDef): { t: number; kind: 'D' | 'S' | 'E' }[] {
  const DAY = 86_400_000;
  return [
    ...(realDividends.get(sec.id) ?? []).map((d) => ({ t: d.day * DAY, kind: 'D' as const })),
    ...(realSplits.get(sec.id) ?? []).map((x) => ({ t: x.day * DAY, kind: 'S' as const })),
    // A report date the source gives only as its quarter's end is left out.
    ...earningsHistory(sec).filter((e) => !e.dateUnknown && !e.approx && Number.isFinite(e.date)).map((e) => ({ t: e.date, kind: 'E' as const })),
  ].sort((a, b) => a.t - b.t);
}

function ChartScreen({ sec, intraday, initialPeriod, style, mnemonic, studies: addStudies = [], lower: addLower = [] }: { sec: SecurityDef; intraday: boolean; initialPeriod?: string; style?: ChartType; mnemonic?: string; studies?: string[]; lower?: LowerKind[] }) {
  const panel = usePanelId();
  const iex = useQuote(sec.id)?.provider === IEX_PROVIDER;
  const store = intraday ? intradayPrefs : prefs;
  const saved = store.use((s) => s);
  // GPO and GPC draw this chart as bars or candles without changing the style other charts open with.
  const [ownType, setOwnType] = useState<ChartType | undefined>(style);
  // RSI, MACD and BOLL add their study to this chart only; the saved studies stay as they are.
  const [ownStudies, setOwnStudies] = useState<string[]>(addStudies);
  const [ownLower, setOwnLower] = useState<LowerKind[]>(addLower);
  const p = useMemo(
    () => ({
      ...saved,
      type: ownType ?? saved.type,
      studies: [...new Set([...saved.studies, ...ownStudies])],
      lower: [...new Set([...saved.lower, ...ownLower])],
    }),
    [ownType, saved, ownStudies, ownLower],
  );
  const setType = (type: ChartType) => (ownType ? setOwnType(type) : store.set((s) => ({ ...s, type })));
  const [period, setPeriod] = useState(initialPeriod ?? '1Y');
  // Dates typed in the amber range boxes replace the period tab until a tab is chosen again.
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [freq, setFreq] = useState<Periodicity>('D');
  const [compare, setCompare] = useState<string[]>([]);
  // GP's Key Events: ex-dividend dates and splits from the price history's source, and the reported earnings dates.
  const [keyEvents, setKeyEvents] = useState(false);
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
      volumeAverage: p.studies.includes(VOLUME_AVERAGE.id) ? VOLUME_AVERAGE.n : undefined,
      lower: p.lower.filter((k) => k !== 'VOL' || (series.length > 0 && series.v[series.length - 1] + series.v[Math.max(0, series.length - 2)] > 0)),
      compare: compareSeries,
      percent: compareSeries.length > 0,
      annotate: true,
      refLine: intraday ? { value: engine.prevClose(sec.id), label: 'Prev' } : undefined,
      initialBars: intraday ? 100000 : custom ? Math.max(5, windowBars(series.t, custom.from, custom.to).count) : barsFor(period, freq, daily),
      initialEnd: !intraday && custom ? windowBars(series.t, custom.from, custom.to).after : undefined,
      events: !intraday && keyEvents ? chartEvents(sec) : undefined,
      timeLabel: (t) => fmtTime(t, false),
      dateLabel: (t) => fmtDay(t),
    }),
    [p, sec, intraday, compareSeries, period, freq, daily, series, custom, keyEvents],
  );

  const toggleStudy = (id: string) => {
    if (ownStudies.includes(id)) setOwnStudies(ownStudies.filter((x) => x !== id));
    if (ownStudies.includes(id) && !saved.studies.includes(id)) return;
    store.set((s) => ({ ...s, studies: s.studies.includes(id) ? s.studies.filter((x) => x !== id) : [...s.studies, id] }));
  };
  const toggleLower = (k: LowerKind) => {
    if (ownLower.includes(k)) setOwnLower(ownLower.filter((x) => x !== k));
    if (ownLower.includes(k) && !saved.lower.includes(k)) return;
    store.set((s) => ({ ...s, lower: s.lower.includes(k) ? s.lower.filter((x) => x !== k) : [...s.lower, k] }));
  };

  // The periods as GP's second row draws them (TE02 01:55): plain buttons, the chosen one blue; their numbers still
  // work with GO.
  const showPeriods = !(intraday || iex);
  const currentTab = custom ? undefined : PERIODS.find((x) => x.id === period)?.n;
  const pickPeriod = (n: number) => {
    const per = PERIODS.find((x) => x.n === n)!;
    if (per.id === '1D') execute(panel, `${sec.id} INTRADAY`);
    else {
      setCustom(null);
      setPeriod(per.id);
    }
  };
  useMenu('gp-periods', showPeriods ? PERIODS.map((x) => ({ n: x.n, label: x.label, run: () => pickPeriod(x.n) })) : []);
  // Edit Chart's studies open by themselves on a chart a study opened (RSI, MACD, BOLL), so the study shows as on.
  const [editing, setEditing] = useState(addStudies.length > 0 || addLower.length > 0);
  // Mov Avgs: the 50- and 200-day averages, as the box's default pair.
  const movAvgs = ['SMA50', 'SMA200'].every((id) => p.studies.includes(id));
  const setMovAvgs = (on: boolean) => {
    for (const id of ['SMA50', 'SMA200']) if (p.studies.includes(id) !== on) toggleStudy(id);
  };
  // + Related Data: the market's main index and the stock's peers, added to the chart as comparisons.
  const related = useMemo(() => {
    const index = engine.get(HOME_INDEX[sec.country] ?? 'SPX Index');
    const peerList = sec.cls === 'equity' ? peers(sec, 3) : [];
    return { index: index && index.id !== sec.id ? index : undefined, peers: peerList };
  }, [sec]);
  const addCompare = (id: string) => {
    if (id !== sec.id && !compare.includes(id) && compare.length < 5) setCompare([...compare, id]);
  };
  const seriesCsv = () => [
    ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'],
    ...Array.from({ length: series.length }, (_, i) => [new Date(series.t[i]).toISOString().slice(0, intraday ? 16 : 10), series.o[i], series.h[i], series.l[i], series.c[i], series.v[i]]),
  ];
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
        actions={[
          {
            n: 94,
            label: 'Suggested Charts',
            onClick: () => {},
            menu: [
              { label: 'Price and Volume', onClick: () => { setType('mountain'); if (!p.lower.includes('VOL')) toggleLower('VOL'); } },
              { label: 'Moving Averages (50 and 200 days)', onClick: () => setMovAvgs(true) },
              { label: 'Bollinger Bands', onClick: () => { if (!p.studies.includes('BOLL')) toggleStudy('BOLL'); } },
              { label: 'Relative Strength (RSI)', onClick: () => { if (!p.lower.includes('RSI')) toggleLower('RSI'); } },
              { label: 'MACD', onClick: () => { if (!p.lower.includes('MACD')) toggleLower('MACD'); } },
              ...(related.index ? [{ label: `Against ${related.index.name}`, sep: true, onClick: () => addCompare(related.index!.id) }] : []),
            ],
          },
          {
            n: 96,
            label: 'Actions',
            onClick: () => {},
            menu: [
              { label: 'Table', title: 'HISTORY', onClick: () => execute(panel, `${sec.id} HISTORY`) },
              intraday ? { label: 'Daily Chart', onClick: () => execute(panel, `${sec.id} CHART`) } : { label: 'Intraday Chart', onClick: () => execute(panel, `${sec.id} INTRADAY`) },
              ...exportActions(panel, `${sec.ticker.replace(/\W+/g, '_')}_${intraday ? 'intraday' : 'daily'}.csv`, seriesCsv).map((a, i) => ({ label: a.label === 'Copy' ? 'Copy Data to Clipboard' : 'Export Data as CSV', title: a.title, sep: i === 0, onClick: a.onClick })),
            ],
          },
          {
            n: 97,
            label: 'Edit',
            onClick: () => {},
            menu: [
              { label: 'Securities & Studies...', onClick: () => setEditing(true) },
              { label: 'Compare Returns', title: 'RETURNS', onClick: () => execute(panel, `${sec.id} RETURNS`) },
              ...TYPES.map((t, i) => ({ label: `${t.label} Chart`, sep: i === 0, onClick: () => setType(t.id) })),
            ],
          },
        ]}
      />
      {iex && <IexHistoryNotice intraday={intraday} />}
      <div className="chart-tools gp-row">
        {!intraday && shownRange && <DateRangeFields from={shownRange.from} to={shownRange.to} onChange={(from, to) => setCustom({ from, to })} />}
        <span className="gp-field" title={sec.quote === 'yield' ? 'The yield' : 'The last price of each period'}>{sec.quote === 'yield' ? 'Yield' : 'Last Px'}</span>
        <span className="gp-field" title={`In the security's own currency (${sec.ccy})`}>Local CCY</span>
        {!intraday && (
          <label className="chk" title="The 50- and 200-day simple moving averages">
            <input type="checkbox" checked={movAvgs} onChange={(e) => setMovAvgs(e.target.checked)} /> Mov Avgs
          </label>
        )}
        {!intraday && (
          <label className="chk" title="Mark ex-dividend dates (D), splits (S) and earnings reports (E) on the chart">
            <input type="checkbox" checked={keyEvents} onChange={(e) => setKeyEvents(e.target.checked)} /> Key Events
          </label>
        )}
      </div>
      <div className="chart-tools gp-row">
        {showPeriods && (
          <span className="gp-periods" role="group" aria-label="Period">
            {PERIODS.map((x) => (
              <button key={x.n} type="button" className={`gp-per${x.n === currentTab ? ' on' : ''}`} aria-pressed={x.n === currentTab} title={`${x.n} <GO>`} onClick={() => pickPeriod(x.n)}>
                {x.label}
              </button>
            ))}
          </span>
        )}
        {!intraday && (
          <select className="gp-freq" aria-label="Frequency" value={freq} onChange={(e) => setFreq(e.target.value as Periodicity)}>
            <option value="D">Daily</option>
            <option value="W">Weekly</option>
            <option value="M">Monthly</option>
          </select>
        )}
        <span className="seg" role="group" aria-label="Chart type">
          {TYPES.map((t) => (
            <button key={t.id} type="button" className={p.type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>
              {t.label}
            </button>
          ))}
        </span>
        <button type="button" className="gp-plain" onClick={() => execute(panel, `${sec.id} HISTORY`)}>Table</button>
        <span className="gp-right">
          <RelatedData related={related} onAdd={addCompare} />
          <CompareBox sec={sec} list={compare} setList={setCompare} />
          <button type="button" className={`gp-edit${editing ? ' on' : ''}`} aria-pressed={editing} onClick={() => setEditing(!editing)}>✎ Edit Chart</button>
        </span>
      </div>
      <div className="gp-body">
      <ChartView
        series={series}
        options={options}
        resetKey={`${sec.id}|${period}|${freq}|${intraday}|${custom ? `${custom.from}-${custom.to}` : ''}`}
        readout={{ unit: sec.quote === 'yield' ? 'yield %' : sec.ccy, periodicity: intraday ? 'Intraday' : freq === 'D' ? 'Daily' : freq === 'W' ? 'Weekly' : 'Monthly' }}
      />
        {editing && (
          <EditChart
            sec={sec}
            studies={p.studies}
            lower={p.lower}
            compare={compare}
            onStudy={toggleStudy}
            onLower={toggleLower}
            onRemove={(id) => setCompare(compare.filter((x) => x !== id))}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </div>
  );
}

/** Style words CHART accepts: BAR (GPO) and CANDLE (GPC), with LINE and MOUNTAIN for completeness. */
const STYLE_WORDS: Record<string, ChartType> = { BAR: 'bar', OHLC: 'bar', CANDLE: 'candle', LINE: 'line', MOUNTAIN: 'mountain' };

/**
 * Study words CHART accepts, as the terminal runs RSI, MACD and BOLL: each adds its study to the chart. TECH opens
 * the others by the same words (SMA50, EMA20, VOL).
 */
const STUDY_WORDS: Record<string, { study?: string; lower?: LowerKind }> = {
  RSI: { lower: 'RSI' }, MACD: { lower: 'MACD' }, BOLL: { study: 'BOLL' }, VOL: { lower: 'VOL' },
  SMA10: { study: 'SMA10' }, SMA20: { study: 'SMA20' }, SMA30: { study: 'SMA30' }, SMA50: { study: 'SMA50' }, SMA200: { study: 'SMA200' }, EMA20: { study: 'EMA20' },
  VMA15: { study: 'VMA15' },
};

export function GP({ sec, route }: FnProps) {
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  // CHART AAPL 1D is today's intraday chart, the screen the 1) 1D tab opens.
  if (words.includes('1D')) return <ChartScreen key={sec!.id} sec={sec!} intraday />;
  const initial = PERIODS.find((p) => words.includes(p.id))?.id;
  const style = words.map((w) => STYLE_WORDS[w]).find(Boolean);
  const studyWords = words.filter((w) => STUDY_WORDS[w]);
  const studies = studyWords.map((w) => STUDY_WORDS[w].study).filter((x): x is string => !!x);
  const lower = studyWords.map((w) => STUDY_WORDS[w].lower).filter((x): x is LowerKind => !!x);
  const { mnemonic } = styledMnemonic('CHART', route.args);
  const named = style === 'bar' || style === 'candle' || studyWords.length > 0;
  return (
    <ChartScreen
      key={`${sec!.id}|${style ?? ''}|${studyWords.join(',')}`}
      sec={sec!}
      intraday={false}
      initialPeriod={initial}
      style={style}
      mnemonic={named ? mnemonic : undefined}
      studies={studies}
      lower={lower}
    />
  );
}

export function GIP({ sec }: FnProps) {
  return <ChartScreen key={sec!.id} sec={sec!} intraday />;
}
