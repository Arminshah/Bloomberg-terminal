import { Fragment } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { Chg, DayChg, LivePx, SecLink } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { Flash } from '../components/Flash';
import { fmtNum, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { usePanelId } from '../terminal/panel';
import { openSecurity } from '../components/cells';
import { realFutureContract } from '../data/realfut';
import type { FnProps } from '../terminal/types';

const GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Americas', ids: ['INDU Index', 'SPX Index', 'CCMP Index', 'NDX Index', 'RTY Index', 'SPTSX Index', 'MEXBOL Index', 'IBOV Index'] },
  { name: 'EMEA', ids: ['SX5E Index', 'SXXP Index', 'UKX Index', 'DAX Index', 'CAC Index', 'SMI Index', 'IBEX Index', 'FTSEMIB Index', 'AEX Index'] },
  { name: 'Asia/Pacific', ids: ['NKY Index', 'HSI Index', 'SHCOMP Index', 'SHSZ300 Index', 'KOSPI Index', 'TWSE Index', 'AS51 Index', 'SENSEX Index', 'NIFTY Index', 'STI Index'] },
];

/** YTD change in USD terms: local return compounded with the currency's YTD move. */
function ytdUsd(id: string): number {
  const d = engine.get(id)!;
  const local = periodChange(id, 'YTD');
  if (d.ccy === 'USD') return local;
  // The index's own currency (onshore yuan for Shanghai, not the offshore CNH), from its history.
  const pair = [`${d.ccy}USD Curncy`, `USD${d.ccy} Curncy`].find((x) => engine.get(x) && engine.hasSource(x));
  if (!pair) return NaN;
  const fx = periodChange(pair, 'YTD') / 100;
  const ccyRet = pair.startsWith('USD') ? 1 / (1 + fx) - 1 : fx;
  return ((1 + local / 100) * (1 + ccyRet) - 1) * 100;
}

export function WEI(_: FnProps) {
  useTick(1);
  const panel = usePanelId();
  const now = engine.now();
  return (
    <div>
      <FnHeader code="WEI" title="World Equity Indices" sub="Standard view · values in local currency" />
      <table className="tbl">
        <thead>
          <tr>
            <th>Index</th>
            <th className="hide-m">Name</th>
            <th className="num">Value</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">Time</th>
            <th className="num">%Ytd</th>
            <th className="num hide-m">%YtdCur</th>
            <th className="hide-m">Intraday</th>
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g, gi) => (
            <Fragment key={g.name}>
              <tr className="group">
                <td colSpan={9}>
                  {gi + 1}) {g.name}
                </td>
              </tr>
              {g.ids.map((id) => {
                // The desktop app lists only indices it has a real source for.
                if (!engine.hasSource(id)) return null;
                const d = engine.get(id)!;
                const q = engine.quote(id)!;
                const intra = engine.intraday(id);
                return (
                  <tr key={id} className="click" onClick={(e) => openSecurity(panel, id, e, 'GP')}>
                    <td>
                      <SecLink id={id} fn="GP">
                        {d.ticker}
                      </SecLink>
                    </td>
                    <td className="hide-m">{d.name}</td>
                    <td className="num white">
                      <LivePx id={id} />
                    </td>
                    <td className="num">
                      <DayChg q={q} dec={2} />
                    </td>
                    <td className="num">
                      <Flash value={q.pct}>
                        <DayChg q={q} pct />
                      </Flash>
                    </td>
                    <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                    <td className="num">
                      <Chg v={periodChange(id, 'YTD')} pct />
                    </td>
                    <td className="num hide-m">
                      <Chg v={ytdUsd(id)} pct />
                    </td>
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
      <FreshnessLegend />
    </div>
  );
}

const FUT_GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Americas', ids: ['ES1 Index', 'NQ1 Index', 'DM1 Index', 'RTY1 Index'] },
  { name: 'EMEA', ids: ['VG1 Index', 'GX1 Index', 'Z 1 Index', 'CF1 Index'] },
  { name: 'Asia/Pacific', ids: ['NK1 Index', 'HI1 Index', 'XP1 Index'] },
];

/** WEIF: world equity index futures with fair value and basis. */
export function WEIF(_: FnProps) {
  useTick(1);
  const panel = usePanelId();
  return (
    <div>
      <FnHeader code="WEIF" title="World Equity Index Futures" sub={engine.realOnly ? 'Front contracts · fair value is a model from the financing rate and dividend yield' : 'Front contracts · fair value from financing rate and dividend yield'} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Future</th>
            <th className="hide-m">Contract</th>
            <th className="num">Last</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="num hide-m">High</th>
            <th className="num hide-m">Low</th>
            <th className="num hide-m">Volume</th>
            <th className="num">Index</th>
            <th className="num">Basis</th>
            <th className="num hide-m">Fair value</th>
            <th className="num">Prem/Disc</th>
            <th className="num hide-m">Days</th>
            <th className="hide-m">Intraday</th>
          </tr>
        </thead>
        <tbody>
          {FUT_GROUPS.filter((g) => g.ids.some((id) => engine.hasSource(id))).map((g, gi) => (
            <Fragment key={g.name}>
              <tr className="group">
                <td colSpan={14}>
                  {gi + 1}) {g.name}
                </td>
              </tr>
              {g.ids.map((id) => {
                const d = engine.get(id);
                if (!d || !engine.hasSource(id)) return null;
                const q = engine.quote(id)!;
                const u = engine.quote(d.fut!.underlying)!;
                const c = engine.realOnly ? realFutureContract(d) : engine.futureContract(id)!;
                const intra = engine.intraday(id);
                return (
                  <tr key={id} className="click" onClick={(e) => openSecurity(panel, id, e, 'GIP')}>
                    <td>
                      <SecLink id={id} fn="MENU">
                        {d.ticker}
                      </SecLink>
                    </td>
                    <td className="hide-m">{c.code}</td>
                    <td className="num white">
                      <LivePx id={id} />
                    </td>
                    <td className="num">
                      <DayChg q={q} dec={d.dec} />
                    </td>
                    <td className="num">
                      <DayChg q={q} pct />
                    </td>
                    <td className="num hide-m">{fmtNum(q.high, d.dec)}</td>
                    <td className="num hide-m">{fmtNum(q.low, d.dec)}</td>
                    <td className="num hide-m">{fmtNum(q.volume, 0)}</td>
                    <td className="num">
                      <SecLink id={d.fut!.underlying} fn="GP">
                        {fmtNum(u.last, 2)}
                      </SecLink>
                    </td>
                    <td className="num">{fmtNum(q.last - u.last, 2)}</td>
                    <td className="num hide-m">{fmtNum(c.fair, 2)}</td>
                    <td className="num">
                      <Chg v={q.last - c.fair} dec={2} />
                    </td>
                    <td className="num hide-m">{fmtNum(c.days, 0)}</td>
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
      <p className="pad-s muted">
        {engine.realOnly
          ? 'Prices, contracts and last trade dates from Yahoo Finance (unofficial; CME, delayed 10 minutes). Fair value is a model: index × e^((r − q) × days/365) with the 3-month Treasury rate and the dividends the index’s ETF paid over the past 12 months as a share of its price. Non-US index futures have no free source and are not listed.'
          : 'Fair value = index × e^((r − q) × days/365), using the 3-month bill (or local policy rate) and the index dividend yield. Futures prices are simulated around fair value.'}
      </p>
    </div>
  );
}
