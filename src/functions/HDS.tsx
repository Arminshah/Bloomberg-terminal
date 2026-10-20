import { useState } from 'react';
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
import { filterHoldings, holdingDates, holdingPercent } from '../data/ownership';

export function HDS({ sec }: FnProps) {
  return <Ownership key={sec!.id} sec={sec!} />;
}

function Ownership({ sec: s }: { sec: NonNullable<FnProps['sec']> }) {
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const [period, setPeriod] = useState('all');
  const all = holders(s);
  const dates = holdingDates(all);
  const list = filterHoldings(all, period);
  const bd = getRealFund(s.id)?.breakdown;
  const px = engine.quote(s.id)!.last * (s.minor ? 0.01 : 1);
  // Percent of the shares outstanding now (the source's own percentages use older share counts).
  const reportedShares = getRealFund(s.id)?.stats.shares;
  const out = reportedShares && reportedShares > 0 ? reportedShares : s.eq?.shares ?? NaN;
  const pctOf = (h: (typeof all)[number]) => holdingPercent(h, out);
  // Funds report positions their managers also file, so the total counts managers only.
  const managers = list.filter((h) => h.type !== 'Fund');
  const funds = list.length - managers.length;
  const knownPercentages = managers.map(pctOf).filter(Number.isFinite);
  const total = knownPercentages.length ? knownPercentages.reduce((a, pct) => a + pct, 0) : NaN;
  const max = Math.max(0, ...list.map((h) => pctOf(h)).filter(Number.isFinite));
  const rounded = (value: number) => Number.isFinite(value) ? Math.round(value) : '';
  const csv = () => [['Holder', 'Type', '% Out', 'Position', 'Change', 'Holdings as of (not filing date)', 'Source'], ...list.map((h) => [h.name, h.type, Number.isFinite(pctOf(h)) ? pctOf(h).toFixed(3) : '', rounded(h.shares), h.newOrDoubled ? 'new or doubled' : rounded(h.change), fmtDay(h.filed, true), h.source])];
  return (
    <div>
      <FnHeader code="HOLDERS" title="Security Ownership" sec={s} sub={<>Institutional holders · {sourceLabel(status, 'positions generated; real data needs the desktop app')}</>} actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_HDS.csv`, csv)} />
      <QuoteStrip sec={s} />
      <div className="qstrip">
        <label htmlFor={`holders-period-${panel}`}>Holdings as of </label>
        <select id={`holders-period-${panel}`} className="inp" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="all">All reported periods</option>
          <option value="latest">Latest reported period{dates.length ? ` · ${fmtDay(dates[0])}` : ''}</option>
          {dates.map((date) => <option key={date} value={String(date)}>{fmtDay(date, true)}</option>)}
        </select>
        <span className="muted">{list.length} of {all.length} positions · click As of to sort newest first</span>
      </div>
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
      <Section title="Top holders" right={`${managers.length} institutions hold ${fmtNum(total, 1)}% of shares outstanding${knownPercentages.length < managers.length ? ' (known percentages only)' : ''}${funds ? ` · ${funds} funds listed, already inside their managers' positions` : ''}`}>
        <DataTable
          rows={list}
          rowKey={(h) => h.name}
          numbered
          defaultSort={{ key: 'f', dir: -1 }}
          columns={[
            // The terminal's HDS order: holder, source, position and its change, % out, value, date and type.
            { key: 'n', label: 'Holder Name', render: (h) => h.name, sort: (h) => h.name },
            { key: 'src', label: 'Source', render: (h) => <span className="muted">{h.source}</span>, hideM: true },
            { key: 'pos', label: 'Position', num: true, render: (h) => fmtBig(h.shares), sort: (h) => h.shares },
            { key: 'c', label: 'Pos Chg', num: true, render: (h) => (h.newOrDoubled ? <span className="up">new or 2x</span> : <Chg v={h.change / 1e6} dec={2} />), sort: (h) => (h.newOrDoubled ? Infinity : h.change) },
            { key: 'p', label: '% Out', num: true, render: (h) => fmtNum(pctOf(h), 2), sort: (h) => pctOf(h) },
            { key: 'b', label: '', render: (h) => Number.isFinite(pctOf(h)) ? <HBar value={pctOf(h)} max={max} color="var(--amber)" /> : '--', width: 110, hideM: true },
            { key: 'mv', label: `Curr MV ${s.ccy === 'GBp' ? 'GBP' : s.ccy}`, num: true, render: (h) => fmtBig(h.shares * px), sort: (h) => h.shares, hideM: true },
            { key: 'f', label: 'As of', title: 'Sort by the date of the holding, newest first; this is not the SEC filing date', num: true, render: (h) => fmtDay(h.filed), sort: (h) => h.filed },
            { key: 'ty', label: 'Inst Type', render: (h) => <span className="muted">{h.type}</span>, hideM: true },
          ]}
        />
      </Section>
      <div className="note">
        % Out is the position over the {Number.isFinite(out) ? `${fmtNum(out, 2)}M ` : ''}shares outstanding now. Position change in millions of shares since the previous report; "new or 2x" where
        the source reports +100%, which it uses for new positions and doubled ones alike. As of is the date of the holding, not of the filing.
      </div>
    </div>
  );
}
