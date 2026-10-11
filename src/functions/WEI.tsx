import { Fragment } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { Chg, LivePx, SecLink } from '../components/cells';
import { Flash } from '../components/Flash';
import { fmtNum, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { usePanelId } from '../terminal/panel';
import { openSecurity } from '../components/cells';
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
  const pair = engine.get(`${d.ccy}USD Curncy`) ? `${d.ccy}USD Curncy` : engine.get(`USD${d.ccy === 'CNY' ? 'CNH' : d.ccy} Curncy`) ? `USD${d.ccy === 'CNY' ? 'CNH' : d.ccy} Curncy` : undefined;
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
                      <Chg v={q.chg} dec={2} />
                    </td>
                    <td className="num">
                      <Flash value={q.pct} className={q.pct > 0 ? 'up' : q.pct < 0 ? 'dn' : ''}>
                        {q.pct > 0 ? '+' : ''}
                        {fmtNum(q.pct, 2)}%
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
    </div>
  );
}
