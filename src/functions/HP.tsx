import { Fragment, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { IexHistoryNotice } from '../components/IexHistoryNotice';
import { Chg } from '../components/cells';
import { DateRangeFields } from '../components/DateRange';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine, useQuote, useTick } from '../data/market';
import { IEX_PROVIDER } from '../data/live/iex-engine';
import { aggregate, type Periodicity } from '../data/series';
import { freshnessOf } from '../data/freshness';
import { usePanelId } from '../terminal/panel';
import { blockGeometry, blockPages, weekday, weekSlots } from '../terminal/pricetable';
import type { FnProps } from '../terminal/types';

const DAY_MS = 86_400_000;

const RANGES = [
  { n: 1, id: '1M', days: 31 },
  { n: 2, id: '3M', days: 92 },
  { n: 3, id: '6M', days: 183 },
  { n: 4, id: '1Y', days: 366 },
  { n: 5, id: '2Y', days: 731 },
  { n: 6, id: '5Y', days: 1827 },
  { n: 7, id: '10Y', days: 3660 },
];

/** Periodicity words HP accepts after the security: HP AAPL 1Y W is a year of weekly bars. */
const PERIOD_WORDS: Record<string, Periodicity> = { D: 'D', DAILY: 'D', W: 'W', WEEKLY: 'W', M: 'M', MONTHLY: 'M', Q: 'Q', QUARTERLY: 'Q', Y: 'Y', YEARLY: 'Y' };
const PERIOD_NAMES: Record<Periodicity, string> = { D: 'Daily', W: 'Weekly', M: 'Monthly', Q: 'Quarterly', Y: 'Yearly' };

interface Row {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  chg: number;
  pct: number;
}

/**
 * The blocks across and lines down that fit the panel: the terminal's price table fills the screen with
 * "Date / Last Price / Volume" blocks, and each page of them is about one panel high.
 */
