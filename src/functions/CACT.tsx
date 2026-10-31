// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine } from '../data/market';
import { corpCalendarAvailable, useCorpCalendar, type DividendEvent, type SplitEvent } from '../data/live/corp-calendar';
import { tickerKey } from '../data/live/earnings-calendar';
import { monthsBetween, useIpoCalendar, type IpoDeal } from '../data/live/ipo';
import { nasdaqSymbol } from '../data/live/nasdaq-company';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { portfolio, watchlists } from '../terminal/userdata';
import type { FnProps } from '../terminal/types';

/**
 * CACT, corporate actions across companies: the dividends going ex, the stock splits and the IPOs of a period for
 * every US-listed company, your watchlist or your portfolio, from Nasdaq's public calendars (desktop app). A
 * company's own actions, with its filings, are on CORPACTIONS; its buybacks on BUYBACKS.
 */

const SPANS = [
  { n: 1, label: 'Next 2 weeks', from: 0, to: 14 },
  { n: 2, label: 'This week', from: -3, to: 7 },
  { n: 3, label: 'Past month', from: -30, to: 0 },
  { n: 4, label: 'Next 3 months', from: 0, to: 90 },
];

type Scope = 'all' | 'watchlist' | 'portfolio';

const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);
/** The Nasdaq symbols of the US-listed stocks among `ids` (a watchlist's or a portfolio's lines). */
export const usTickers = (ids: string[]) =>
  new Set([...new Set(ids)].map((id) => nasdaqSymbol(engine.get(id))).filter((t): t is string => !!t).map(tickerKey));

/** A split's ratio as it is said: "3-for-1", "1-for-20". */
export const ratioText = (s: Pick<SplitEvent, 'newShares' | 'oldShares'>) => `${fmtNum(s.newShares, s.newShares % 1 ? 2 : 0)}-for-${fmtNum(s.oldShares, s.oldShares % 1 ? 2 : 0)}`;

/** The events of a period, for the companies asked for (all when `only` is undefined), soonest first. */
export function inPeriod<T>(rows: T[], date: (r: T) => number, symbol: (r: T) => string, from: number, to: number, only?: Set<string>): T[] {
  return rows.filter((r) => date(r) >= from && date(r) <= to && (!only || only.has(tickerKey(symbol(r))))).sort((a, b) => date(a) - date(b) || symbol(a).localeCompare(symbol(b)));
}

