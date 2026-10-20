import { Fragment, useState } from 'react';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { Chg, DayChg, LivePx, SecLink } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { Flash } from '../components/Flash';
import { fmtNum, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange } from '../data/analytics';
import { useGroupedRows, useMenu, usePanelId } from '../terminal/panel';
import { openSecurity } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { execute } from '../terminal/exec';
import { realFutureContract } from '../data/realfut';
import type { FnProps } from '../terminal/types';

/** MARKET's regions and their indices, in the order shown. */
export const INDEX_GROUPS: { name: string; ids: string[] }[] = [
  { name: 'Americas', ids: ['INDU Index', 'SPX Index', 'CCMP Index', 'NDX Index', 'RTY Index', 'SPTSX Index', 'MEXBOL Index', 'IBOV Index'] },
  { name: 'EMEA', ids: ['SX5E Index', 'SXXP Index', 'UKX Index', 'DAX Index', 'CAC Index', 'SMI Index', 'IBEX Index', 'FTSEMIB Index', 'AEX Index', 'BEL20 Index', 'OMX Index', 'ATX Index', 'PSI20 Index', 'ISEQ Index'] },
  { name: 'Asia/Pacific', ids: ['NKY Index', 'HSI Index', 'SHCOMP Index', 'SHSZ300 Index', 'KOSPI Index', 'TWSE Index', 'AS51 Index', 'SENSEX Index', 'NIFTY Index', 'STI Index'] },
];

/** Each index as the monitor names it, in capitals. */
const SHORT: Record<string, string> = {
  'INDU Index': 'DOW JONES', 'SPX Index': 'S&P 500', 'CCMP Index': 'NASDAQ', 'NDX Index': 'NASDAQ 100', 'RTY Index': 'RUSSELL 2000',
  'SPTSX Index': 'S&P/TSX COMP', 'MEXBOL Index': 'S&P/BMV IPC', 'IBOV Index': 'IBOVESPA',
  'SX5E Index': 'EURO STOXX 50', 'SXXP Index': 'STOXX 600', 'UKX Index': 'FTSE 100', 'DAX Index': 'DAX', 'CAC Index': 'CAC 40',
  'SMI Index': 'SMI', 'IBEX Index': 'IBEX 35', 'FTSEMIB Index': 'FTSE MIB', 'AEX Index': 'AEX', 'BEL20 Index': 'BEL 20',
  'OMX Index': 'OMX STKH30', 'ATX Index': 'ATX', 'PSI20 Index': 'PSI', 'ISEQ Index': 'ISEQ ALL SHARE',
  'NKY Index': 'NIKKEI', 'HSI Index': 'HANG SENG', 'SHCOMP Index': 'SHANGHAI', 'SHSZ300 Index': 'CSI 300', 'KOSPI Index': 'KOSPI',
  'TWSE Index': 'TAIEX', 'AS51 Index': 'S&P/ASX 200', 'SENSEX Index': 'SENSEX', 'NIFTY Index': 'NIFTY 50', 'STI Index': 'STRAITS TIMES',
};
export const indexShortName = (id: string) => SHORT[id] ?? (engine.get(id)?.name ?? id).toUpperCase();

/** The front index future beside each index, where the app has one. */
const FUTURE_OF: Record<string, string> = {
  'INDU Index': 'DM1 Index', 'SPX Index': 'ES1 Index', 'NDX Index': 'NQ1 Index', 'RTY Index': 'RTY1 Index',
  'SX5E Index': 'VG1 Index', 'DAX Index': 'GX1 Index', 'UKX Index': 'Z 1 Index', 'CAC Index': 'CF1 Index',
  'NKY Index': 'NK1 Index', 'HSI Index': 'HI1 Index', 'AS51 Index': 'XP1 Index',
};

/** How much one unit of a currency gained in US dollars since the start of the year, in percent (0 for USD). */
function usdYtd(ccy: string): number {
  if (ccy === 'USD') return 0;
  // The index's own currency (onshore yuan for Shanghai, not the offshore CNH), from its history.
  const pair = [`${ccy}USD Curncy`, `USD${ccy} Curncy`].find((x) => engine.get(x) && engine.hasSource(x));
  if (!pair) return NaN;
  const fx = periodChange(pair, 'YTD') / 100;
  return (pair.startsWith('USD') ? 1 / (1 + fx) - 1 : fx) * 100;
}

/** YTD change in another currency: the local return compounded with the currency's move against it. */
export function ytdIn(id: string, ccy: string): number {
  const d = engine.get(id)!;
  const local = periodChange(id, 'YTD');
  if (d.ccy === ccy) return local;
  const from = usdYtd(d.ccy);
  const to = usdYtd(ccy);
  return ((1 + local / 100) * (1 + from / 100) / (1 + to / 100) - 1) * 100;
}

