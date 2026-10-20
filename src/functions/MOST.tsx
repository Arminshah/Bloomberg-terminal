import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { Chg, DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { fmtBig, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { rangeStats, toUsd } from '../data/analytics';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import { firstRowNumber } from '../terminal/numbering';
import type { FnProps } from '../terminal/types';
import { BoardMost, hasBoard } from './IndexBoards';
import { membersAvailable } from '../data/live/index-members';

/**
 * MOST's pages under the terminal's names. Rel Volume stands where the terminal has its volume-at-time measure: it
 * is today's volume over the 30-session average, not adjusted for the time of day, so it keeps its own name. The
 * 52-week pages list the stocks nearest their 52-week high or low from the daily history.
 */
const VIEWS = [
  { n: 1, label: 'Volume' },
  { n: 2, label: 'Chg Up' },
  { n: 3, label: 'Chg Down' },
  { n: 4, label: 'Value' },
  { n: 5, label: 'Rel Volume' },
  { n: 6, label: '52Wk Highs' },
  { n: 7, label: '52Wk Lows' },
];
const REGIONS: { n: number; label: string; f: (d: SecurityDef) => boolean }[] = [
  { n: 11, label: 'US', f: (d) => d.country === 'US' },
  { n: 12, label: 'Europe', f: (d) => d.region === 'EMEA' },
  { n: 13, label: 'Asia', f: (d) => d.region === 'APAC' },
  { n: 14, label: 'All', f: () => true },
];

export function MOST(props: FnProps) {
  const { sec, route } = props;
  // The whole membership of an index (the S&P 500 unless another is loaded or typed), where the app can load it.
  const ix = sec?.cls === 'index' ? sec : engine.get(route.args ? `${route.args.trim().toUpperCase()} Index` : 'SPX Index');
  if (engine.realOnly && membersAvailable() && ix && hasBoard(ix.id)) return <BoardMost ix={ix} />;
  return <UniverseMost />;
}

/** The app's own stocks by region (the browser demo, and regions without an index membership here). */
function UniverseMost() {
  const panel = usePanelId();
  useTick(2);
  const [view, setView] = useState(1);
  const [region, setRegion] = useState(11);
  const rf = REGIONS.find((r) => r.n === region)!.f;
  const rows = engine.securities
    .filter((d) => d.cls === 'equity' && rf(d))
    .map((d) => {
      const q = engine.quote(d.id)!;
      const rs = rangeStats(d.id);
      const px = d.minor ? q.last / 100 : q.last;
      // Distance from the 52-week extremes in percent, from the high and low of the daily bars and today's price.
      const hi = Math.max(rs.hi52, q.high, q.last);
      const lo = Math.min(rs.lo52, q.low > 0 ? q.low : Infinity, q.last);
      return {
        d, q, rs,
        value: toUsd(px * q.volume, d.ccy === 'GBp' ? 'GBP' : d.ccy),
        rel: rs.avgVol30 > 0 ? q.volume / rs.avgVol30 : NaN,
        fromHi: Number.isFinite(hi) && hi > 0 ? (q.last / hi - 1) * 100 : NaN,
        fromLo: Number.isFinite(lo) && lo > 0 ? (q.last / lo - 1) * 100 : NaN,
        hi,
        lo,
      };
    });
  // Highest first (lowest for dir -1), with lines that have no figure last.
  const rank = (x: number, y: number, dir = 1) => (Number.isFinite(x) ? (Number.isFinite(y) ? dir * (y - x) : -1) : Number.isFinite(y) ? 1 : 0);
  const sorted = [...rows].sort((a, b) => {
    switch (view) {
      case 2:
        return rank(a.q.pct, b.q.pct);
      case 3:
        return rank(a.q.pct, b.q.pct, -1);
      case 4:
        return rank(a.value, b.value);
      case 5:
        return rank(a.rel, b.rel);
      case 6:
        return rank(a.fromHi, b.fromHi);
      case 7:
        return rank(a.fromLo, b.fromLo, -1);
      default:
        return rank(a.q.volume, b.q.volume);
    }
  });
  return (
    <div>
      <FnHeader
        code="MOVERS"
        title="Most Active Securities"
        sub={view >= 6 ? 'Equities in the Armin universe · nearest their 52-week extremes, from the daily history' : 'Equities in the Armin universe · value traded is estimated as last price × volume'}
        tabs={VIEWS.map((v) => ({ n: v.n, label: v.label }))}
        tab={view}
        onTab={setView}
        actions={REGIONS.map((r) => ({ n: r.n, label: r.label, on: r.n === region, onClick: () => setRegion(r.n) }))}
      />
      <DataTable
        rows={sorted.slice(0, 40)}
        rowKey={(r) => r.d.id}
        numbered={firstRowNumber([...VIEWS.map((v) => v.n), ...REGIONS.map((r) => r.n)])}
        onRowClick={(r, e) => openSecurity(panel, r.d.id, e)}
        columns={[
          { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink> },
          { key: 'n', label: 'Name', render: (r) => <span className="ellipsis" style={{ display: 'inline-block', maxWidth: 220 }}>{r.d.name}</span>, hideM: true },
          { key: 'l', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
          { key: 'c', label: 'Net Chg', num: true, render: (r) => <DayChg q={r.q} dec={r.d.dec} />, hideM: true },
          { key: 'p', label: '%Chg', num: true, render: (r) => <DayChg q={r.q} pct /> },
          { key: 'v', label: 'Volume', num: true, render: (r) => fmtBig(r.q.volume) },
          { key: 'r', label: 'Rel Vol', num: true, render: (r) => <span className={r.rel > 1.5 ? 'yellow' : ''} title="Today's volume so far over the average of the last 30 sessions, not adjusted for the time of day">{fmtNum(r.rel, 2)}x</span> },
          ...(view === 6
            ? [
                { key: 'h', label: '52Wk High', num: true, render: (r: (typeof rows)[number]) => fmtNum(r.hi, r.d.dec) },
                { key: 'hd', label: 'vs High', num: true, title: 'Last price against the 52-week high, in percent', render: (r: (typeof rows)[number]) => <Chg v={r.fromHi} pct dec={1} /> },
              ]
            : view === 7
              ? [
                  { key: 'lo', label: '52Wk Low', num: true, render: (r: (typeof rows)[number]) => fmtNum(r.lo, r.d.dec) },
                  { key: 'ld', label: 'vs Low', num: true, title: 'Last price against the 52-week low, in percent', render: (r: (typeof rows)[number]) => <Chg v={r.fromLo} pct dec={1} /> },
                ]
              : []),
          { key: 'val', label: 'Value USD', title: 'Estimated value traded: last price × volume', num: true, render: (r) => `≈${fmtBig(r.value)}`, hideM: true },
          { key: 'x', label: 'Exch', render: (r) => <span className="muted">{r.d.exch}</span>, hideM: true },
        ]}
      />
      <FreshnessLegend />
    </div>
  );
}
