import { Fragment, useState } from 'react';
import { GroupRow, RowNo, useCollapsed } from '../components/Numbered';
import { FnHeader } from '../components/FnHeader';
import { Sparkline } from '../components/Sparkline';
import { Chg, DayChg, LivePx, SecLink } from '../components/cells';
import { FreshnessLegend } from '../components/Freshness';
import { Flash } from '../components/Flash';
import { fmtNum, fmtStamp } from '../core/format';
import { engine, useTick } from '../data/market';
import { periodChange, type Horizon } from '../data/analytics';
import { DAY_MS } from '../data/calendar';
import type { Series } from '../data/series';
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

/** How much one unit of a currency gained in US dollars over a period, in percent (0 for USD). */
function usdChange(ccy: string, h: Horizon): number {
  if (ccy === 'USD') return 0;
  // The index's own currency (onshore yuan for Shanghai, not the offshore CNH), from its history.
  const pair = [`${ccy}USD Curncy`, `USD${ccy} Curncy`].find((x) => engine.get(x) && engine.hasSource(x));
  if (!pair) return NaN;
  const fx = periodChange(pair, h) / 100;
  return (pair.startsWith('USD') ? 1 / (1 + fx) - 1 : fx) * 100;
}

/** A period's change in another currency: the local return compounded with the currency's move against it. */
export function changeIn(id: string, ccy: string, h: Horizon = 'YTD'): number {
  const d = engine.get(id)!;
  const local = periodChange(id, h);
  if (d.ccy === ccy) return local;
  const from = usdChange(d.ccy, h);
  const to = usdChange(ccy, h);
  return ((1 + local / 100) * (1 + from / 100) / (1 + to / 100) - 1) * 100;
}

/** YTD change in another currency. */
export const ytdIn = (id: string, ccy: string) => changeIn(id, ccy, 'YTD');

/** Trading days a year for annualising a daily risk figure: the provider's daily convention in PORT (261). */
export const DAYS_A_YEAR = 261;

/**
 * Historical volatility over the last `days` completed sessions, as WEI's 10D Vol and 30D Vol: the sample standard
 * deviation of the daily log returns between the last `days + 1` closes before today, annualised with 261 trading
 * days, in percent. NaN without enough closes.
 */