/** MARKET US, MARKET EUROPE, MARKET ASIA: one region; MARKET on its own: all three. */
const REGION_ARGS: Record<string, string> = { US: 'Americas', AMERICAS: 'Americas', EUROPE: 'EMEA', EMEA: 'EMEA', UK: 'EMEA', ASIA: 'Asia/Pacific', APAC: 'Asia/Pacific', PACIFIC: 'Asia/Pacific' };
const YTD_CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CHF'];

/** The day's % change as a small bar, full width at 3%. */
function ChgBar({ pct }: { pct: number }) {
  if (!Number.isFinite(pct)) return null;
  const w = Math.min(100, (Math.abs(pct) / 3) * 100);
  return (
    <span className="chg-bar" aria-hidden="true">
      <span className={pct >= 0 ? 'up' : 'down'} style={{ width: `${w / 2}%`, [pct >= 0 ? 'left' : 'right']: '50%' }} />
    </span>
  );
}

export function WEI({ route }: FnProps) {
  useTick(1);
  const panel = usePanelId();
  const now = engine.now();
  const asked = route.args?.trim().toUpperCase() ?? '';
  const [region, setRegion] = useState<string>(REGION_ARGS[asked] ?? '');
  const [futures, setFutures] = useState(false);
  const [ytd, setYtd] = useState(true);
  const [ccy, setCcy] = useState('USD');
  const groups = region ? INDEX_GROUPS.filter((g) => g.name === region) : INDEX_GROUPS;
  const [collapsed, toggle] = useCollapsed();
  // The desktop app lists only indices it has a real source for. Each region numbers its rows from its own ten,
  // as the terminal's WEI does, and a collapsed region keeps its numbers for when it opens again.
  const lists = groups.map((g) => g.ids.filter((id) => engine.hasSource(id)));
  const open = (id: string) => openSecurity(panel, id, undefined, 'CHART');
  const nums = useGroupedRows('wei-rows', lists, groups.map((g) => !collapsed.includes(g.name)), open, (id) => indexShortName(id));
  useMenu('wei-regions', groups.map((g, gi) => ({ n: gi + 1, label: g.name, run: () => toggle(g.name) })));
  const fut = (id: string) => (FUTURE_OF[id] && engine.get(FUTURE_OF[id]) && engine.hasSource(FUTURE_OF[id]) ? FUTURE_OF[id] : undefined);
  const showFut = futures && lists.some((l) => l.some((id) => fut(id)));
  const span = 7 + (showFut ? 2 : 0) + (ytd ? 2 : 0);
  const csv = () => [
    ['Index', 'Ticker', 'Value', 'Net Chg', '%Chg', 'Time', '%Ytd', `%Ytd ${ccy}`],
    ...lists.flat().map((id) => {
      const q = engine.quote(id)!;
      return [indexShortName(id), engine.get(id)!.ticker, q.last, q.chg, q.pct, new Date(q.time).toISOString(), periodChange(id, 'YTD'), ytdIn(id, ccy)];
    }),
  ];
  return (
    <div>
      <FnHeader
        code="MARKET"
        title="World Equity Indices"
        actions={[{ n: 96, label: 'News', title: 'Market news (TOP)', onClick: () => execute(panel, 'TOP') }, ...exportActions(panel, 'world-equity-indices.csv', csv)]}
      />
      <div className="chart-tools wei-tools">
        <label className="fld">
          <select className="sel-inp" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Standard</option>
            {INDEX_GROUPS.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={futures} onChange={(e) => setFutures(e.target.checked)} /> Futures</label>
        <label className="chk"><input type="checkbox" checked={ytd} onChange={(e) => setYtd(e.target.checked)} /> %Chg YTD</label>
        {ytd && (
          <label className="fld">
            <select className="sel-inp" aria-label="YTD currency" value={ccy} onChange={(e) => setCcy(e.target.value)}>
              {YTD_CCYS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        )}
        {asked && !REGION_ARGS[asked] ? <span className="muted">No region &quot;{route.args}&quot;: try US, EUROPE or ASIA</span> : null}
        <span className="muted wei-note">Values in local currency</span>
      </div>
      <table className="tbl wei">
        <thead>
          <tr>
            <th>Index</th>
            <th className="hide-m hide-n">Intraday</th>
            <th className="num">Value</th>
            <th className="num">Net Chg</th>
            <th className="num">%Chg</th>
            <th className="hide-m" aria-label="Change bar" />
            <th className="num hide-m">Time</th>
            {showFut && <th className="num hide-m">Fut Value</th>}
            {showFut && <th className="num hide-m">Fut %Chg</th>}
            {ytd && <th className="num">%Ytd</th>}
            {ytd && <th className="num hide-m">%Ytd{ccy}</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => (
            <Fragment key={g.name}>
              <GroupRow n={gi + 1} name={g.name} span={span} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} />
              {(collapsed.includes(g.name) ? [] : lists[gi]).map((id, i) => {
                const n = nums[gi][i];
                const d = engine.get(id)!;
                const q = engine.quote(id)!;
                const f = fut(id);
                const fq = f ? engine.quote(f) : undefined;
                return (
                  <tr key={id} className="click" onClick={(e) => openSecurity(panel, id, e, 'CHART')}>
                    <td className="wei-name" title={`${d.ticker} Index · ${d.name}`}>
                      <RowNo n={n} />
                      <SecLink id={id} fn="CHART">
                        {indexShortName(id)}
                      </SecLink>
                    </td>
                    <td className="hide-m hide-n">
                      <Sparkline values={engine.intraday(id).c.subarray(0, engine.intraday(id).length)} width={90} height={14} />
                    </td>
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
                    <td className="hide-m">{q.chgCheck !== 'unverified' && <ChgBar pct={q.pct} />}</td>
                    <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                    {showFut && <td className="num hide-m">{fq ? <LivePx id={f!} /> : ''}</td>}
                    {showFut && <td className="num hide-m">{fq ? <DayChg q={fq} pct /> : ''}</td>}
                    {ytd && (
                      <td className="num">
                        <Chg v={periodChange(id, 'YTD')} pct />
                      </td>
                    )}
                    {ytd && (
                      <td className="num hide-m">
                        <Chg v={ytdIn(id, ccy)} pct />
                      </td>
                    )}
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
  const [collapsed, toggle] = useCollapsed();
  const groups = FUT_GROUPS.filter((g) => g.ids.some((id) => engine.hasSource(id)));
  const lists = groups.map((g) => g.ids.filter((id) => !!engine.get(id) && engine.hasSource(id)));
  const nums = useGroupedRows('weif-rows', lists, groups.map((g) => !collapsed.includes(g.name)), (id) => openSecurity(panel, id, undefined, 'INTRADAY'), (id) => engine.get(id)?.name ?? id);
  useMenu('weif-regions', groups.map((g, gi) => ({ n: gi + 1, label: g.name, run: () => toggle(g.name) })));
  // The delay Yahoo states for the contracts, rather than an assumption about the exchange.
  const delays = FUT_GROUPS.flatMap((g) => g.ids)
    .filter((id) => engine.hasSource(id))
    .map((id) => engine.quote(id)?.delay ?? NaN)
    .filter((d) => Number.isFinite(d) && d > 0);
  const timing = delays.length ? `delayed ${Math.max(...delays)} minutes as Yahoo states` : 'timed as each price is marked';
  return (
    <div>
      <FnHeader code="INDEXFUTURES" title="World Equity Index Futures" sub={engine.realOnly ? 'Front contracts · fair value is a model from the financing rate and dividend yield' : 'Front contracts · fair value from financing rate and dividend yield'} />
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
          {groups.map((g, gi) => (
            <Fragment key={g.name}>
              <GroupRow n={gi + 1} name={g.name} span={14} open={!collapsed.includes(g.name)} onToggle={() => toggle(g.name)} />
              {(collapsed.includes(g.name) ? [] : lists[gi]).map((id, i) => {
                const n = nums[gi][i];
                const d = engine.get(id)!;
                const q = engine.quote(id)!;
                const u = engine.quote(d.fut!.underlying)!;
                const c = engine.realOnly ? realFutureContract(d) : engine.futureContract(id)!;
                const intra = engine.intraday(id);
                return (
                  <tr key={id} className="click" onClick={(e) => openSecurity(panel, id, e, 'INTRADAY')}>
                    <td>
                      <RowNo n={n} />
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
                      <SecLink id={d.fut!.underlying} fn="CHART">
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
          ? `Prices, contracts and last trade dates from Yahoo Finance (CME, ${timing}). Basis and premium set the future against the index as each is timed. Fair value is a model: index × e^((r − q) × days/365) with the 3-month Treasury rate and the dividends the index’s ETF paid over the past 12 months as a share of its price. Non-US index futures have no free source and are not listed.`
          : 'Fair value = index × e^((r − q) × days/365), using the 3-month bill (or local policy rate) and the index dividend yield. Futures prices are simulated around fair value.'}
      </p>
    </div>
  );
}
