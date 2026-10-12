import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Flash } from '../components/Flash';
import { Sparkline } from '../components/Sparkline';
import { Chg, HBar, LivePx, SecLink, openSecurity } from '../components/cells';
import { fmtBig, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange, type Horizon } from '../data/analytics';
import { CURRENCY_INFO } from '../data/universe';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

const MATRIX = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'CNH', 'HKD', 'SGD'];

function rateDec(v: number): number {
  if (v >= 100) return 2;
  if (v >= 10) return 3;
  return 4;
}

export function FXC(_: FnProps) {
  useTick(1);
  return (
    <div>
      <FnHeader code="FXC" title="Currency Cross Rates" sub="Units of the column currency per one unit of the row currency" />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th />
              {MATRIX.map((c) => (
                <th key={c} className="num">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row}>
                <td className="amber b">{row}</td>
                {MATRIX.map((col) => {
                  if (row === col) return <td key={col} className="num faint">--</td>;
                  const v = engine.usdValue(row) / engine.usdValue(col);
                  return (
                    <td key={col} className="num white">
                      <Flash value={Number(v.toFixed(rateDec(v)))}>{fmtNum(v, rateDec(v))}</Flash>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">Every cross is derived from the same currency set, so triangular arbitrage is zero by construction.</div>
    </div>
  );
}

const RANK_H: { n: number; h: Horizon }[] = [
  { n: 1, h: '1D' },
  { n: 2, h: '5D' },
  { n: 3, h: '1M' },
  { n: 4, h: '3M' },
  { n: 5, h: 'YTD' },
  { n: 6, h: '1Y' },
];

/** Percent change of a currency's value against USD over a horizon. */
function ccyVsUsd(code: string, h: Horizon): { id: string | undefined; pct: number } {
  const direct = engine.get(`${code}USD Curncy`);
  const inverse = engine.get(`USD${code} Curncy`);
  if (direct) return { id: direct.id, pct: periodChange(direct.id, h) };
  if (inverse) {
    const p = periodChange(inverse.id, h);
    return { id: inverse.id, pct: (1 / (1 + p / 100) - 1) * 100 };
  }
  return { id: undefined, pct: NaN };
}

export function WCRS(_: FnProps) {
  useTick(3);
  const [tab, setTab] = useState(1);
  const h = RANK_H[tab - 1].h;
  const codes = ['EUR', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'CNH', 'HKD', 'SGD', 'INR', 'KRW', 'MXN', 'BRL', 'ZAR', 'TRY'];
  const rows = codes.map((c) => ({ c, ...ccyVsUsd(c, h) })).sort((a, b) => b.pct - a.pct);
  const max = Math.max(...rows.map((r) => Math.abs(r.pct)).filter(Number.isFinite), 0.01);
  return (
    <div>
      <FnHeader code="WCRS" title="World Currency Ranker" sub="Performance against the US dollar" tabs={RANK_H.map((x) => ({ n: x.n, label: x.h }))} tab={tab} onTab={setTab} />
      <table className="tbl">
        <thead>
          <tr>
            <th className="num">Rank</th>
            <th>Currency</th>
            <th className="hide-m">Name</th>
            <th>Pair</th>
            <th className="num">Spot</th>
            <th className="num">% vs USD</th>
            <th style={{ width: '32%' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.c}>
              <td className="num amber">{i + 1})</td>
              <td className="b">{r.c}</td>
              <td className="hide-m muted">{CURRENCY_INFO.get(r.c)?.name}</td>
              <td>{r.id ? <SecLink id={r.id} fn="GP">{engine.get(r.id)!.ticker}</SecLink> : '--'}</td>
              <td className="num">{r.id ? <LivePx id={r.id} /> : '--'}</td>
              <td className="num">
                <Chg v={r.pct} pct />
              </td>
              <td>
                <HBar value={r.pct} max={max} signed />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CRYP(_: FnProps) {
  const panel = usePanelId();
  useTick(1);
  const list = engine.securities.filter((d) => d.cls === 'crypto');
  const caps = list.map((d) => engine.quote(d.id)!.last * d.cry!.supply);
  const total = caps.reduce((a, b) => a + b, 0);
  return (
    <div>
      <FnHeader code="CRYP" title="Cryptocurrency Monitor" sub={`Total value ${fmtBig(total)} USD · BTC share ${fmtNum((caps[0] / total) * 100, 1)}% of listed assets`} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Asset</th>
            <th className="num">Last</th>
            <th className="num">Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">High</th>
            <th className="num hide-m">Low</th>
            <th className="num hide-m">Volume</th>
            <th className="num">Mkt value</th>
            <th className="num hide-m">7D %</th>
            <th className="num">30D %</th>
            <th className="num hide-m">YTD %</th>
            <th className="hide-m">24h</th>
            <th>Src</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d, i) => {
            const q = engine.quote(d.id)!;
            const intra = engine.intraday(d.id);
            return (
              <tr key={d.id} className="click" onClick={(e) => openSecurity(panel, d.id, e, 'GP')}>
                <td>
                  <SecLink id={d.id} fn="GP">
                    {d.ticker}
                  </SecLink>{' '}
                  <span className="muted hide-m">{d.name.split(' / ')[0]}</span>
                </td>
                <td className="num white">
                  <LivePx id={d.id} />
                </td>
                <td className="num">
                  <Chg v={q.chg} dec={d.dec} />
                </td>
                <td className="num">
                  <Chg v={q.pct} pct />
                </td>
                <td className="num hide-m">{fmtNum(q.high, d.dec)}</td>
                <td className="num hide-m">{fmtNum(q.low, d.dec)}</td>
                <td className="num hide-m">{fmtBig(q.volume * q.last)}</td>
                <td className="num">{fmtBig(caps[i])}</td>
                <td className="num hide-m">
                  <Chg v={periodChange(d.id, '5D')} pct dec={1} />
                </td>
                <td className="num">
                  <Chg v={periodChange(d.id, '1M')} pct dec={1} />
                </td>
                <td className="num hide-m">
                  <Chg v={periodChange(d.id, 'YTD')} pct dec={1} />
                </td>
                <td className="hide-m">
                  <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                </td>
                <td>
                  <span className={`badge ${q.src === 'SIM' ? 'sim' : 'live'}`}>{q.src === 'SIM' ? 'SIMULATED' : q.src}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">With network access the monitor streams real prices from Coinbase; otherwise it runs on the simulator.</div>
    </div>
  );
}

const GROUPS = ['Energy', 'Precious Metals', 'Base Metals', 'Grains', 'Softs', 'Livestock'];

export function GLCO(_: FnProps) {
  const panel = usePanelId();
  useTick(1);
  return (
    <div>
      <FnHeader code="GLCO" title="Global Commodities" sub="Generic front-month futures" />
      <table className="tbl">
        <thead>
          <tr>
            <th>Contract</th>
            <th className="hide-m">Name</th>
            <th className="num">Last</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">High</th>
            <th className="num hide-m">Low</th>
            <th className="num">YTD %</th>
            <th className="num hide-m">1Y %</th>
            <th className="hide-m">Unit</th>
            <th className="hide-m">Intraday</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g, gi) => [
            <tr key={g} className="group">
              <td colSpan={11}>
                {gi + 1}) {g}
              </td>
            </tr>,
            ...engine.securities
              .filter((d) => d.cls === 'commodity' && d.cmd!.group === g)
              .map((d) => {
                const q = engine.quote(d.id)!;
                const intra = engine.intraday(d.id);
                return (
                  <tr key={d.id} className="click" onClick={(e) => openSecurity(panel, d.id, e, 'GP')}>
                    <td>
                      <SecLink id={d.id} fn="GP">
                        {d.ticker}
                      </SecLink>
                    </td>
                    <td className="hide-m">{d.alias?.[0] ? d.alias[0].charAt(0) + d.alias[0].slice(1).toLowerCase() : d.name}</td>
                    <td className="num white">
                      <LivePx id={d.id} />
                    </td>
                    <td className="num">
                      <Chg v={q.chg} dec={d.dec} />
                    </td>
                    <td className="num">
                      <Chg v={q.pct} pct />
                    </td>
                    <td className="num hide-m">{fmtNum(q.high, d.dec)}</td>
                    <td className="num hide-m">{fmtNum(q.low, d.dec)}</td>
                    <td className="num">
                      <Chg v={periodChange(d.id, 'YTD')} pct dec={1} />
                    </td>
                    <td className="num hide-m">
                      <Chg v={periodChange(d.id, '1Y')} pct dec={1} />
                    </td>
                    <td className="muted hide-m">{d.cmd!.unit}</td>
                    <td className="hide-m">
                      <Sparkline values={intra.c.subarray(0, intra.length)} width={80} height={14} />
                    </td>
                  </tr>
                );
              }),
          ])}
        </tbody>
      </table>
    </div>
  );
}
