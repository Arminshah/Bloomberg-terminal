import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { DataTable } from '../components/DataTable';
import { Chg, HBar, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { engine } from '../data/market';
import { holders } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { getRealFund, useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';

export function HDS({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const list = holders(s);
  const bd = getRealFund(s.id)?.breakdown;
  const px = engine.quote(s.id)!.last * (s.minor ? 0.01 : 1);
  // Funds report positions their managers also file, so the total counts managers only.
  const managers = list.filter((h) => h.type !== 'Fund');
  const funds = list.length - managers.length;
  const total = managers.reduce((a, h) => a + h.pct, 0);
  const max = Math.max(...list.map((h) => h.pct));
  const csv = () => [['Holder', 'Type', '% Out', 'Position', 'Change', 'Filed', 'Source'], ...list.map((h) => [h.name, h.type, h.pct.toFixed(3), Math.round(h.shares), Math.round(h.change), fmtDay(h.filed, true), h.source])];
  return (
    <div>
      <FnHeader code="HDS" title="Security Ownership" sec={s} sub={<>Institutional holders · {sourceLabel(status, 'positions generated; real data needs the desktop app')}</>} actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_HDS.csv`, csv)} />
      <QuoteStrip sec={s} />
      {bd && (
        <div className="qstrip">
          <span>
            <span className="lbl">Insiders</span>
            {fmtNum(bd.insiders, 2)}%
          </span>
          <span>
            <span className="lbl">Institutions</span>
            {fmtNum(bd.institutions, 2)}%
          </span>
          <span>
            <span className="lbl">Of float</span>
            {fmtNum(bd.institutionsFloat, 2)}%
          </span>
          <span>
            <span className="lbl">Institutions holding</span>
            {fmtNum(bd.count, 0)}
          </span>
        </div>
      )}
      <Section title="Top holders" right={`${managers.length} institutions hold ${fmtNum(total, 1)}% of shares outstanding${funds ? ` · ${funds} funds listed, already inside their managers' positions` : ''}`}>
        <DataTable
          rows={list}
          rowKey={(h) => h.name}
          numbered
          defaultSort={{ key: 'p', dir: -1 }}
          columns={[
            { key: 'n', label: 'Holder name', render: (h) => h.name, sort: (h) => h.name },
            { key: 'ty', label: 'Type', render: (h) => <span className="muted">{h.type}</span>, hideM: true },
            { key: 'p', label: '% Out', num: true, render: (h) => fmtNum(h.pct, 2), sort: (h) => h.pct },
            { key: 'b', label: '', render: (h) => <HBar value={h.pct} max={max} color="var(--amber)" />, width: 120, hideM: true },
            { key: 'pos', label: 'Position', num: true, render: (h) => fmtBig(h.shares), sort: (h) => h.shares },
            { key: 'mv', label: `Mkt val ${s.ccy === 'GBp' ? 'GBP' : s.ccy}`, num: true, render: (h) => fmtBig(h.shares * px), sort: (h) => h.shares, hideM: true },
            { key: 'c', label: 'Pos chg', num: true, render: (h) => <Chg v={h.change / 1e6} dec={2} />, sort: (h) => h.change },
            { key: 'f', label: 'Filed', render: (h) => fmtDay(h.filed), hideM: true },
            { key: 'src', label: 'Source', render: (h) => <span className="muted">{h.source}</span>, hideM: true },
          ]}
        />
      </Section>
      <div className="note">Position change in millions of shares since the previous filing.</div>
    </div>
  );
}
