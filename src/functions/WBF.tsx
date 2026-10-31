// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { Fragment, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { LivePx, SecLink, openSecurity } from '../components/cells';
import { Sparkline } from '../components/Sparkline';
import { fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { useGroupedRows, usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/** A Treasury future's price in 32nds and quarters of a 32nd: 105.28125 → "105-09", 101.87891 → "101-28¼". */
export function futures32(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  const units = Math.round(price * 128);
  const whole = Math.floor(units / 128);
  const rest = units % 128;
  const q = rest % 4;
  return `${whole}-${String(Math.floor(rest / 4)).padStart(2, '0')}${q === 1 ? '¼' : q === 2 ? '+' : q === 3 ? '¾' : ''}`;
}

/** A change in 32nds with its sign: -0.03125 → "-0-01", +0.5 → "+0-16". */
export function change32(chg: number): string {
  if (!Number.isFinite(chg)) return '';
  if (Math.abs(chg) < 1 / 256) return '0-00';
  return `${chg > 0 ? '+' : '-'}${futures32(Math.abs(chg) + 1e-9)}`;
}

interface Row {
  id: string;
  /** What the contract delivers or settles on. */
  label: string;
  /** The cash yield beside it: the benchmark Treasury of about the same maturity. */
  cash?: string;
  /** Money-market futures quote 100 less the rate. */
  rate?: boolean;
}

const GROUPS: { name: string; rows: Row[] }[] = [
  {
    name: 'US Treasury Futures (CBOT)',
    rows: [
      { id: 'TU1 Comdty', label: '2-Year T-Note', cash: 'USGG2YR Index' },
      { id: 'FV1 Comdty', label: '5-Year T-Note', cash: 'USGG5YR Index' },
      { id: 'TY1 Comdty', label: '10-Year T-Note', cash: 'USGG10YR Index' },
      { id: 'UXY1 Comdty', label: 'Ultra 10-Year T-Note', cash: 'USGG10YR Index' },
      { id: 'US1 Comdty', label: 'T-Bond', cash: 'USGG30YR Index' },
      { id: 'WN1 Comdty', label: 'Ultra T-Bond', cash: 'USGG30YR Index' },
    ],
  },
  {
    name: 'US Money Market Futures',
    rows: [
      { id: 'SFR1 Comdty', label: '3-Month SOFR', rate: true },
      { id: 'FF1 Comdty', label: '30-Day Fed Funds', rate: true },
    ],
  },
];

/**
 * WBF, world bond futures: the US Treasury futures in 32nds with their change, range and volume, beside the cash
 * benchmark yield of about the same maturity; and the money-market futures with the rate they imply (100 less the
 * price). Price or yield view.
 */
export function WBF(_: FnProps) {
  useTick(1);
  const panel = usePanelId();
  const [view, setView] = useState<'price' | 'yield'>('price');
  const [collapsed, toggle] = useCollapsed();
  const groups = GROUPS.map((g) => ({ ...g, rows: g.rows.filter((r) => !!engine.get(r.id) && engine.hasSource(r.id)) })).filter((g) => g.rows.length);
  const nums = useGroupedRows('wbf-rows', groups.map((g) => g.rows.map((r) => r.id)), groups.map((g) => !collapsed.includes(g.name)), (id) => openSecurity(panel, id, undefined, 'INTRADAY'), (id) => engine.get(id)?.name ?? id);
  return (
    <div>
      <FnHeader
        code="BONDFUTURES"
        title="World Bond Futures"
        tabs={[
          { n: 1, label: 'Price' },
          { n: 2, label: 'Yield' },
        ]}
        tab={view === 'price' ? 1 : 2}
        onTab={(n) => setView(n === 1 ? 'price' : 'yield')}
        sub="Front contracts · Treasury prices in 32nds"
      />
      {!groups.length ? (
        <div className="empty">Bond futures are priced from Yahoo Finance: turn on Yahoo prices in PROVIDERS.</div>
      ) : (
        <table className="tbl wbf-tbl">
          <thead>
            <tr>
              <th>Future</th>
              <th className="hide-m">Underlying</th>
              {view === 'price' ? (
                <>
                  <th className="num">Last</th>
                  <th className="num">Net Chg</th>
                  <th className="num">%Chg</th>
                  <th className="num hide-m">High</th>
                  <th className="num hide-m">Low</th>
                  <th className="num hide-m">Prev</th>
                </>
              ) : (
                <th className="num">Price</th>
              )}
              <th className="num">{view === 'price' ? 'Cash Yld' : 'Yield / Rate'}</th>
              <th className="num">Chg bp</th>
              <th className="hide-m">Intraday</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={g.name}>
                <GroupRow n={gi + 1} name={g.name} span={view === 'price' ? 11 : 6} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} />
                {(collapsed.includes(g.name) ? [] : g.rows).map((r, i) => {
                  const d = engine.get(r.id)!;
                  const q = engine.quote(r.id)!;
                  const prev = q.last - q.chg;
                  // Money-market futures: the implied rate is 100 less the price, and moves opposite to it.
                  const cash = r.cash ? engine.quote(r.cash) : undefined;
                  const yld = r.rate ? 100 - q.last : cash?.last ?? NaN;
                  const ychg = r.rate ? -q.chg * 100 : cash ? cash.chg * 100 : NaN;
                  const treasury = !r.rate;
                  const px = (v: number) => (treasury ? futures32(v) : fmtNum(v, 3));
                  const intra = engine.intraday(r.id);
                  return (
                    <tr key={r.id} className="click" onClick={(e) => openSecurity(panel, r.id, e, 'INTRADAY')}>
                      <td>
                        <RowNo n={nums[gi][i]} />
                        <SecLink id={r.id} fn="MENU">
                          {d.ticker}
                        </SecLink>
                      </td>
                      <td className="hide-m">{r.label}</td>
                      {view === 'price' ? (
                        <>
                          <td className="num white" title={fmtNum(q.last, 6)}>
                            {treasury ? futures32(q.last) : <LivePx id={r.id} />}
                          </td>
                          <td className={`num ${q.chg > 0 ? 'up' : q.chg < 0 ? 'dn' : ''}`}>{treasury ? change32(q.chg) : fmtNum(q.chg, 3)}</td>
                          <td className={`num ${q.pct > 0 ? 'up' : q.pct < 0 ? 'dn' : ''}`}>{fmtPct(q.pct, 2)}</td>
                          <td className="num hide-m">{Number.isFinite(q.high) && q.high > 0 ? px(q.high) : ''}</td>
                          <td className="num hide-m">{Number.isFinite(q.low) && q.low > 0 ? px(q.low) : ''}</td>
                          <td className="num hide-m">{px(prev)}</td>
                        </>
                      ) : (
                        <td className="num white">{px(q.last)}</td>
                      )}
                      <td className="num white" title={r.rate ? 'Implied rate: 100 less the price' : `Cash yield of the benchmark Treasury (${engine.get(r.cash!)?.name ?? r.cash})`}>
                        {Number.isFinite(yld) ? `${fmtNum(yld, 3)}%` : ''}
                      </td>
                      <td className={`num ${ychg > 0 ? 'up' : ychg < 0 ? 'dn' : ''}`}>{Number.isFinite(ychg) ? `${ychg > 0 ? '+' : ''}${fmtNum(ychg, 1)}` : ''}</td>
                      <td className="hide-m">
                        <Sparkline values={intra.c.subarray(0, intra.length)} width={90} height={14} />
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      <p className="pad-s muted">
        Front contracts from Yahoo Finance (delayed as the exchange requires). Treasury futures are in points and 32nds of a point (+ is a half, ¼ and ¾ quarters of a
        32nd); the yield beside each is the cash benchmark Treasury of about the same maturity, not the cheapest-to-deliver bond&apos;s. SOFR and Fed funds futures
        imply the rate as 100 less the price. Eurex, ICE and Osaka bond futures have no free price source; their cash benchmarks are in WB.
      </p>
    </div>
  );
}
