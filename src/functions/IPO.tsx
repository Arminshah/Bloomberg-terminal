import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum, fmtPct } from '../core/format';
import { ipoAvailable, monthsBetween, useIpoCalendar, type IpoDeal, type IpoStatus, type IpoTrading } from '../data/live/ipo';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const TABS: { n: number; label: string; status?: IpoStatus }[] = [
  { n: 1, label: 'Priced', status: 'priced' },
  { n: 2, label: 'Expected', status: 'upcoming' },
  { n: 3, label: 'Filed', status: 'filed' },
  { n: 4, label: 'Withdrawn', status: 'withdrawn' },
  { n: 5, label: 'Performance' },
];

const PERIODS = [
  { key: 'm', label: 'This Month', months: 1 },
  { key: '3m', label: 'Last 3 Months', months: 3 },
  { key: '6m', label: 'Last 6 Months', months: 6 },
  { key: 'ytd', label: 'Year to Date', months: 0 },
  { key: '12m', label: 'Last 12 Months', months: 12 },
] as const;
type PeriodKey = (typeof PERIODS)[number]['key'];

const MIN_AMOUNTS = [0, 50e6, 100e6, 500e6];

/** The months of a period ending this month, and the same months a year earlier. */
export function periodMonths(key: PeriodKey, now: number): { months: string[]; prior: string[]; from: number } {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const back = key === 'ytd' ? m : (PERIODS.find((p) => p.key === key)!.months - 1);
  const start = new Date(Date.UTC(y, m - back, 1));
  const iso = (t: Date) => t.toISOString().slice(0, 7);
  const months = monthsBetween(iso(start), iso(new Date(Date.UTC(y, m, 1))));
  const prior = months.map((x) => `${Number(x.slice(0, 4)) - 1}${x.slice(4)}`);
  return { months, prior, from: start.getTime() };
}

const sign = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

/** Return since the offer: the latest close against the offer price; first day: the first close against it. */
export function sinceOffer(d: IpoDeal, t: IpoTrading | undefined): { day1: number; since: number } {
  const p = d.price ?? NaN;
  return { day1: t?.first && p > 0 ? (t.first / p - 1) * 100 : NaN, since: t?.last && p > 0 ? (t.last / p - 1) * 100 : NaN };
}

/**
 * IPO, capital raisings: US initial public offerings priced, expected, filed and withdrawn in a period, with the
 * money raised against the same months a year earlier and each new listing's first-day and since-offer returns.
 */