function useBlocks(ref: RefObject<HTMLDivElement | null>): { cols: number; perCol: number } {
  const [geo, setGeo] = useState({ cols: 1, perCol: 20 });
  useLayoutEffect(() => {
    const el = ref.current;
    const body = el?.closest('.panel-body') as HTMLElement | null;
    if (!el || !body || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const row = parseFloat(getComputedStyle(el).getPropertyValue('--row')) || 20;
      const pinned = parseFloat(body.style.getPropertyValue('--fnh-h')) || 0;
      const next = blockGeometry(el.clientWidth, body.clientHeight - pinned - row - 8, row);
      setGeo((g) => (g.cols === next.cols && g.perCol === next.perCol ? g : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return geo;
}

export function HP({ sec, route }: FnProps) {
  const s = sec!;
  const q = useQuote(s.id);
  const iex = q?.provider === IEX_PROVIDER;
  const panel = usePanelId();
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  const [range, setRange] = useState(RANGES.find((r) => words.includes(r.id))?.n ?? 2);
  // Dates typed in the amber range boxes replace the range tab until a tab is chosen again.
  const [custom, setCustom] = useState<{ from: number; to: number } | null>(null);
  const [per, setPer] = useState<Periodicity>(words.map((w) => PERIOD_WORDS[w]).find(Boolean) ?? 'D');
  // The terminal's default view is the price table of last prices and volume; OHLC lists the bars in full.
  const [view, setView] = useState<'table' | 'ohlc'>(words.includes('OHLC') ? 'ohlc' : 'table');
  const tick = useTick(per === 'D' ? 3 : 10);
  const yld = s.quote === 'yield';
  const area = useRef<HTMLDivElement>(null);
  const geo = useBlocks(area);
  const now = engine.now();
  const from = custom ? custom.from : now - RANGES[range - 1].days * DAY_MS;
  const to = custom ? custom.to + DAY_MS - 1 : Infinity;
  const rows = useMemo(() => {
    const d = engine.daily(s.id);
    const series = aggregate(d, per);
    const out: Row[] = [];
    for (let i = series.length - 1; i >= 0; i--) {
      if (series.t[i] < from) break;
      if (series.t[i] > to) continue;
      const prev = i > 0 ? series.c[i - 1] : iex ? NaN : series.o[i];
      out.push({ t: series.t[i], o: series.o[i], h: series.h[i], l: series.l[i], c: series.c[i], v: series.v[i], chg: series.c[i] - prev, pct: (series.c[i] / prev - 1) * 100 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, from, to, per, tick, iex]);
  // The price table reads the last prices, so its high and low are closes; the OHLC view's are the bars' extremes.
  const pick = (better: (a: Row, b: Row) => boolean) => rows.reduce<Row | undefined>((best, r) => (!best || better(r, best) ? r : best), undefined);
  const hiRow = view === 'table' ? pick((a, b) => a.c > b.c) : pick((a, b) => a.h > b.h);
  const loRow = view === 'table' ? pick((a, b) => a.c < b.c) : pick((a, b) => a.l < b.l);
  const hi = hiRow ? (view === 'table' ? hiRow.c : hiRow.h) : NaN;
  const lo = loRow ? (view === 'table' ? loRow.c : loRow.l) : NaN;
  const avg = rows.length ? rows.reduce((a, r) => a + r.c, 0) / rows.length : NaN;
  const first = rows[rows.length - 1];
  const last = rows[0];
  const totalChg = last && first ? last.c - (first.c - first.chg) : NaN;
  const hasVol = rows.some((r) => r.v > 0);
  // The newest row is still moving only while the source streams the session.
  const fresh = q ? freshnessOf(q, s, Date.now()) : null;
  const liveSession = !!fresh && (fresh.label === 'REAL-TIME' || fresh.label === 'DELAYED' || (fresh.label === 'DEMO DATA' && q?.session !== 'closed'));
  const shownFrom = custom ? custom.from : first?.t ?? from;
  const shownTo = custom ? custom.to : last?.t ?? now;
  const pages = useMemo(() => blockPages(weekSlots(rows, per === 'D'), geo.cols, geo.perCol), [rows, per, geo]);
  const csv = () => [
    ['Date', 'Open', 'High', 'Low', 'Close', 'Change', 'Change %', 'Volume'],
    ...rows.map((r) => [fmtDay(r.t, true), r.o.toFixed(s.dec), r.h.toFixed(s.dec), r.l.toFixed(s.dec), r.c.toFixed(s.dec), r.chg.toFixed(s.dec + 1), r.pct.toFixed(3), r.v || '']),
  ];
  // Only the latest daily bar can be the session still trading.
  const daily = engine.daily(s.id);
  const latestT = daily.length ? daily.t[daily.length - 1] : NaN;
  const current = (r: Row) => per === 'D' && r.t === latestT;
  return (
    <div ref={area}>
      <FnHeader
        code="HISTORY"
        title="Historical Price Table"
        sec={s}
        tabs={iex ? undefined : RANGES.map((r) => ({ n: r.n, label: r.id }))}
        tab={custom ? undefined : range}
        onTab={(n) => {
          setCustom(null);
          setRange(n);
        }}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${per}.csv`, csv)}
      />
      <QuoteStrip sec={s} />
      {iex && <IexHistoryNotice />}
      <div className="chart-tools hp-tools">
        <DateRangeFields from={shownFrom} to={shownTo} onChange={(a, b) => setCustom({ from: a, to: b })} />
        <label className="fld">
          Period
          <select className="sel-inp" aria-label="Period" value={per} onChange={(e) => setPer(e.target.value as Periodicity)}>
            {(['D', 'W', 'M', 'Q', 'Y'] as Periodicity[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          View
          <select className="sel-inp" aria-label="View" value={view} onChange={(e) => setView(e.target.value as 'table' | 'ohlc')}>
            <option value="table">Price Table</option>
            <option value="ohlc">OHLC Table</option>
          </select>
        </label>
        <span className="muted">{rows.length} {PERIOD_NAMES[per].toLowerCase()} rows</span>
        <dl className="hp-summary" aria-label="Range summary">
          <dt>High</dt>
          <dd>
            {fmtNum(hi, s.dec)} <span className="muted">on</span> {hiRow ? fmtDay(hiRow.t) : '--'}
          </dd>
          <dt>Low</dt>
          <dd>
            {fmtNum(lo, s.dec)} <span className="muted">on</span> {loRow ? fmtDay(loRow.t) : '--'}
          </dd>
          <dt>Average</dt>
          <dd>{fmtNum(avg, s.dec)}</dd>
          <dt>Net Chg</dt>
          <dd>
            {yld ? <><Chg v={totalChg} bp /> bp</> : <Chg v={totalChg} dec={s.dec} />}{' '}
            {!yld && first && <Chg v={(totalChg / (first.c - first.chg)) * 100} pct />}
          </dd>
        </dl>
      </div>
      {view === 'table' ? (
        rows.length === 0 ? (
          <div className="empty">No prices in this range.</div>
        ) : (
          pages.map((page, pi) => {
            const lines = Math.max(...page.map((c) => c.length));
            return (
              <table key={pi} className="tbl hp-blocks">
                <thead>
                  <tr>
                    {page.map((_, ci) => (
                      <Fragment key={ci}>
                        <th className={ci ? 'blk' : undefined}>Date</th>
                        <th className="num">{yld ? 'Yield' : 'Last Price'}</th>
                        {hasVol && <th className="num">Volume</th>}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: lines }, (_, li) => (
                    <tr key={li}>
                      {page.map((col, ci) => {
                        const slot = col[li];
                        const r = slot && 'row' in slot ? slot.row : undefined;
                        return (
                          <Fragment key={ci}>
                            <td className={ci ? 'blk' : undefined}>
                              {r && (
                                <>
                                  {per === 'D' && <span className="hp-wd">{weekday(r.t)}</span>}
                                  <span className={current(r) ? 'amber' : undefined}>{fmtDay(r.t)}</span>
                                  {current(r) ? ' *' : ''}
                                </>
                              )}
                            </td>
                            <td className="num white">{r ? fmtNum(r.c, s.dec) : ''}</td>
                            {hasVol && <td className="num">{r && r.v > 0 ? fmtNum(r.v, 0) : ''}</td>}
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })
        )
      ) : (
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
            {rows.map((r) => (
              <tr key={r.t}>
                <td className={current(r) ? 'amber' : ''}>
                  {fmtDay(r.t)}
                  {current(r) ? ' *' : ''}
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
      )}
      {engine.realOnly && s.eq && !iex && rows.length > 0 && (
        <div className="note">
          Prices and volumes are Yahoo Finance&apos;s, adjusted for splits and not for dividends: before a split, prices are divided and volumes multiplied by
          its ratio (NVIDIA&apos;s close of 7 June 2024, 1,208.88 as traded, shows as 120.89).
        </div>
      )}
      {per === 'D' && rows.length > 0 && current(rows[0]) && (
        <div className="note">
          {liveSession ? '* Current session, updating as prices arrive.' : `* Latest session as the source last reported it${fresh ? ` (${fresh.label.toLowerCase()})` : ''}.`}
        </div>
      )}
    </div>
  );
}
