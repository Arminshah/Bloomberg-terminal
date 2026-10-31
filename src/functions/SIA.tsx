// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { fmtBig, fmtIso, fmtNum, fmtPct } from '../core/format';
import { shortMarketAvailable, useMarketShorts, type ShortLine } from '../data/live/short-market';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * SIA, the market's short interest at a settlement: the US listings with the most shares sold short, the most as a
 * share of their shares outstanding, the most days to cover, and the largest rises and falls since the settlement
 * before, from FINRA's consolidated short interest (listings trading over 500,000 shares a day). A stock's own history
 * is on SHORTINTEREST.
 */

export interface RankedShort extends ShortLine {
  /** Short interest as a share of the shares outstanding, in percent; NaN without them. */
  pctOut: number;
}

export const VIEWS = [
  { n: 1, label: 'Most shorted', key: 'shares' },
  { n: 2, label: '% of shares', key: 'pctOut' },
  { n: 3, label: 'Days to cover', key: 'daysToCover' },
  { n: 4, label: 'Rising', key: 'rising' },
  { n: 5, label: 'Falling', key: 'falling' },
] as const;

/** Rises and falls count only positions of at least this many shares: a few thousand shares doubling says little. */
export const MIN_MOVE_SHARES = 1_000_000;

/** The listings ranked for a view, the OTC market left out unless asked for. */
export function rankShorts(lines: RankedShort[], view: (typeof VIEWS)[number]['key'], otc: boolean): RankedShort[] {
  const listed = lines.filter((l) => otc || l.market !== 'OTC');
  const by = (f: (l: RankedShort) => number) => listed.filter((l) => Number.isFinite(f(l))).sort((a, b) => f(b) - f(a) || a.symbol.localeCompare(b.symbol));
  switch (view) {
    case 'shares':
      return by((l) => l.shares);
    case 'pctOut':
      return by((l) => l.pctOut);
    case 'daysToCover':
      return by((l) => l.daysToCover);
    case 'rising':
      return by((l) => (l.shares >= MIN_MOVE_SHARES && !l.split && l.changePct > 0 ? l.changePct : NaN));
    case 'falling':
      return by((l) => (l.prior >= MIN_MOVE_SHARES && !l.split && l.changePct < 0 ? -l.changePct : NaN));
  }
}

const MARKETS: Record<string, string> = { NYSE: 'NYSE', NNM: 'Nasdaq', SC: 'Nasdaq CM', AMEX: 'NYSE American', ARCA: 'NYSE Arca', BZX: 'Cboe BZX', OTC: 'OTC' };
const SHOWN = 300;