export function IPO(_props: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [period, setPeriod] = useState<PeriodKey>('3m');
  const [spacs, setSpacs] = useState(false);
  const [minAmount, setMinAmount] = useState(0);
  const [exchange, setExchange] = useState('All');
  const now = Date.now();
  const { months, prior } = periodMonths(period, now);
  const cal = useIpoCalendar(months, true);
  const last = useIpoCalendar(prior, false);
  const keep = (d: IpoDeal) => (spacs || !d.spac) && (d.amount ?? 0) >= minAmount && (exchange === 'All' || d.exchange.toUpperCase().includes(exchange));
  const deals = cal.deals.filter(keep);
  const priced = deals.filter((d) => d.status === 'priced');
  const raised = priced.reduce((a, d) => a + (d.amount ?? 0), 0);
  const pricedPrior = last.deals.filter((d) => d.status === 'priced' && keep(d));
  const raisedPrior = pricedPrior.reduce((a, d) => a + (d.amount ?? 0), 0);
  const exchanges = ['All', ...[...new Set(cal.deals.map((d) => d.exchange.toUpperCase().split(/\s+/)[0]).filter(Boolean))].sort()];
  const status = TABS.find((t) => t.n === tab)?.status;
  const rows = status ? deals.filter((d) => d.status === status).sort((a, b) => b.date - a.date) : [];
  const perf = priced.map((d) => ({ d, ...sinceOffer(d, cal.trading[d.symbol]) })).filter((x) => Number.isFinite(x.since));
  const best = [...perf].sort((a, b) => b.since - a.since).slice(0, 10);
  const worst = [...perf].sort((a, b) => a.since - b.since).slice(0, 10);
  const avgDay1 = perf.filter((x) => Number.isFinite(x.day1)).reduce((a, x, _, arr) => a + x.day1 / arr.length, 0);
  const avgSince = perf.length ? perf.reduce((a, x) => a + x.since, 0) / perf.length : NaN;
  const open = (d: IpoDeal) => d.symbol && execute(panel, `${d.symbol.replace('.', '/')} US EQUITY PROFILE`);
  const csv = () => [
    ['Status', 'Date', 'Symbol', 'Company', 'Exchange', 'Price', 'Price Low', 'Price High', 'Shares', 'Amount', 'First Day %', 'Since Offer %', 'SPAC'],
    ...deals.map((d) => {
      const r = sinceOffer(d, cal.trading[d.symbol]);
      return [d.status, new Date(d.date).toISOString().slice(0, 10), d.symbol, d.name, d.exchange, d.price ?? '', d.priceLow ?? '', d.priceHigh ?? '', d.shares ?? '', d.amount ?? '', Number.isFinite(r.day1) ? r.day1 : '', Number.isFinite(r.since) ? r.since : '', d.spac ? 'yes' : ''];
    }),
  ];
  const chg = raisedPrior > 0 ? (raised / raisedPrior - 1) * 100 : NaN;
  const bar = (v: number, max: number) => (
    <span className="ipo-bar">
      <span className={v >= 0 ? 'up-bg' : 'dn-bg'} style={{ width: `${Math.min(100, (Math.abs(v) / max) * 100)}%` }} />
    </span>
  );
  const maxAbs = Math.max(1, ...[...best, ...worst].map((x) => Math.abs(x.since)));
  return (
    <div>
      <FnHeader
        code="IPOS"
        title="Capital Raisings: IPOs"
        tabs={TABS.map((t) => ({ n: t.n, label: t.label }))}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `IPO_${months[0]}_${months[months.length - 1]}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <label className="fld">
              Period
              <select className="sel-inp" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
                {PERIODS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fld">
              Exchange
              <select className="sel-inp" aria-label="Exchange" value={exchange} onChange={(e) => setExchange(e.target.value)}>
                {exchanges.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="fld">
              Min Size
              <select className="sel-inp" aria-label="Minimum offer amount" value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))}>
                {MIN_AMOUNTS.map((v) => (
                  <option key={v} value={v}>
                    {v ? `$${fmtBig(v, 0)}` : 'Any'}
                  </option>
                ))}
              </select>
            </label>
            <label className="chk">
              <input type="checkbox" checked={spacs} onChange={(e) => setSpacs(e.target.checked)} /> Include SPACs
            </label>
          </div>
        }
      />
      {!ipoAvailable() ? (
        <div className="empty">The IPO calendar comes from Nasdaq through the desktop app.</div>
      ) : (
        <>
          <div className="ipo-summary">
            <span>
              <span className="amber">Priced</span> <span className="white">{priced.length}</span>
            </span>
            <span>
              <span className="amber">Raised</span> <span className="white">${fmtBig(raised, 2)}</span>
            </span>
            <span>
              <span className="amber">Same months a year earlier</span> <span className="white">{last.loading ? '…' : `${pricedPrior.length} · $${fmtBig(raisedPrior, 2)}`}</span>
              {Number.isFinite(chg) ? <span className={sign(chg)}> ({fmtPct(chg, 1)})</span> : null}
            </span>
            <span>
              <span className="amber">Avg First Day</span> <span className={sign(avgDay1)}>{perf.length ? fmtPct(avgDay1, 1) : '--'}</span>
            </span>
            <span>
              <span className="amber">Avg Since Offer</span> <span className={sign(avgSince)}>{perf.length ? fmtPct(avgSince, 1) : '--'}</span>
            </span>
            <span className="muted">
              {fmtDay(Date.parse(`${months[0]}-01T00:00:00Z`))} – today{cal.loading ? ' · loading…' : ''}
            </span>
          </div>
          {cal.failed.length > 0 && <div className="empty">{cal.failed.join(' ')}</div>}
          {tab === 5 ? (
            <div className="mov-cols">
              {[
                ['Best Since Offer', best],
                ['Worst Since Offer', worst],
              ].map(([title, list]) => (
                <div className="mov-side" key={title as string}>
                  <div className="mov-title">{title as string}</div>
                  <table className="tbl mov-tbl">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th className="num">Offer</th>
                        <th className="num">Last</th>
                        <th className="num">Since Offer</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(list as typeof perf).map((x) => (
                        <tr key={x.d.id} className="click" onClick={() => open(x.d)}>
                          <td>
                            <span className="amber">{x.d.symbol}</span> <span className="muted">{x.d.name}</span>
                          </td>
                          <td className="num">{fmtNum(x.d.price!, 2)}</td>
                          <td className="num white">{fmtNum(cal.trading[x.d.symbol]?.last ?? NaN, 2)}</td>
                          <td className={`num ${sign(x.since)}`}>{fmtPct(x.since, 1)}</td>
                          <td className="ipo-bar-cell">{bar(x.since, maxAbs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : rows.length ? (
            <table className="tbl zebra">
              <thead>
                <tr>
                  <th>{status === 'priced' ? 'Priced' : status === 'upcoming' ? 'Expected' : status === 'filed' ? 'Filed' : 'Withdrawn'}</th>
                  <th>Symbol</th>
                  <th>Company</th>
                  <th className="hide-m">Exchange</th>
                  <th className="num">{status === 'upcoming' ? 'Range' : 'Price'}</th>
                  <th className="num hide-m">Shares</th>
                  <th className="num">Amount</th>
                  {status === 'priced' && <th className="num">First Day</th>}
                  {status === 'priced' && <th className="num">Last</th>}
                  {status === 'priced' && <th className="num">Since Offer</th>}
                  {status === 'withdrawn' && <th className="hide-m">Filed</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const r = sinceOffer(d, cal.trading[d.symbol]);
                  return (
                    <tr key={d.id} className={d.symbol && status === 'priced' ? 'click' : undefined} onClick={() => status === 'priced' && open(d)}>
                      <td>{fmtDay(d.date)}</td>
                      <td className="amber">{d.symbol}</td>
                      <td className="white">
                        {d.name}
                        {d.spac ? <span className="muted"> · SPAC</span> : null}
                      </td>
                      <td className="hide-m">{d.exchange}</td>
                      <td className="num">{d.priceLow != null && d.priceHigh != null && d.priceLow !== d.priceHigh ? `${fmtNum(d.priceLow, 2)}–${fmtNum(d.priceHigh, 2)}` : d.price != null ? fmtNum(d.price, 2) : ''}</td>
                      <td className="num hide-m">{d.shares != null ? fmtBig(d.shares, 2) : ''}</td>
                      <td className="num">{d.amount != null ? `$${fmtBig(d.amount, 1)}` : ''}</td>
                      {status === 'priced' && <td className={`num ${sign(r.day1)}`}>{Number.isFinite(r.day1) ? fmtPct(r.day1, 1) : ''}</td>}
                      {status === 'priced' && <td className="num white">{cal.trading[d.symbol]?.last ? fmtNum(cal.trading[d.symbol].last!, 2) : ''}</td>}
                      {status === 'priced' && <td className={`num ${sign(r.since)}`}>{Number.isFinite(r.since) ? fmtPct(r.since, 1) : ''}</td>}
                      {status === 'withdrawn' && <td className="hide-m">{d.filed ? fmtDay(d.filed) : ''}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">{cal.loading ? 'Loading Nasdaq’s IPO calendar…' : 'No deals in this period with these filters.'}</div>
          )}
          <p className="pad-s muted">
            US initial public offerings from Nasdaq&apos;s IPO calendar (all US exchanges), by the month they were priced, expected, filed or withdrawn. First day: the
            first close after pricing against the offer price; since offer: the latest close. Closes from Yahoo. SPACs (blank-cheque companies selling $10 units)
            are left out unless included. Follow-on offerings and M&amp;A are not covered.
          </p>
        </>
      )}
    </div>
  );
}
