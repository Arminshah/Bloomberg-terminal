import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { DayChg, LivePx, SecLink, openSecurity } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { fmtBig, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { rangeStats, toUsd } from '../data/analytics';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const VIEWS = [
  { n: 1, label: 'Most Active' },
  { n: 2, label: 'Gainers' },
  { n: 3, label: 'Losers' },
  { n: 4, label: 'Value Traded' },
  { n: 5, label: 'Unusual Volume' },
];
const REGIONS: { n: number; label: string; f: (d: SecurityDef) => boolean }[] = [
  { n: 11, label: 'US', f: (d) => d.country === 'US' },
  { n: 12, label: 'Europe', f: (d) => d.region === 'EMEA' },
  { n: 13, label: 'Asia', f: (d) => d.region === 'APAC' },
  { n: 14, label: 'All', f: () => true },
];

export function MOST(_: FnProps) {
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
      return { d, q, value: toUsd(px * q.volume, d.ccy === 'GBp' ? 'GBP' : d.ccy), rel: rs.avgVol30 > 0 ? q.volume / rs.avgVol30 : NaN };
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
      default:
        return rank(a.q.volume, b.q.volume);
    }
  });
  return (
    <div>
      <FnHeader
        code="MOVERS"
        title="Most Active Securities"
        sub="Equities in the Armin universe · value traded is estimated as last price × volume"
        tabs={VIEWS.map((v) => ({ n: v.n, label: v.label }))}
        tab={view}
        onTab={setView}
        actions={REGIONS.map((r) => ({ n: r.n, label: r.label, on: r.n === region, onClick: () => setRegion(r.n) }))}
      />
      <DataTable
        rows={sorted.slice(0, 40)}
        rowKey={(r) => r.d.id}
        numbered
        onRowClick={(r, e) => openSecurity(panel, r.d.id, e)}
        columns={[
          { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink> },
          { key: 'n', label: 'Name', render: (r) => <span className="ellipsis" style={{ display: 'inline-block', maxWidth: 220 }}>{r.d.name}</span>, hideM: true },
          { key: 'l', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
          { key: 'c', label: 'Net Chg', num: true, render: (r) => <DayChg q={r.q} dec={r.d.dec} />, hideM: true },
          { key: 'p', label: '%Chg', num: true, render: (r) => <DayChg q={r.q} pct /> },
          { key: 'v', label: 'Volume', num: true, render: (r) => fmtBig(r.q.volume) },
          { key: 'r', label: 'Rel Vol', num: true, render: (r) => <span className={r.rel > 1.5 ? 'yellow' : ''}>{fmtNum(r.rel, 2)}x</span> },
          { key: 'val', label: 'Value USD', title: 'Estimated value traded: last price × volume', num: true, render: (r) => `≈${fmtBig(r.value)}`, hideM: true },
          { key: 'x', label: 'Exch', render: (r) => <span className="muted">{r.d.exch}</span>, hideM: true },
        ]}
      />
      <FreshnessLegend />
    </div>
  );
}