export function CACT(_props: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [span, setSpan] = useState(1);
  const [scope, setScope] = useState<Scope>('all');
  const [filter, setFilter] = useState('');
  const sp = SPANS.find((x) => x.n === span) ?? SPANS[0];
  const today = Date.parse(`${isoOf(Date.now())}T00:00:00Z`);
  const from = isoOf(today + sp.from * DAY_MS);
  const to = isoOf(today + sp.to * DAY_MS);
  const lo = Date.parse(`${from}T00:00:00Z`);
  const hi = Date.parse(`${to}T00:00:00Z`) + DAY_MS - 1;
  const cal = useCorpCalendar(from, to);
  const ipo = useIpoCalendar(tab === 3 ? monthsBetween(from.slice(0, 7), to.slice(0, 7)) : [], false);
  const wl = watchlists.use((w) => w.lists[w.active] ?? w.lists[0]);
  const held = portfolio.use((p) => p.positions);
  const only = useMemo(() => (scope === 'watchlist' ? usTickers(wl?.ids ?? []) : scope === 'portfolio' ? usTickers(held.map((p) => p.id)) : undefined), [scope, wl, held]);
  const typed = filter.trim().toUpperCase();
  const match = (symbol: string, name: string) => !typed || symbol.includes(typed) || name.toUpperCase().includes(typed);
  const dividends = inPeriod(cal.dividends, (d) => d.ex, (d) => d.symbol, lo, hi, only).filter((d) => match(d.symbol, d.name));
  const splits = inPeriod(cal.splits, (x) => x.effective, (x) => x.symbol, lo, hi, only).filter((x) => match(x.symbol, x.name));
  const deals = inPeriod(ipo.deals.filter((d) => d.status === 'priced' || d.status === 'upcoming'), (d) => d.date, (d) => d.symbol, lo, hi, only).filter((d) => match(d.symbol, d.name));
  const open = (symbol: string, fn: string) => execute(panel, `${symbol.replace('.', '/')} US EQUITY ${fn}`);
  const day = (t: number) => (Number.isFinite(t) ? fmtDay(t) : '');
  const divColumns: Column<DividendEvent>[] = [
    { key: 'ex', label: 'Ex-date', render: (d) => day(d.ex), sort: (d) => d.ex },
    { key: 'sym', label: 'Ticker', render: (d) => <span className="amber">{d.symbol}</span>, sort: (d) => d.symbol },
    { key: 'name', label: 'Company', render: (d) => d.name, sort: (d) => d.name },
    { key: 'amt', label: 'Dividend', num: true, render: (d) => fmtNum(d.amount, d.amount < 0.1 ? 4 : 2), sort: (d) => d.amount, cls: () => 'white' },
    { key: 'ann', label: 'Annual', num: true, render: (d) => (Number.isFinite(d.annual) ? fmtNum(d.annual, 2) : ''), sort: (d) => d.annual, hideM: true, title: "Nasdaq's historical annual dividend" },
    { key: 'rec', label: 'Record', render: (d) => day(d.record), sort: (d) => d.record, hideN: true },
    { key: 'pay', label: 'Payable', render: (d) => day(d.pay), sort: (d) => d.pay },
    { key: 'ann2', label: 'Announced', render: (d) => day(d.announced), sort: (d) => d.announced, hideM: true },
  ];
  const splitColumns: Column<SplitEvent>[] = [
    { key: 'eff', label: 'Effective', render: (x) => day(x.effective), sort: (x) => x.effective },
    { key: 'sym', label: 'Ticker', render: (x) => <span className="amber">{x.symbol}</span>, sort: (x) => x.symbol },
    { key: 'name', label: 'Company', render: (x) => x.name, sort: (x) => x.name },
    { key: 'ratio', label: 'Ratio', render: (x) => ratioText(x), sort: (x) => x.newShares / x.oldShares, cls: () => 'white' },
    { key: 'type', label: 'Type', render: (x) => (x.newShares > x.oldShares ? 'Stock split' : 'Reverse split'), sort: (x) => (x.newShares > x.oldShares ? 0 : 1), cls: (x) => (x.newShares > x.oldShares ? 'up' : 'dn') },
  ];
  const ipoColumns: Column<IpoDeal>[] = [
    { key: 'date', label: 'Date', render: (d) => day(d.date), sort: (d) => d.date },
    { key: 'sym', label: 'Ticker', render: (d) => <span className="amber">{d.symbol}</span>, sort: (d) => d.symbol },
    { key: 'name', label: 'Company', render: (d) => d.name, sort: (d) => d.name },
    { key: 'st', label: 'Status', render: (d) => (d.status === 'priced' ? 'Priced' : 'Expected'), sort: (d) => d.status },
    { key: 'px', label: 'Price', num: true, render: (d) => (d.priceLow != null && d.priceHigh != null && d.status === 'upcoming' ? `${fmtNum(d.priceLow, 2)}-${fmtNum(d.priceHigh, 2)}` : d.price != null ? fmtNum(d.price, 2) : ''), sort: (d) => d.price ?? NaN },
    { key: 'amt', label: 'Amount', num: true, render: (d) => (d.amount != null ? fmtBig(d.amount, 2) : ''), sort: (d) => d.amount ?? NaN, hideM: true },
    { key: 'ex', label: 'Exchange', render: (d) => d.exchange, sort: (d) => d.exchange, hideN: true },
  ];
  const csv = (): (string | number)[][] =>
    tab === 1
      ? [['Ex-date', 'Ticker', 'Company', 'Dividend', 'Annual', 'Record', 'Payable', 'Announced'], ...dividends.map((d) => [isoOf(d.ex), d.symbol, d.name, d.amount, d.annual, Number.isFinite(d.record) ? isoOf(d.record) : '', Number.isFinite(d.pay) ? isoOf(d.pay) : '', Number.isFinite(d.announced) ? isoOf(d.announced) : ''])]
      : tab === 2
        ? [['Effective', 'Ticker', 'Company', 'New shares', 'Old shares'], ...splits.map((x) => [isoOf(x.effective), x.symbol, x.name, x.newShares, x.oldShares])]
        : [['Date', 'Ticker', 'Company', 'Status', 'Price', 'Amount', 'Exchange'], ...deals.map((d) => [isoOf(d.date), d.symbol, d.name, d.status, d.price ?? '', d.amount ?? '', d.exchange])];
  const status = cal.loading ? `Reading Nasdaq's dividend calendar: ${cal.days - cal.loading} of ${cal.days} days` : cal.problems[0] ?? '';
  const nobody = only && only.size === 0 ? `Your ${scope} has no US-listed stocks.` : '';
  return (
    <div>
      <FnHeader
        code="ACTIONCALENDAR"
        title="Corporate Action Calendar"
        sub={<><RealBadge /> Nasdaq dividend, split and IPO calendars · {scope === 'all' ? 'every US-listed company' : scope === 'watchlist' ? `watchlist ${wl?.name ?? ''}` : 'your portfolio'}</>}
        tabs={[
          { n: 1, label: `Dividends (${dividends.length})` },
          { n: 2, label: `Splits (${splits.length})` },
          { n: 3, label: 'IPOs' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `CACT_${['dividends', 'splits', 'ipos'][tab - 1]}_${from}_${to}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Period
              <select className="sel-inp" aria-label="Period" value={span} onChange={(e) => setSpan(Number(e.target.value))}>
                {SPANS.map((x) => (
                  <option key={x.n} value={x.n}>{x.label}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              Companies
              <select className="sel-inp" aria-label="Companies" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                <option value="all">All US-listed</option>
                <option value="watchlist">Watchlist</option>
                <option value="portfolio">Portfolio</option>
              </select>
            </label>
            <input className="inp" aria-label="Filter the calendar" placeholder="Ticker or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <span className="muted">{fmtDay(lo)} to {fmtDay(hi)}</span>
            {status && <span className="muted" role="status">{status}</span>}
          </div>
        }
      />
      {!corpCalendarAvailable() ? (
        <div className="empty">The corporate action calendars are read from Nasdaq in the desktop app. The browser demo has none, and none are generated.</div>
      ) : nobody ? (
        <div className="empty">{nobody}</div>
      ) : (
        <>
          {tab === 1 && <DataTable columns={divColumns} rows={dividends} rowKey={(d) => `${d.symbol}:${d.ex}:${d.amount}`} onRowClick={(d) => open(d.symbol, 'DVD')} numbered={10} empty={cal.loading ? 'Loading…' : 'No dividend goes ex in this period on Nasdaq’s calendar.'} />}
          {tab === 2 && <DataTable columns={splitColumns} rows={splits} rowKey={(x) => `${x.symbol}:${x.effective}`} onRowClick={(x) => open(x.symbol, 'PROFILE')} numbered={10} empty={cal.splitsState === 'loading' ? 'Loading…' : 'No split in this period on Nasdaq’s calendar, which lists the recent and coming ones.'} />}
          {tab === 3 && <DataTable columns={ipoColumns} rows={deals} rowKey={(d) => `${d.status}:${d.id}`} onRowClick={(d) => open(d.symbol, 'PROFILE')} numbered={10} empty={ipo.loading ? 'Loading…' : ipo.failed[0] ?? 'No IPO priced or expected in this period.'} />}
          <div className="note">
            Dividends by ex-date as Nasdaq lists them (those it has an announcement for, in dollars per share); splits from Nasdaq&apos;s calendar of recent and
            coming splits; IPOs priced or expected. A company&apos;s own actions with its SEC filings are on CORPACTIONS, and its buybacks on BUYBACKS.
          </div>
        </>
      )}
    </div>
  );
}
