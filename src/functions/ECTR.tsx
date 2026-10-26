import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { fmtBig, fmtNum, fmtPct, signClass } from '../core/format';
import { AREA_GROUPS, imtsAvailable, isEconomy, latestYear, monthLabel, monthRows, tradeRows, useTrade, WORLD, type PartnerTrade } from '../data/live/imts';
import { CREDITS } from '../components/Credits';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * ECTR, trade flows: an economy's goods exports and imports with each partner country and group, from the IMF's
 * International Trade in Goods by partner country (formerly the Direction of Trade Statistics), for any of the last
 * ten years with the change on the year before and each partner's share; a partner's trade by year on a chart; and
 * its last 24 months.
 */

/** The economy a command names ("ECTR DEU"); the United States otherwise. */
export function reporterOf(args: string | undefined): string {
  const a = (args ?? '').trim().toUpperCase().split(/\s+/)[0] ?? '';
  return /^[A-Z]{3}$/.test(a) ? a : 'USA';
}

/** The years with any figure, latest first. */
export function yearsOf(trade: Record<string, PartnerTrade>): string[] {
  const ys = new Set<string>();
  for (const p of Object.values(trade)) for (const y of [...Object.keys(p.x), ...Object.keys(p.m)]) if (/^\d{4}$/.test(y)) ys.add(y);
  return [...ys].sort().reverse();
}

const usd = (v: number) => (Number.isFinite(v) ? fmtBig(v, 1) : '');
const chg = (v: number) => (Number.isFinite(v) ? fmtPct(v, 1) : '');
const DEPTH = new Map(AREA_GROUPS);
const X_COLOR = '#45d3e6';
const M_COLOR = '#f0a030';