export function SIA(_props: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [back, setBack] = useState(0);
  const [otc, setOtc] = useState(false);
  const [filter, setFilter] = useState('');
  const m = useMarketShorts(back);
  const view = VIEWS.find((v) => v.n === tab) ?? VIEWS[0];
  const typed = filter.trim().toUpperCase();
  const lines: RankedShort[] = m.lines.map((l) => {
    const out = m.outstanding(l.symbol);
    return { ...l, name: m.listedName(l.symbol) ?? l.name, pctOut: out > 0 ? (l.shares / out) * 100 : NaN };
  });
  const ranked = rankShorts(lines, view.key, otc).filter((l) => !typed || l.symbol.includes(typed) || l.name.toUpperCase().includes(typed));
  const rows = ranked.slice(0, SHOWN);
  const columns: Column<RankedShort>[] = [
    { key: 'sym', label: 'Ticker', render: (l) => <span className="amber">{l.symbol}</span>, sort: (l) => l.symbol },
    { key: 'name', label: 'Name', render: (l) => l.name, sort: (l) => l.name, hideM: true },
    { key: 'mkt', label: 'Market', render: (l) => MARKETS[l.market] ?? l.market, sort: (l) => l.market, hideN: true },
    { key: 'shares', label: 'Short interest', num: true, render: (l) => fmtBig(l.shares, 2), sort: (l) => l.shares, cls: () => 'white' },
    { key: 'chg', label: 'Change', num: true, render: (l) => (Number.isFinite(l.changePct) ? fmtPct(l.changePct, 1) : ''), sort: (l) => l.changePct, cls: (l) => (l.changePct > 0 ? 'up' : l.changePct < 0 ? 'dn' : '') },
    { key: 'prior', label: 'Before', num: true, render: (l) => (Number.isFinite(l.prior) ? fmtBig(l.prior, 2) : ''), sort: (l) => l.prior, hideM: true },
    { key: 'pct', label: '% of shares', num: true, render: (l) => (Number.isFinite(l.pctOut) ? fmtNum(l.pctOut, 2) : ''), sort: (l) => l.pctOut, title: 'Short interest over the shares outstanding (Nasdaq’s market value over its price)' },
    { key: 'dtc', label: 'Days to cover', num: true, render: (l) => fmtNum(l.daysToCover, 2), sort: (l) => l.daysToCover },
    { key: 'adv', label: 'Avg volume', num: true, render: (l) => fmtBig(l.avgVolume, 2), sort: (l) => l.avgVolume, hideN: true },
    { key: 'flag', label: '', render: (l) => (l.split ? 'Split' : ''), cls: () => 'muted', hideM: true },
  ];
  const csv = () => [
    ['Settlement', 'Ticker', 'Name', 'Market', 'Short interest', 'Before', 'Change %', '% of shares outstanding', 'Days to cover', 'Average daily volume', 'Split'],
    ...ranked.map((l) => [m.date ?? '', l.symbol, l.name, l.market, l.shares, l.prior, l.changePct, l.pctOut, l.daysToCover, l.avgVolume, l.split ? 'yes' : '']),
  ];
  const status = m.state === 'loading' ? (m.date ? `Reading FINRA's settlement of ${fmtIso(m.date)}…` : 'Finding FINRA’s latest settlement…') : m.state === 'error' ? m.message ?? 'FINRA did not answer.' : '';
  return (
    <div>
      <FnHeader
        code="SHORTRANKING"
        title="Short Interest Analysis"
        sub={<><RealBadge /> FINRA consolidated short interest{m.date ? `, settlement ${fmtIso(m.date)}` : ''} · listings trading over 500,000 shares a day</>}
        tabs={VIEWS.map((v) => ({ n: v.n, label: v.label }))}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `SIA_${view.key}_${m.date ?? ''}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Settlement
              <select className="sel-inp" aria-label="Settlement" value={back} onChange={(e) => setBack(Number(e.target.value))} disabled={!m.dates.length}>
                {(m.dates.length ? m.dates : ['']).map((d, i) => (
                  <option key={d || 'none'} value={i}>
                    {d ? `${fmtIso(d)}${i === 0 ? ' (latest)' : ''}` : '…'}
                  </option>
                ))}
              </select>
            </label>
            <label className="chk">
              <input type="checkbox" checked={otc} onChange={(e) => setOtc(e.target.checked)} /> Include OTC
            </label>
            <input className="inp" aria-label="Filter the list" placeholder="Ticker or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
            {status && <span className="muted" role="status">{status}</span>}
          </div>
        }
      />
      {!shortMarketAvailable() ? (
        <div className="empty">The market&apos;s short interest is read from FINRA in the desktop app. The browser demo has none, and none is generated.</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(l) => l.symbol}
            onRowClick={(l) => execute(panel, `${l.symbol.replace('.', '/')} US EQUITY SHORTINTEREST`)}
            numbered={10}
            empty={status || 'No listing in this view.'}
          />
          <div className="note">
            {ranked.length > SHOWN ? `The first ${SHOWN} of ${ranked.length}. ` : ''}Short interest is the shares sold short at the settlement, as brokers report them to FINRA; days to
            cover divide it by the average daily volume. Rises and falls count positions of a million shares or more, without a stock split between the two
            settlements. % of shares uses Nasdaq&apos;s market value over its price.
          </div>
        </>
      )}
    </div>
  );
}
