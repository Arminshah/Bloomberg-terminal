import { Fragment, useState, type MouseEvent } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Credits } from '../components/Credits';
import { Dialog } from '../components/Dialog';
import { Sparkline } from '../components/Sparkline';
import { DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { RatesSource } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum, fmtSigned } from '../core/format';
import { engine, useTick } from '../data/market';
import { horizonStart } from '../data/analytics';
import { DAY_MS } from '../data/calendar';
import { COUNTRY_NAMES } from '../data/eco';
import { news, type Story } from '../data/news';
import {
  WB_COUNTRIES,
  WB_CURVES,
  WB_RANGES,
  WB_REGIONS,
  WB_STALE_DAYS,
  WB_TENORS,
  atOrBefore,
  countryStories,
  diffLine,
  fmtRangeLevel,
  lineOf,
  rangePos,
  staleSince,
  wbStats,
  type DailyLine,
  type WbCountry,
  type WbRange,
  type WbStats,
  type WbTenor,
} from '../data/world-bonds';
import { execute } from '../terminal/exec';
import { OVERLAY_MENU, flash, useMenu, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type View = 'Regional' | 'Developed';
type TabNo = 91 | 92 | 93;

const TABS: { n: TabNo; label: string }[] = [
  { n: 91, label: 'Bonds' },
  { n: 92, label: 'Spreads' },
  { n: 93, label: 'Curves' },
];

/** Each tab's starting Data Range: YTD on Bonds (Quick Start 2024), 3 Months on Spreads (LUISS, October 2018). */
const START_RANGE: Record<TabNo, WbRange> = { 91: 'YTD', 92: '3M', 93: '3M' };

const has = (id?: string): id is string => !!id && engine.hasSource(id);

/** A line's daily closes. */
function line(id: string): DailyLine {
  return lineOf(engine.daily(id));
}

/** Where the range starts: the calendar year for YTD, otherwise counted back from the line's latest session. */
function rangeStart(r: WbRange, l: DailyLine): number {
  const last = l.t.length ? l.t[l.t.length - 1] : engine.today * DAY_MS;
  return horizonStart(r, r === 'YTD' ? engine.today * DAY_MS : last);
}

interface Row {
  k: WbCountry;
  name: string;
  /** The yield line at the chosen maturity (Bonds and Spreads). */
  id?: string;
  /** The statistics of what the tab measures: the yield, the spread to the Sell country or the curve. */
  stats: WbStats | null;
  /** The Spreads tab's Sell country itself. */
  base?: boolean;
  /** The Curves tab's short and long lines. */
  short?: string;
  long?: string;
  /** Why the row has no figures. */
  why?: string;
  /**
   * The latest spread's two yields and their days, for its tooltip: each country's sources publish on their own days,
   * so the Sell country's yield can be its last one before the row's day.
   */
  pair?: { t: number; a: number; tb: number; b: number };
  /** The day (UTC ms) of the row's latest value. */
  asOf?: number;
}

/** The Spd cell's tooltip: both yields and their days, and what the day's change measures when the days differ. */
function pairTitle(p: NonNullable<Row['pair']>, name: string, sellName: string): string {
  if (p.tb === p.t) return `${fmtNum(p.a, 3)} less ${sellName}'s ${fmtNum(p.b, 3)}, both on ${fmtDay(p.t)}`;
  return `${name}'s ${fmtNum(p.a, 3)} of ${fmtDay(p.t)} less ${sellName}'s ${fmtNum(p.b, 3)} of ${fmtDay(p.tb)}, its latest: the day's change is ${name}'s own move`;
}

/** The figure each view sorts by and the main column shows. */
function headline(r: Row, tab: TabNo): number {
  if (tab === 91) return r.id ? engine.quote(r.id)!.last : NaN;
  return r.stats?.now ?? NaN;
}

/**
 * WB, World Bond Markets, as TE07 01:15 draws it: the amber "Regional" view box, Export and Settings on the red bar;
 * tabs 91) Bonds, 92) Spreads and 93) Curves; Maturity, and on Spreads the Sell country, above the table; the countries
 * numbered under their regions; and a Data Range band at the right with Low, a Range bar (Avg diamond, Now dot) and
 * High. Clicking a country opens its Security Analysis window (TE07 01:29).
 */
export function WB(_: FnProps) {
  useTick(2);
  const panel = usePanelId();
  const [view, setView] = useState<View>('Regional');
  const [tab, setTab] = useState<TabNo>(91);
  const [tenor, setTenor] = useState<WbTenor>(10);
  const [ranges, setRanges] = useState<Record<TabNo, WbRange>>(START_RANGE);
  const [sell, setSell] = useState('DE');
  const [curveKey, setCurveKey] = useState(WB_CURVES[0].key);
  const [ticked, setTicked] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [collapsed, toggle] = useCollapsed();
  const range = ranges[tab];
  const rangeDef = WB_RANGES.find((r) => r.key === range)!;
  const curve = WB_CURVES.find((c) => c.key === curveKey)!;

  // The desktop app lists only countries with an official source; the demo's simulator has them all.
  const countries = WB_COUNTRIES.filter((k) => Object.values(k.ids).some(has) && (view === 'Regional' || k.developed));
  const sellChoices = countries.filter((k) => has(k.ids[tenor]));
  const sellK = sellChoices.find((k) => k.c === sell) ?? sellChoices.find((k) => k.c === 'US') ?? sellChoices[0];
  const sellLine = sellK ? line(sellK.ids[tenor]!) : null;

  const today = engine.today * DAY_MS;
  // A line whose source has not caught up (the Treasury's current year still loading leaves 31 December's close as
  // the latest) gets no statistics: they would describe an old range as today's.
  const waiting = (name: string, ...ls: DailyLine[]) => {
    if (ls.some((l) => !l.t.length)) return `No ${name} values yet: waiting for its source`;
    const old = ls.map((l) => staleSince(l, today)).filter((t): t is number => t !== null);
    return old.length ? `The latest ${name} value is from ${fmtDay(Math.min(...old))}: waiting for its source` : undefined;
  };
  // A range with no value in it yet (the first days of a year, before its first close) says so rather than show blanks.
  const statsOf = (name: string, l: DailyLine): Pick<Row, 'stats' | 'why' | 'asOf'> => {
    const start = rangeStart(range, l);
    const stats = wbStats(l, start);
    const asOf = l.t.length ? l.t[l.t.length - 1] : undefined;
    return stats ? { stats, asOf } : { stats: null, asOf, why: `No ${name} value since ${fmtDay(start)}, where the ${rangeDef.label} range starts: its first close is still to come` };
  };
  const rowOf = (k: WbCountry): Row => {
    const name = COUNTRY_NAMES[k.c];
    if (tab === 93) {
      const short = k.ids[curve.short];
      const long = k.ids[curve.long];
      if (!has(short) || !has(long)) return { k, name, stats: null, why: `No ${curve.short}-year and ${curve.long}-year pair from this country's source` };
      const ll = line(long);
      const sl = line(short);
      const why = waiting(name, ll, sl);
      if (why) return { k, name, short, long, stats: null, why };
      const l = diffLine(ll, sl);
      return { k, name, short, long, ...statsOf(name, l) };
    }
    const id = k.ids[tenor];
    if (!has(id)) return { k, name, stats: null, why: `No ${tenor}-year line from this country's source` };
    const own = line(id);
    const why = waiting(name, own);
    if (tab === 91) return why ? { k, name, id, stats: null, why, asOf: own.t[own.t.length - 1] } : { k, name, id, ...statsOf(name, own) };
    if (k === sellK) return { k, name, id, stats: null, base: true, why };
    if (!sellLine) return { k, name, id, stats: null };
    const sellWhy = sellK ? waiting(COUNTRY_NAMES[sellK.c], sellLine) : undefined;
    if (why || sellWhy) return { k, name, id, stats: null, why: why ?? sellWhy };
    const l = diffLine(own, sellLine);
    const t = l.t[l.t.length - 1];
    const j = l.t.length ? atOrBefore(sellLine.t, t) : -1;
    const pair = j >= 0 ? { t, a: own.v[own.t.lastIndexOf(t)], tb: sellLine.t[j], b: sellLine.v[j] } : undefined;
    return { k, name, id, ...statsOf(name, l), pair };
  };

  const rows = countries.map(rowOf);
  // Developed lists one table, lowest first by what the tab measures (the Quick Start guide's "Yld ↑").
  const sorted =
    view === 'Developed'
      ? [...rows].sort((a, b) => {
          const x = headline(a, tab);
          const y = headline(b, tab);
          if (!Number.isFinite(x)) return 1;
          if (!Number.isFinite(y)) return -1;
          return x - y;
        })
      : rows;
  const groups =
    view === 'Regional'
      ? WB_REGIONS.map((g, gi) => ({ name: g.name, gi, rows: rows.filter((r) => g.countries.includes(r.k)) })).filter((g) => g.rows.length > 0)
      : [{ name: '', gi: -1, rows: sorted }];
  const numberOf = (r: Row) => (view === 'Regional' ? r.k.n : sorted.indexOf(r) + 1);
  const shownRows = groups.flatMap((g) => (g.gi >= 0 && collapsed.includes(g.name) ? [] : g.rows));

  useMenu('wb-regions', view === 'Regional' ? WB_REGIONS.map((g, gi) => ({ n: gi + 1, label: g.name, run: () => toggle(g.name) })) : []);
  useMenu('wb-rows', shownRows.map((r) => ({ n: numberOf(r), label: r.name, run: () => setAnalysis(r.k.c) })));

  const open = (r: Row, e?: MouseEvent) => {
    const id = tab === 93 ? r.long : r.id;
    if (id) openSecurity(panel, id, e, 'CHART');
  };
  const tick = (c: string) => setTicked((t) => (t.includes(c) ? t.filter((x) => x !== c) : [...t, c]));

  const csv = () => {
    const out = ticked.length ? sorted.filter((r) => ticked.includes(r.k.c)) : sorted;
    const head =
      tab === 91
        ? ['Country', 'Line', 'Yield', 'As of', 'Chg (bp)', 'Low', 'High', `${rangeDef.short} Chg (bp)`, 'Note']
        : [
            'Country',
            tab === 92 ? 'Yield' : `${curve.label} (bp)`,
            tab === 92 ? `Spread to ${sellK ? COUNTRY_NAMES[sellK.c] : ''} (bp)` : '',
            'Chg',
            '#SD/Day',
            'Low',
            'High',
            'Avg',
            '+/-',
            '#SD',
            'RSI',
            'As of',
            'Note',
          ].filter(Boolean);
    const sellName = sellK ? COUNTRY_NAMES[sellK.c] : '';
    const body = out.map((r) => {
      const s = r.stats;
      const asOf = r.asOf !== undefined ? fmtDay(r.asOf) : '';
      if (tab === 91) {
        const q = r.id ? engine.quote(r.id)! : null;
        // The screen greys a change whose previous close is not yet confirmed: the file leaves it out and says why.
        const unconfirmed = q?.chgCheck === 'unverified';
        const note = [r.why, unconfirmed ? "The day's change waits for a confirmed previous close" : '', s && !Number.isFinite(s.base) ? `No close within ${WB_STALE_DAYS} days before the range starts` : ''].filter(Boolean).join('; ');
        return [r.name, r.id ?? '', q ? fmtNum(q.last, 3) : '', asOf, q && !unconfirmed ? fmtNum(q.chg * 100, 1) : '', s ? fmtNum(s.low, 3) : '', s ? fmtNum(s.high, 3) : '', s ? fmtNum(s.chg * 100, 1) : '', note];
      }
      const note = r.why ?? (r.pair && r.pair.tb !== r.pair.t ? `${sellName}'s yield is from ${fmtDay(r.pair.tb)}` : '');
      const first = tab === 92 ? (r.id ? fmtNum(engine.quote(r.id)!.last, 3) : '') : s ? fmtNum(s.now, 1) : '';
      const stat = s ? [fmtNum(s.dayChg, 1), fmtNum(s.sdDay, 1), fmtNum(s.low, 1), fmtNum(s.high, 1), fmtNum(s.avg, 1), fmtNum(s.diff, 1), fmtNum(s.sd, 1), fmtNum(s.rsi, 1)] : ['', '', '', '', '', '', '', ''];
      return tab === 92 ? [r.name, first, s ? fmtNum(s.now, 1) : '', ...stat, asOf, note] : [r.name, first, ...stat, asOf, note];
    });
    return [head, ...body];
  };
  const exportCsv = () => {
    const acts = exportActions(panel, 'world-bond-markets.csv', csv);
    (acts.find((a) => a.label === 'Export') ?? acts[0]).onClick();
  };

  const leftCols = tab === 91 ? 9 : tab === 92 ? 7 : 8;
  const rightCols = tab === 91 ? 4 : 7;
  const sa = analysis ? WB_COUNTRIES.find((k) => k.c === analysis) : undefined;

  return (
    <div className="wb">
      <FnHeader
        code="BONDS"
        title={view === 'Developed' ? 'World Bond Markets: Developed' : 'World Bond Markets'}
        right={
          <select className="fnh-pick" aria-label="View" value={view} onChange={(e) => setView(e.target.value as View)} data-testid="wb-view">
            <option>Regional</option>
            <option>Developed</option>
          </select>
        }
        actions={[
          { n: 9901, bare: true, label: 'Export', title: ticked.length ? 'Save the ticked rows as a CSV file' : 'Save the table as a CSV file', onClick: exportCsv },
          {
            n: 9902,
            bare: true,
            label: 'Settings',
            onClick: () => {},
            menu: [
              { label: 'Collapse All Regions', disabled: view !== 'Regional', onClick: () => WB_REGIONS.forEach((g) => !collapsed.includes(g.name) && toggle(g.name)) },
              { label: 'Expand All Regions', disabled: view !== 'Regional', onClick: () => WB_REGIONS.forEach((g) => collapsed.includes(g.name) && toggle(g.name)) },
              { label: 'Clear Ticked Rows', sep: true, disabled: !ticked.length, onClick: () => setTicked([]) },
            ],
          },
        ]}
        tabs={TABS}
        tab={tab}
        onTab={(n) => setTab(n as TabNo)}
        plainTabs
      />
      <table className="tbl wb-tbl" data-testid="wb-table">
        <thead>
          <tr className="wb-ctl">
            <th colSpan={leftCols}>
              {tab === 93 ? (
                <label className="wb-fld">
                  <span>Curve</span>
                  <select className="sel-inp" aria-label="Curve" value={curveKey} onChange={(e) => setCurveKey(e.target.value)}>
                    {WB_CURVES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </label>
              ) : (
                <label className="wb-fld">
                  <span>Maturity</span>
                  <select className="sel-inp" aria-label="Maturity" value={tenor} onChange={(e) => setTenor(Number(e.target.value) as WbTenor)}>
                    {WB_TENORS.map((t) => <option key={t} value={t}>{t} Year</option>)}
                  </select>
                </label>
              )}
              {tab === 92 ? (
                <label className="wb-fld" title="The country each spread is measured against">
                  <span>Sell</span>
                  <select className="sel-inp wb-sell" aria-label="Spread against" value={sellK?.c ?? ''} onChange={(e) => setSell(e.target.value)}>
                    {sellChoices.map((k) => <option key={k.c} value={k.c}>{COUNTRY_NAMES[k.c]}</option>)}
                  </select>
                </label>
              ) : null}
            </th>
            <th colSpan={rightCols} className="wb-r wb-range-hdr">
              <span>{tab === 91 ? 'Data Range' : 'Historical Data Range'}</span>
              <select className="sel-inp" aria-label="Data range" value={range} onChange={(e) => setRanges((r) => ({ ...r, [tab]: e.target.value as WbRange }))}>
                {WB_RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </th>
          </tr>
          <tr>
            <th>Region</th>
            {tab === 91 ? (
              <>
                <th className="wb-rmi hide-m" title="Tick rows to export only those">RMI</th>
                <th>Security</th>
                <th className="wb-ico" aria-label="Chart" />
                <th className="num hide-m" title="A generic yield line has no bond price">Price</th>
                <th className="num hide-m" title="A generic yield line has no price change">Chg</th>
                <th className="num">{view === 'Developed' ? 'Yld ↑' : 'Yld'}</th>
                <th className="num" title="Change on the day, basis points">Chg</th>
                <th className="hide-m" title={`Yield over the data range (${rangeDef.label}), daily closes`}>Yld</th>
              </>
            ) : tab === 92 ? (
              <>
                <th className="wb-ico" aria-label="Chart" />
                <th className="num">Yld</th>
                <th className="num" title={`Spread to ${sellK ? COUNTRY_NAMES[sellK.c] : 'the Sell country'}, basis points`}>{view === 'Developed' ? 'Spd ↑' : 'Spd'}</th>
                <th className="num" title="Change in the spread on the day, basis points">Chg</th>
                <th className="hide-m" title={`Spread over the data range (${rangeDef.label}), daily`}>Spread</th>
                <th className="num" title="The day's change in standard deviations of the range's daily changes">#SD/Day</th>
              </>
            ) : (
              <>
                <th className="wb-ico" aria-label="Chart" />
                <th className="num hide-m">{curve.short}Y Yld</th>
                <th className="num hide-m">{curve.long}Y Yld</th>
                <th className="num" title={`${curve.long}-year yield less ${curve.short}-year yield, basis points`}>{view === 'Developed' ? 'Crv ↑' : 'Crv'}</th>
                <th className="num" title="Change in the curve on the day, basis points">Chg</th>
                <th className="hide-m" title={`Curve over the data range (${rangeDef.label}), daily`}>Curve</th>
                <th className="num" title="The day's change in standard deviations of the range's daily changes">#SD/Day</th>
              </>
            )}
            <th className="num wb-r" title="Lowest daily value in the data range">Low</th>
            <th className="wb-r wb-range-col">
              Range
              <span className="wb-legend" aria-hidden="true">
                <i className="wb-avg-key" /> Avg <i className="wb-now-key" /> Now
              </span>
            </th>
            <th className="num wb-r" title="Highest daily value in the data range">High</th>
            {tab === 91 ? (
              <th className="num wb-r" title={`Change in yield over the data range (${rangeDef.label}), basis points`}>{rangeDef.short} Chg</th>
            ) : (
              <>
                <th className="num wb-r" title="Mean of the daily values in the data range">Avg</th>
                <th className="num wb-r" title="Latest less the average">+/-</th>
                <th className="num wb-r" title="Latest less the average, in standard deviations of the range's daily values">#SD</th>
                <th className="num wb-r hide-m" title="Wilder's 14-day relative strength index">RSI</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.name || 'all'}>
              {g.gi >= 0 ? <GroupRow n={g.gi + 1} name={g.name} span={leftCols + rightCols} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} /> : null}
              {(g.gi >= 0 && collapsed.includes(g.name) ? [] : g.rows).map((r) => (
                <WbRow
                  key={r.k.c}
                  r={r}
                  n={numberOf(r)}
                  tab={tab}
                  ticked={ticked.includes(r.k.c)}
                  onTick={() => tick(r.k.c)}
                  onChart={(e) => open(r, e)}
                  onOpen={() => setAnalysis(r.k.c)}
                  sellName={sellK ? COUNTRY_NAMES[sellK.c] : ''}
                />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="note">
        <RatesSource /> ·{' '}
        {engine.realOnly
          ? 'Each yield is the generic line its official source publishes (US Treasury par yields, Bundesbank zero-coupon yields, Bank of England par yields, Japanese Ministry of Finance constant-maturity yields, Bank of Canada benchmark yields, RBA interpolated yields, Banco de España secondary-market yields), end of day, so methods differ between countries. A generic line has no bond, so Price and its Chg stay blank. Countries without a free official source are not listed.'
          : 'Simulated curves move with US rates through a country beta.'}{' '}
        Spreads and curves are in basis points, on each day with the other line&apos;s value that day or its last before. Low, High and Avg are the daily values in the data range; #SD is the latest less the average in standard deviations of those values; #SD/Day is the latest day&apos;s change in standard deviations of the range&apos;s daily changes; RSI is Wilder&apos;s 14-day.
      </div>
      <Credits ids={['treasury', 'bundesbank', 'boe', 'mof', 'boc', 'rba', 'bde']} />
      {sa ? <SecurityAnalysis k={sa} onClose={() => setAnalysis(null)} /> : null}
    </div>
  );
}

/** A level or spread in the range columns: white when the latest value is the range's low or high, as in both guides. */
function Level({ v, at, bp }: { v: number; at: boolean; bp: boolean }) {
  return <span className={at ? 'white' : 'amber'}>{bp ? fmtNum(v, 1) : fmtRangeLevel(v)}</span>;
}

function RangeBar({ s, bp }: { s: WbStats; bp: boolean }) {
  const f = (v: number) => (bp ? fmtNum(v, 1) : fmtNum(v, 3));
  return (
    <span className="wb-range" title={`Low ${f(s.low)} · Avg ${f(s.avg)} · Now ${f(s.now)} · High ${f(s.high)}`} data-testid="wb-range">
      <i className="wb-avg" style={{ left: `${rangePos(s.avg, s.low, s.high) * 100}%` }} />
      <i className="wb-now" style={{ left: `${rangePos(s.now, s.low, s.high) * 100}%` }} />
    </span>
  );
}

/** A rise in a yield, spread or curve in red and a fall in green, as the frames colour them (TE07 01:15, LUISS 2018). */
function Move({ v, dec = 1 }: { v: number; dec?: number }) {
  if (!Number.isFinite(v)) return <span className="muted">--</span>;
  return <span className={v > 0 ? 'dn' : v < 0 ? 'up' : 'white'}>{fmtSigned(v, dec)}</span>;
}

function SdDay({ v }: { v: number }) {
  if (!Number.isFinite(v)) return <span className="muted">--</span>;
  return (
    <span className="wb-sdday">
      <i className={v >= 0 ? 'dn' : 'up'} style={{ width: `${Math.min(Math.abs(v), 3) * 8}px` }} />
      {fmtNum(v, 1)}
    </span>
  );
}

function WbRow({ r, n, tab, ticked, onTick, onChart, onOpen, sellName }: { r: Row; n: number; tab: TabNo; ticked: boolean; onTick: () => void; onChart: (e: MouseEvent) => void; onOpen: () => void; sellName: string }) {
  const s = r.stats;
  const bp = tab !== 91;
  const q = r.id ? engine.quote(r.id) : undefined;
  const chartIcon = (
    <td className="wb-ico">
      {(tab === 93 ? r.long : r.id) ? (
        <button type="button" className="wb-chart" aria-label={`Chart ${r.name}`} title="Chart the line" onClick={(e) => { e.stopPropagation(); onChart(e); }}>
          <svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6.2" /><path d="M3.2 8.6 5.4 6l1.8 1.9 1.6-2.3 2 2.2" /></svg>
        </button>
      ) : null}
    </td>
  );
  const blankRange = (cols: number) => Array.from({ length: cols }, (_, i) => <td key={i} className="wb-r" />);
  const range = s ? (
    <>
      <td className="num wb-r"><Level v={s.low} at={s.now <= s.low} bp={bp} /></td>
      <td className="wb-r wb-range-col"><RangeBar s={s} bp={bp} /></td>
      <td className="num wb-r"><Level v={s.high} at={s.now >= s.high} bp={bp} /></td>
      {tab === 91 ? (
        <td className="num wb-r amber" title={Number.isFinite(s.base) ? `From ${fmtNum(s.base, 3)}` : `No close within ${WB_STALE_DAYS} days before the range starts: the line's history begins inside it`}>{fmtSigned(s.chg * 100, 1)}</td>
      ) : (
        <>
          <td className="num wb-r wb-avgv">{fmtNum(s.avg, 1)}</td>
          <td className="num wb-r amber">{fmtNum(s.diff, 1)}</td>
          <td className="num wb-r amber">{fmtNum(s.sd, 1)}</td>
          <td className="num wb-r amber hide-m">{Number.isFinite(s.rsi) ? fmtNum(s.rsi, 1) : '--'}</td>
        </>
      )}
    </>
  ) : r.base ? (
    <>
      <td className="num wb-r muted">--</td>
      <td className="wb-r" />
      <td className="num wb-r muted">--</td>
      <td className="wb-r" />
      <td className="num wb-r muted">--</td>
      <td className="num wb-r muted">--</td>
      <td className="wb-r hide-m" />
    </>
  ) : (
    blankRange(tab === 91 ? 4 : 7)
  );
  return (
    <tr className={`click${r.base ? ' wb-base' : ''}`} onClick={onOpen} title={r.why ?? `${r.name}: click, or type ${n} and GO, for its Security Analysis`} data-testid={`wb-row-${r.k.c}`}>
      <td className={r.base ? 'cyan' : 'amber'}>
        <RowNo n={n} />
        {r.name}
      </td>
      {tab === 91 ? (
        <>
          <td className="wb-rmi hide-m">
            <input type="checkbox" aria-label={`Tick ${r.name}`} checked={ticked} onClick={(e) => e.stopPropagation()} onChange={onTick} />
          </td>
          <td className="amber">{r.id ? <SecLink id={r.id} fn="CHART">{engine.get(r.id)?.ticker ?? r.id}</SecLink> : null}</td>
          {chartIcon}
          <td className="num hide-m" />
          <td className="num hide-m" />
          <td className="num cyan">{r.id ? <LivePx id={r.id} dec={3} /> : ''}</td>
          <td className="num">{q ? <YieldChg id={r.id!} /> : ''}</td>
          <td className="hide-m wb-spark">{s ? <Sparkline values={s.values} width={44} height={16} color="var(--up)" /> : null}</td>
        </>
      ) : tab === 92 ? (
        <>
          {chartIcon}
          <td className={`num ${r.base ? 'cyan' : 'white'}`}>{r.id ? <LivePx id={r.id} dec={3} /> : ''}</td>
          <td className="num cyan" title={r.pair ? pairTitle(r.pair, r.name, sellName) : undefined}>{s ? fmtNum(s.now, 1) : ''}</td>
          <td className="num">{s ? <Move v={s.dayChg} /> : ''}</td>
          <td className="hide-m wb-spark">{s ? <Sparkline values={s.values} width={44} height={16} color="var(--up)" /> : null}</td>
          <td className="num">{s ? <SdDay v={s.sdDay} /> : ''}</td>
        </>
      ) : (
        <>
          {chartIcon}
          <td className="num white hide-m">{r.short ? <LivePx id={r.short} dec={3} /> : ''}</td>
          <td className="num white hide-m">{r.long ? <LivePx id={r.long} dec={3} /> : ''}</td>
          <td className="num cyan">{s ? fmtNum(s.now, 1) : ''}</td>
          <td className="num">{s ? <Move v={s.dayChg} /> : ''}</td>
          <td className="hide-m wb-spark">{s ? <Sparkline values={s.values} width={44} height={16} color="var(--up)" /> : null}</td>
          <td className="num">{s ? <SdDay v={s.sdDay} /> : ''}</td>
        </>
      )}
      {range}
    </tr>
  );
}

/** A yield's change on the day in basis points, a rise red and a fall green (TE07 01:15). */
function YieldChg({ id }: { id: string }) {
  const q = engine.quote(id)!;
  if (!Number.isFinite(q.chg) || q.chgCheck === 'unverified') return <DayChg q={q} bp />;
  return <Move v={q.chg * 100} />;
}

// ------------------------------------------------------------- Security Analysis

/** Each country's main equity index and its currency against the dollar (the dollar index for the United States). */
const OTHER_MARKETS: Record<string, { index: string; fx: string }> = {
  US: { index: 'SPX Index', fx: 'DXY Curncy' },
  CA: { index: 'SPTSX Index', fx: 'USDCAD Curncy' },
  BR: { index: 'IBOV Index', fx: 'USDBRL Curncy' },
  MX: { index: 'MEXBOL Index', fx: 'USDMXN Curncy' },
  GB: { index: 'UKX Index', fx: 'GBPUSD Curncy' },
  FR: { index: 'CAC Index', fx: 'EURUSD Curncy' },
  DE: { index: 'DAX Index', fx: 'EURUSD Curncy' },
  IT: { index: 'FTSEMIB Index', fx: 'EURUSD Curncy' },
  ES: { index: 'IBEX Index', fx: 'EURUSD Curncy' },
  CH: { index: 'SMI Index', fx: 'USDCHF Curncy' },
  JP: { index: 'NKY Index', fx: 'USDJPY Curncy' },
  AU: { index: 'AS51 Index', fx: 'AUDUSD Curncy' },
  CN: { index: 'SHCOMP Index', fx: 'USDCNY Curncy' },
  IN: { index: 'SENSEX Index', fx: 'USDINR Curncy' },
};

function storyTime(t: number): string {
  const d = new Date(t);
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return d.toDateString() === now.toDateString() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function Tile({ id }: { id: string }) {
  const panel = usePanelId();
  const def = engine.get(id);
  const q = engine.quote(id);
  if (!def || !q || !engine.hasSource(id)) return null;
  const daily = engine.daily(id);
  const from = Math.max(0, daily.length - 22);
  const spark: number[] = [];
  for (let i = from; i < daily.length; i++) spark.push(daily.c[i]);
  const up = q.pct >= 0;
  return (
    <button type="button" className={`wb-tile ${Number.isFinite(q.pct) ? (up ? 'up' : 'dn') : ''}`} onClick={(e) => openSecurity(panel, id, e)} title={`${def.name}: open it`}>
      <span className="wb-tile-name">{def.name}</span>
      <span className="wb-tile-pct">{Number.isFinite(q.pct) ? `${fmtSigned(q.pct, 2)}%` : '--'}</span>
      <span className="wb-tile-spark"><Sparkline values={spark} width={46} height={18} color="#e8e8e8" /></span>
      <span className="wb-tile-last">{fmtNum(q.last, def.dec)}</span>
      <span className="wb-tile-chg">{Number.isFinite(q.chg) ? fmtSigned(q.chg, def.dec) : ''}</span>
    </button>
  );
}

/** TE07 01:29: a country's latest headlines and its other markets, over the table; Close shuts it. */
function SecurityAnalysis({ k, onClose }: { k: WbCountry; onClose: () => void }) {
  const panel = usePanelId();
  const all = news.use((s) => s.stories);
  const name = COUNTRY_NAMES[k.c];
  const stories = countryStories(all, k.c);
  const more = () => {
    onClose();
    execute(panel, `NEWS ${name}`);
  };
  const read = (s: Story) => {
    if (s.url) window.open(s.url, '_blank', 'noopener,noreferrer');
    else flash(panel, 'This story has no link to its publisher');
  };
  const other = OTHER_MARKETS[k.c];
  // 2) opens the section's first market, the country's equity index, as clicking its tile does.
  const otherMarkets = () => {
    if (!other || !engine.hasSource(other.index)) {
      flash(panel, `No other market for ${name} has a source here`);
      return;
    }
    onClose();
    openSecurity(panel, other.index);
  };
  useMenu(OVERLAY_MENU, [
    { n: 1, label: 'News Headlines', run: more },
    { n: 2, label: `${name}: Other Markets`, run: otherMarkets },
    ...stories.map((s, i) => ({ n: 11 + i, label: s.headline, run: () => read(s) })),
  ]);
  return (
    <Dialog title="Security Analysis" onClose={onClose} buttons={[{ label: 'Close', onClick: onClose, primary: true }]} closeX={false} testId="wb-analysis">
      <div className="wb-sa">
        <div className="wb-sa-h">
          <b>1)</b> News Headlines | <button type="button" className="wb-sa-more" onClick={more}>More »</button>
        </div>
        {stories.length ? (
          <ol className="wb-sa-news">
            {stories.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => read(s)} title={s.headline}>
                  <span className="wb-sa-n">{11 + i})</span>
                  <span className="wb-sa-hl">{s.headline}</span>
                  <span className="wb-sa-src">{s.source}</span>
                  <span className="wb-sa-t">{storyTime(s.time)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="muted wb-sa-none">No story the app holds names {name} yet; More » searches all news.</div>
        )}
        <div className="wb-sa-h" title={`2 and GO opens ${other ? engine.get(other.index)?.name ?? other.index : 'the first market'}`}>
          <b>2)</b> {name}: Other Markets
        </div>
        <div className="wb-tiles">
          {other ? (
            <>
              <Tile id={other.index} />
              <Tile id={other.fx} />
            </>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