export function ECTR({ route }: FnProps) {
  const panel = usePanelId();
  const [reporter, setReporter] = useState(reporterOf(route.args));
  const [tab, setTab] = useState(1);
  const [year, setYear] = useState('');
  const [words, setWords] = useState('');
  const [partner, setPartner] = useState(WORLD);
  const { annual, monthly, names } = useTrade(reporter, partner, tab === 3);
  const trade = annual?.state === 'ok' ? annual.data : {};
  const years = yearsOf(trade);
  const shown = years.includes(year) ? year : latestYear(trade);
  const rows = tab === 3 ? [] : tradeRows(trade, names, shown, tab === 1 ? 'partners' : 'regions', words);
  const name = (c: string) => names[c] ?? c;
  const reporters = Object.keys(names).filter(isEconomy).sort((a, b) => name(a).localeCompare(name(b)));
  if (!reporters.includes(reporter)) reporters.unshift(reporter);
  const p = trade[partner];
  const byYear = (rec: Record<string, number> | undefined) => Object.entries(rec ?? {}).filter(([y]) => /^\d{4}$/.test(y)).map(([y, v]) => ({ x: Number(y), y: v })).sort((a, b) => a.x - b.x);
  const yearChart: XYSeries[] = [
    { label: `Exports to ${name(partner)}`, color: X_COLOR, points: byYear(p?.x), markers: true },
    { label: `Imports from ${name(partner)}`, color: M_COLOR, points: byYear(p?.m), markers: true },
  ].filter((s) => s.points.length);
  const yearTicks = [...new Set(yearChart.flatMap((c) => c.points.map((pt) => pt.x)))].sort((a, b) => a - b).map((v) => ({ v, label: String(v) }));
  const months = monthRows(monthly?.state === 'ok' ? monthly.data[partner] : undefined);
  // Months on the x axis: year * 12 + month - 1.
  const monthX = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(6)) - 1;
  const monthName = (v: number) => monthLabel(`${Math.floor(v / 12)}-M${String((v % 12) + 1).padStart(2, '0')}`);
  const monthChart: XYSeries[] = [
    { label: 'Exports', color: X_COLOR, points: months.filter((r) => Number.isFinite(r.x)).map((r) => ({ x: monthX(r.period), y: r.x })).reverse() },
    { label: 'Imports', color: M_COLOR, points: months.filter((r) => Number.isFinite(r.m)).map((r) => ({ x: monthX(r.period), y: r.m })).reverse() },
  ].filter((s) => s.points.length);
  // A tick each quarter, on January, April, July and October.
  const monthTicks = [...new Set(monthChart.flatMap((c) => c.points.map((pt) => pt.x)))].filter((v) => v % 3 === 0).sort((a, b) => a - b).map((v) => ({ v, label: monthName(v) }));
  const csv = () =>
    tab === 3
      ? [['Month', 'Exports (US$)', 'Imports (US$)', 'Balance (US$)'], ...months.map((r) => [r.period, r.x, r.m, r.balance].map((v) => (typeof v === 'number' && !Number.isFinite(v) ? '' : v)))]
      : [['Code', 'Partner', 'Exports (US$)', 'Imports (US$)', 'Balance (US$)', 'Share %'], ...rows.map((r) => [r.code, r.name, r.x, r.m, r.balance, r.share].map((v) => (typeof v === 'number' && !Number.isFinite(v) ? '' : v)))];
  const part = tab === 3 ? monthly : annual;
  const status = !imtsAvailable()
    ? 'Trade by partner is read from the IMF in the desktop app. The browser demo has none, and none is generated.'
    : !annual || annual.state === 'loading'
      ? 'Reading the IMF’s trade figures…'
      : annual.state === 'error'
        ? annual.message
        : !years.length
          ? `The IMF has no trade figures for ${name(reporter)}.`
          : tab === 3 && (!part || part.state === 'loading')
            ? `Reading the IMF’s monthly figures for ${name(reporter)} with ${name(partner)}…`
            : part?.state === 'error'
              ? part.message
              : '';
  return (
    <div>
      <FnHeader
        code="TRADEFLOWS"
        title="Trade Flows"
        sub={<><RealBadge /> IMF International Trade in Goods · {name(reporter)}, goods in US dollars, {tab === 3 ? `by month · Partner: ${name(partner)}` : shown}</>}
        tabs={[{ n: 1, label: 'Partners' }, { n: 2, label: 'Regions' }, { n: 3, label: 'Monthly' }]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `ECTR_${reporter}_${tab === 3 ? partner : shown}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Economy
              <select className="sel-inp" aria-label="Economy" value={reporter} onChange={(e) => { setReporter(e.target.value); setPartner(WORLD); }}>
                {reporters.map((c) => (
                  <option key={c} value={c}>{name(c)}</option>
                ))}
              </select>
            </label>
            {tab !== 3 && (
              <>
                <label className="fld">
                  Year
                  <select className="sel-inp" aria-label="Year" value={shown} onChange={(e) => setYear(e.target.value)}>
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <input className="inp" aria-label="Find a partner" placeholder="Partner" value={words} onChange={(e) => setWords(e.target.value)} />
              </>
            )}
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : tab === 3 ? (
        <>
          {monthChart.length > 0 && <XYChart series={monthChart} xTicks={monthTicks} yFormat={(v) => fmtBig(v, 1)} height={200} legend />}
          <table className="tbl" aria-label="Monthly trade">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Exports</th>
                <th className="num">Imports</th>
                <th className="num">Balance</th>
                <th className="num">Exports y/y</th>
                <th className="num">Imports y/y</th>
              </tr>
            </thead>
            <tbody>
              {months.map((r) => (
                <tr key={r.period}>
                  <td>{monthLabel(r.period)}</td>
                  <td className="num">{usd(r.x)}</td>
                  <td className="num">{usd(r.m)}</td>
                  <td className={`num ${signClass(r.balance)}`}>{usd(r.balance)}</td>
                  <td className={`num ${signClass(r.xChg)}`}>{chg(r.xChg)}</td>
                  <td className={`num ${signClass(r.mChg)}`}>{chg(r.mChg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {months.length === 0 && <div className="empty">The IMF has no monthly figures for {name(reporter)} with {name(partner)}.</div>}
          <div className="note">
            Pick a partner on the Partners or Regions tab to see its months. The latest months are the ones the IMF has received; y/y is the change on the
            same month a year before. {CREDITS.imfTrade}
          </div>
        </>
      ) : (
        <>
          {yearChart.length > 0 && <XYChart series={yearChart} xTicks={yearTicks} yFormat={(v) => fmtBig(v, 1)} height={200} legend />}
          <table className="tbl" aria-label="Trade by partner">
            <thead>
              <tr>
                <th>{tab === 1 ? 'Partner' : 'Region or group'}</th>
                <th className="num">Exports</th>
                <th className="num">Imports</th>
                <th className="num">Balance</th>
                <th className="num">Total</th>
                <th className="num">Share</th>
                <th className="num">Exports chg</th>
                <th className="num">Imports chg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className={`click${r.code === partner ? ' sel' : ''}`} onClick={() => setPartner(r.code)}>
                  <td className={r.code === WORLD ? 'amber' : undefined} style={DEPTH.get(r.code) ? { paddingLeft: `${DEPTH.get(r.code)! * 12 + 4}px` } : undefined}>{r.name}</td>
                  <td className="num">{usd(r.x)}</td>
                  <td className="num">{usd(r.m)}</td>
                  <td className={`num ${signClass(r.balance)}`}>{usd(r.balance)}</td>
                  <td className="num white">{usd(r.total)}</td>
                  <td className="num">{Number.isFinite(r.share) ? `${fmtNum(r.share, 1)}%` : ''}</td>
                  <td className={`num ${signClass(r.xChg)}`}>{chg(r.xChg)}</td>
                  <td className={`num ${signClass(r.mChg)}`}>{chg(r.mChg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">No partner matches.</div>}
          <div className="note">
            {name(reporter)}&apos;s goods trade as the IMF publishes it: exports free on board, imports with cost, insurance and freight, in US dollars; the
            balance is exports less imports, the share is of its trade with the world, and the changes are on {Number(shown) - 1}. The IMF labels these
            figures mixed-type data. A row draws that partner&apos;s trade by year. {CREDITS.imfTrade}
          </div>
        </>
      )}
    </div>
  );
}
