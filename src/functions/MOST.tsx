import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { Chg, LivePx, SecLink, openSecurity } from '../components/cells';
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
  const sorted = [...rows].sort((a, b) => {
    switch (view) {
      case 2:
        return b.q.pct - a.q.pct;
      case 3:
        return a.q.pct - b.q.pct;
      case 4:
        return b.value - a.value;
      case 5:
        return b.rel - a.rel;
      default:
        return b.q.volume - a.q.volume;
    }
  });
  return (
    <div>
      <FnHeader
        code="MOST"
        title="Most Active Securities"
        sub="Equities in the Armin universe"
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
          { key: 'c', label: 'Net Chg', num: true, render: (r) => <Chg v={r.q.chg} dec={r.d.dec} />, hideM: true },
          { key: 'p', label: '%Chg', num: true, render: (r) => <Chg v={r.q.pct} pct /> },
          { key: 'v', label: 'Volume', num: true, render: (r) => fmtBig(r.q.volume) },
          { key: 'r', label: 'Rel Vol', num: true, render: (r) => <span className={r.rel > 1.5 ? 'yellow' : ''}>{fmtNum(r.rel, 2)}x</span> },
          { key: 'val', label: 'Value USD', num: true, render: (r) => fmtBig(r.value), hideM: true },
          { key: 'x', label: 'Exch', render: (r) => <span className="muted">{r.d.exch}</span>, hideM: true },
        ]}
      />
    </div>
  );
}
