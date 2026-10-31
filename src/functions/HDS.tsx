import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { HBar, KV, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { engine } from '../data/market';
import { holders } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { getRealFund, useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import { filterHoldings, holdingDates, holdingPercent } from '../data/ownership';
import { InsiderSection } from './MGMT';
import { loadInsiders } from '../data/live/insiders';
import { secAvailable, secTicker, useSecLoad } from '../data/live/sec';

export function HDS({ sec }: FnProps) {
  return <Ownership key={sec!.id} sec={sec!} />;
}

const HDS_TABS = [
  { n: 1, label: 'Current' },
  { n: 4, label: 'Ownership Summary' },
  { n: 5, label: 'Insider Transactions' },
];

function Ownership({ sec: s }: { sec: NonNullable<FnProps['sec']> }) {
  const panel = usePanelId();
  const { status } = useFundamentals(s);
  const [tab, setTab] = useState(1);
  const [period, setPeriod] = useState('all');
  const [group, setGroup] = useState<'all' | 'Institution' | 'Fund'>('all');
  const all = holders(s);
  const dates = holdingDates(all);
  // Newest holdings first, so equal positions keep that order under the position sort.
  const list = filterHoldings(all, period)
    .filter((h) => group === 'all' || h.type === group)
    .slice()
    .sort((a, b) => (Number.isFinite(b.filed) ? b.filed : -Infinity) - (Number.isFinite(a.filed) ? a.filed : -Infinity));
  const real = getRealFund(s.id);
  const bd = real?.breakdown;
  const fl = real?.float;
  const px = engine.quote(s.id)!.last * (s.minor ? 0.01 : 1);
  // Percent of the shares outstanding now (the source's own percentages use older share counts).
  const reportedShares = real?.stats.shares;
  const out = reportedShares && reportedShares > 0 ? reportedShares : s.eq?.shares ?? NaN;
  const pctOf = (h: (typeof all)[number]) => holdingPercent(h, out);
  // Funds report positions their managers also file, so the total counts managers only.
  const managers = list.filter((h) => h.type !== 'Fund');
  const funds = list.length - managers.length;
  const knownPercentages = managers.map(pctOf).filter(Number.isFinite);
  const total = knownPercentages.length ? knownPercentages.reduce((a, pct) => a + pct, 0) : NaN;
  const max = Math.max(0, ...list.map((h) => pctOf(h)).filter(Number.isFinite));
  const rounded = (value: number) => Number.isFinite(value) ? Math.round(value) : '';
  const floatPct = fl && Number.isFinite(fl.float) && Number.isFinite(out) && out > 0 ? (fl.float / (out * 1e6)) * 100 : NaN;
  const siPct = fl && Number.isFinite(fl.short) && Number.isFinite(out) && out > 0 ? (fl.short / (out * 1e6)) * 100 : NaN;
  const insiders = useSecLoad(tab === 5 && secAvailable() && secTicker(s) ? `insiders:${s.id}` : null, () => loadInsiders(s));
  const csv = () => [['Holder', 'Type', '% Out', 'Position', 'Change', 'Holdings as of (not filing date)', 'Source'], ...list.map((h) => [h.name, h.type, Number.isFinite(pctOf(h)) ? pctOf(h).toFixed(3) : '', rounded(h.shares), h.newOrDoubled ? 'new or doubled' : rounded(h.change), fmtDay(h.filed, true), h.source])];
  const top10 = [...managers].sort((a, b) => (pctOf(b) || 0) - (pctOf(a) || 0)).slice(0, 10).reduce((a, h) => a + (Number.isFinite(pctOf(h)) ? pctOf(h) : 0), 0);
  return (
    <div>
      <FnHeader
        code="HOLDERS"
        title="Security Ownership"
        sec={s}
        tabs={HDS_TABS}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_HDS.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Holder Group
              <select className="sel-inp" aria-label="Holder group" value={group} onChange={(e) => setGroup(e.target.value as 'all' | 'Institution' | 'Fund')}>
                <option value="all">All Holders</option>
                <option value="Institution">Investment Managers</option>
                <option value="Fund">Funds</option>
              </select>
            </label>
            <label className="fld" htmlFor={`holders-period-${panel}`}>
              Holdings as of
              <select id={`holders-period-${panel}`} className="sel-inp" value={period} onChange={(event) => setPeriod(event.target.value)}>
                <option value="all">All reported periods</option>
                <option value="latest">Latest reported period{dates.length ? ` · ${fmtDay(dates[0])}` : ''}</option>
                {dates.map((date) => <option key={date} value={String(date)}>{fmtDay(date, true)}</option>)}
              </select>
            </label>
            <span className="muted">{sourceLabel(status, 'positions generated; real data needs the desktop app')}</span>
          </div>
        }
      />
      <div className="qstrip hds-stats">
        <span><span className="lbl">Shrs Out</span>{Number.isFinite(out) ? `${fmtNum(out, 1)}M` : '--'}</span>
        <span><span className="lbl">% Out</span>{fmtNum(total, 2)}</span>
        <span><span className="lbl">Float/Shrs Out</span>{fmtNum(floatPct, 2)}</span>
        <span><span className="lbl">SI % Out</span>{fmtNum(siPct, 2)}</span>
        {bd && <span><span className="lbl">Insiders</span>{fmtNum(bd.insiders, 2)}%</span>}
        {bd && <span><span className="lbl">Institutions</span>{fmtNum(bd.institutions, 2)}%</span>}
      </div>
      {tab === 1 && (
        <>
          <Section title="Current holders" right={`${managers.length} investment managers hold ${fmtNum(total, 1)}% of shares outstanding${knownPercentages.length < managers.length ? ' (known percentages only)' : ''}${funds ? ` · ${funds} funds listed, already inside their managers' positions` : ''}`}>
            <DataTable
              rows={list}
              rowKey={(h) => h.name}
              numbered
              defaultSort={{ key: 'pos', dir: -1 }}
              columns={[
                // The terminal's HDS order: holder, position, % out, date, source, and the latest change.
                { key: 'n', label: 'Holder Name', render: (h) => <span className="amber">{h.name}</span>, sort: (h) => h.name },
                { key: 'pos', label: 'Position', num: true, render: (h) => fmtNum(h.shares, 0), sort: (h) => h.shares },
                { key: 'p', label: '% Out', num: true, render: (h) => fmtNum(pctOf(h), 2), sort: (h) => pctOf(h) },
                { key: 'b', label: '', render: (h) => Number.isFinite(pctOf(h)) ? <HBar value={pctOf(h)} max={max} color="var(--amber)" /> : '', width: 90, hideM: true },
                { key: 'f', label: 'File Dt', title: 'Sort by the date of the holding (the period the filing reports), not the day it was filed', num: true, render: (h) => fmtDay(h.filed), sort: (h) => h.filed },
                { key: 'src', label: 'Source', render: (h) => <span className="muted">{h.source}</span>, hideM: true },
                { key: 'c', label: 'Latest Chg', num: true, render: (h) => (h.newOrDoubled ? <span className="up">new or 2x</span> : <span className={h.change > 0 ? 'up' : h.change < 0 ? 'dn' : ''}>{Number.isFinite(h.change) ? `${h.change > 0 ? '+' : ''}${fmtNum(h.change, 0)}` : '--'}</span>), sort: (h) => (h.newOrDoubled ? Infinity : h.change) },
                { key: 'mv', label: `Mkt Val ${s.ccy === 'GBp' ? 'GBP' : s.ccy}`, num: true, render: (h) => fmtBig(h.shares * px), sort: (h) => h.shares, hideM: true },
                { key: 'ty', label: 'Holder Type', render: (h) => <span className="muted">{h.type === 'Fund' ? 'Mutual Fund' : 'Investment Advisor'}</span>, hideM: true },
              ]}
            />
          </Section>
          <div className="note">
            % Out is the position over the {Number.isFinite(out) ? `${fmtNum(out, 2)}M ` : ''}shares outstanding now. Latest Chg is the change in shares since the holder&apos;s previous report; &quot;new or 2x&quot; where
            the source reports +100%, which it uses for new positions and doubled ones alike. File Dt is the date of the holding, not of the filing.
          </div>
        </>
      )}
      {tab === 4 && (
        <div className="cols">
          <Section title="Ownership summary">
            <KV
              items={[
                ['Shares outstanding', Number.isFinite(out) ? `${fmtNum(out, 1)}M` : '--'],
                ['Float', fl && Number.isFinite(fl.float) ? fmtBig(fl.float) : '--'],
                ['Held by institutions', bd ? `${fmtNum(bd.institutions, 2)}%` : '--'],
                ['Institutions, % of float', bd ? `${fmtNum(bd.institutionsFloat, 2)}%` : '--'],
                ['Held by insiders', bd ? `${fmtNum(bd.insiders, 2)}%` : '--'],
                ['Number of institutions', bd ? fmtNum(bd.count, 0) : '--'],
                ['Top 10 managers, % out', fmtNum(top10, 2)],
                ['Short interest, % out', fmtNum(siPct, 2)],
              ]}
            />
          </Section>
          <Section title="By holder type">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Holder Type</th>
                  <th className="num">Holders</th>
                  <th className="num">% Out</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(['Institution', 'Fund'] as const).map((t) => {
                  const hs = filterHoldings(all, period).filter((h) => h.type === t);
                  const pct = hs.reduce((a, h) => a + (Number.isFinite(pctOf(h)) ? pctOf(h) : 0), 0);
                  return (
                    <tr key={t}>
                      <td className="amber">{t === 'Fund' ? 'Mutual Funds' : 'Investment Advisors'}</td>
                      <td className="num">{hs.length}</td>
                      <td className="num white">{fmtNum(pct, 2)}</td>
                      <td><HBar value={pct} max={100} color="var(--amber)" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="note">Fund positions are part of their managers&apos; positions, so the two lines overlap.</div>
          </Section>
        </div>
      )}
      {tab === 5 && (
        <Section title="Insider transactions, last 12 months (SEC Form 4)">
          {!secAvailable() || !secTicker(s) ? (
            <div className="empty">Insider transactions come from SEC EDGAR for US-listed companies (desktop app, with SEC_USER_AGENT set on PROVIDERS).</div>
          ) : insiders.loading || !insiders.result ? (
            <div className="empty">Reading the insiders&apos; Form 4 filings from SEC EDGAR…</div>
          ) : !insiders.result.ok ? (
            <div className="empty">{insiders.result.message}</div>
          ) : !insiders.result.data.trades.length ? (
            <div className="empty">No insider transactions in the Form 4 filings of the last 12 months.</div>
          ) : (
            <InsiderSection report={insiders.result.data} />
          )}
        </Section>
      )}
    </div>
  );
}