export function historicalVol(s: Pick<Series, 't' | 'c' | 'length'>, days: number, before: number): number {
  const closes: number[] = [];
  for (let i = 0; i < s.length; i++) if (s.t[i] < before && s.c[i] > 0) closes.push(s.c[i]);
  if (closes.length < days + 1) return NaN;
  const last = closes.slice(-(days + 1));
  const r = last.slice(1).map((c, i) => Math.log(c / last[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance) * Math.sqrt(DAYS_A_YEAR) * 100;
}

/** The periods the extra change column can cover (WEI's "%Chg 3M ▾", TE04 01:21). */
const PERIODS: Horizon[] = ['1M', '3M', '6M', 'YTD', '1Y'];

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
  // As TE04 01:21: the change bars (Movers) and the 10- and 30-day volatility shown, the extra change over 3 months.
  const [movers, setMovers] = useState(true);
  const [vol, setVol] = useState(true);
  const [period, setPeriod] = useState<Horizon | ''>('3M');
  const ytd = period !== '';
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
  const span = 6 + (movers ? 1 : 0) + (vol ? 2 : 0) + (showFut ? 2 : 0) + (ytd ? 2 : 0);
  const today = engine.today * DAY_MS;
  const per = period || 'YTD';
  const perLabel = `%Chg ${per}`;
  const csv = () => [
    ['Index', 'Ticker', 'Value', 'Net Chg', '%Chg', 'Time', '10D Vol', '30D Vol', perLabel, `${perLabel} ${ccy}`],
    ...lists.flat().map((id) => {
      const q = engine.quote(id)!;
      return [indexShortName(id), engine.get(id)!.ticker, q.last, q.chg, q.pct, new Date(q.time).toISOString(), historicalVol(engine.daily(id), 10, today), historicalVol(engine.daily(id), 30, today), periodChange(id, per), changeIn(id, ccy, per)];
    }),
  ];
  return (
    <div>
      <FnHeader
        code="MARKET"
        title="World Equity Indices"
        actions={[
          {
            n: 9901,
            bare: true,
            label: 'News',
            onClick: () => {},
            menu: [
              { label: 'Top News', title: 'TOP', onClick: () => execute(panel, 'TOP') },
              { label: 'World Equity Index Futures', title: 'WEIF', onClick: () => execute(panel, 'INDEXFUTURES') },
            ],
          },
          {
            n: 9902,
            bare: true,
            label: 'Settings',
            onClick: () => {},
            menu: exportActions(panel, 'world-equity-indices.csv', csv).map((a) => ({ label: a.label === 'Copy' ? 'Copy Table to Clipboard' : 'Download Table as CSV', title: a.title, onClick: a.onClick })),
          },
        ]}
      />
      <div className="chart-tools wei-tools">
        <label className="fld">
          <select className="sel-inp" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">Standard</option>
            {INDEX_GROUPS.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
          </select>
        </label>
        <label className="chk"><input type="checkbox" checked={movers} onChange={(e) => setMovers(e.target.checked)} /> Movers</label>
        <label className="chk" title={`10- and 30-day historical volatility of the daily closes, annualised with ${DAYS_A_YEAR} trading days`}><input type="checkbox" checked={vol} onChange={(e) => setVol(e.target.checked)} /> Volatility</label>
        <label className="chk"><input type="checkbox" checked={futures} onChange={(e) => setFutures(e.target.checked)} /> Futures</label>
        <label className="fld">
          <select className="sel-inp" aria-label="Change period" value={period} onChange={(e) => setPeriod(e.target.value as Horizon | '')}>
            <option value="">No %Chg</option>
            {PERIODS.map((h) => <option key={h} value={h}>%Chg {h}</option>)}
          </select>
        </label>
        {ytd && (
          <label className="fld">
            <select className="sel-inp" aria-label="Change currency" value={ccy} onChange={(e) => setCcy(e.target.value)}>
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
            {movers && <th className="hide-m" aria-label="Change bar" />}
            <th className="num">%Chg</th>
            <th className="num hide-m">Time</th>
            {vol && <th className="num hide-m" title={`Historical volatility of the last 10 sessions' daily closes, annualised (${DAYS_A_YEAR} days)`}>10D Vol</th>}
            {vol && <th className="num hide-m" title={`Historical volatility of the last 30 sessions' daily closes, annualised (${DAYS_A_YEAR} days)`}>30D Vol</th>}
            {showFut && <th className="num hide-m">Fut Value</th>}
            {showFut && <th className="num hide-m">Fut %Chg</th>}
            {ytd && <th className="num">{perLabel}</th>}
            {ytd && <th className="num hide-m">{perLabel} {ccy}</th>}
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
                    {movers && <td className="hide-m">{q.chgCheck !== 'unverified' && <ChgBar pct={q.pct} />}</td>}
                    <td className="num">
                      <Flash value={q.pct}>
                        <DayChg q={q} pct />
                      </Flash>
                    </td>
                    <td className="num muted hide-m">{fmtStamp(q.time, now)}</td>
                    {vol && <td className="num amber hide-m">{volText(historicalVol(engine.daily(id), 10, today))}</td>}
                    {vol && <td className="num amber hide-m">{volText(historicalVol(engine.daily(id), 30, today))}</td>}
                    {showFut && <td className="num hide-m">{fq ? <LivePx id={f!} /> : ''}</td>}
                    {showFut && <td className="num hide-m">{fq ? <DayChg q={fq} pct /> : ''}</td>}
                    {/* Yahoo has no history for some indices (the CSI 300: today's bar only): no year-to-date change. */}
                    {ytd && (
                      <td className="num" title={Number.isFinite(periodChange(id, per)) ? undefined : NO_HISTORY}>
                        {Number.isFinite(periodChange(id, per)) ? <Chg v={periodChange(id, per)} pct /> : null}
                      </td>
                    )}
                    {ytd && (
                      <td className="num hide-m" title={Number.isFinite(changeIn(id, ccy, per)) ? undefined : NO_HISTORY}>
                        {Number.isFinite(changeIn(id, ccy, per)) ? <Chg v={changeIn(id, ccy, per)} pct /> : null}
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

const NO_HISTORY = 'No price history from the source back to the start of the period';
const volText = (v: number) => (Number.isFinite(v) ? fmtNum(v, 2) : '');

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
