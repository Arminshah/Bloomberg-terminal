import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { fmtNum, fmtPct, signClass } from '../core/format';
import { calendarYears, monthKey, prevMonth, RULES, runBacktest, statsOf, type BacktestSpec, type Pick, type Rule, type Stats } from '../data/backtest';
import { useIndexList, yahooOf } from '../data/live/index-members';
import { useMonthlyCloses } from '../data/live/monthly-closes';
import { desktopData } from '../data/live/yahoo';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * EQBT, equity backtesting: a rule (momentum, short-term reversal, low volatility or trend) picks stocks from an
 * index's members on their month-end closes, held in equal weights and rebalanced monthly or quarterly over up to ten
 * years, against the index and the members in equal weights: growth, annual return, volatility, drawdown, each year
 * and the picks at each rebalance. Price returns from Yahoo's closes, on today's members.
 */

/** The universes, with the index's own symbol on Yahoo as the benchmark. */
export const UNIVERSES: { id: string; label: string; bench: string }[] = [
  { id: 'INDU Index', label: 'Dow Jones Industrial Average', bench: '^DJI' },
  { id: 'NDX Index', label: 'Nasdaq-100', bench: '^NDX' },
  { id: 'SPX Index', label: 'S&P 500', bench: '^GSPC' },
];

/** The universe a command names ("EQBT SPX"), or the index loaded; the Dow otherwise. */
export function universeOf(args: string | undefined, secId: string | undefined): string {
  const a = (args ?? '').trim().toUpperCase().split(/\s+/)[0] ?? '';
  const named = UNIVERSES.find((u) => u.id.split(' ')[0] === a);
  if (named) return named.id;
  return UNIVERSES.some((u) => u.id === secId) ? secId! : 'INDU Index';
}

/** A pick's score in the rule's own terms, %: the return, the fall, the annualised volatility or the distance above the average. */
export function scoreShown(rule: Rule, p: Pick): number {
  if (rule === 'reversal') return -p.score * 100;
  if (rule === 'lowvol') return -p.score * Math.sqrt(12) * 100;
  return p.score * 100;
}

const SCORE_LABEL: Record<Rule, string> = { momentum: 'Return', reversal: 'Return', lowvol: 'Volatility', trend: 'Above average' };
const COLORS = { strategy: '#45d3e6', equal: '#9a9a9a', index: '#f0a030' };
const monthName = (m: string) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
const pct = (v: number) => (Number.isFinite(v) ? fmtPct(v, 1) : '');

export function EQBT({ route, sec }: FnProps) {
  const panel = usePanelId();
  const [universe, setUniverse] = useState(universeOf(route.args, sec?.id));
  const [rule, setRule] = useState<Rule>('momentum');
  const [lookback, setLookback] = useState(RULES.momentum.lookback);
  const [holdings, setHoldings] = useState(10);
  const [every, setEvery] = useState(1);
  const [costBps, setCostBps] = useState(10);
  const [start, setStart] = useState('');
  const [tab, setTab] = useState(1);
  const u = UNIVERSES.find((x) => x.id === universe) ?? UNIVERSES[0];
  const list = useIndexList(u.id);
  const members = useMemo(() => list?.members ?? [], [list?.members]);
  const symbols = useMemo(() => [u.bench, ...members.map((m) => yahooOf(m.symbol))], [u.bench, members]);
  const { by, pending, problem } = useMonthlyCloses(desktopData() ? symbols : []);
  const last = prevMonth(monthKey(Date.now()));
  const spec: BacktestSpec = { rule, lookback, holdings, every, costBps, start };
  const ready = members.length > 0 && pending === 0;
  const result = useMemo(() => {
    if (!ready || !by[u.bench]) return null;
    const stocks = Object.fromEntries(members.map((m) => [m.symbol, by[yahooOf(m.symbol)]]).filter(([, c]) => !!c)) as Record<string, Record<string, number>>;
    return runBacktest(stocks, by[u.bench]!, spec, last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, u.bench, rule, lookback, holdings, every, costBps, start, last]);
  const missing = ready ? members.filter((m) => !by[yahooOf(m.symbol)]).length : 0;
  const info = new Map(members.map((m) => [m.symbol, m]));
  const years = by[u.bench] ? [...new Set(Object.keys(by[u.bench]!).map((m) => m.slice(0, 4)))].sort() : [];
  const stats: [string, Stats | null][] = result
    ? [
        [`${RULES[rule].label}, ${holdings} stocks`, statsOf(result.strategy, result.index)],
        ['Members in equal weights', statsOf(result.equal, result.index)],
        [u.label, statsOf(result.index, result.index)],
      ]
    : [];
  const growth = (values: number[]) => values.map((v, i) => ({ x: i, y: (v / values[0]) * 100 }));
  const chart: XYSeries[] = result
    ? [
        { label: `${RULES[rule].label}, ${holdings} stocks`, color: COLORS.strategy, points: growth(result.strategy), width: 2 },
        { label: 'Members in equal weights', color: COLORS.equal, points: growth(result.equal) },
        { label: u.label, color: COLORS.index, points: growth(result.index) },
      ]
    : [];
  const ticks = result ? result.months.map((m, i) => ({ v: i, label: m.slice(0, 4) })).filter((_, i) => result.months[i].endsWith('-01')) : [];
  const cal = result ? { s: calendarYears(result.months, result.strategy), e: calendarYears(result.months, result.equal), i: calendarYears(result.months, result.index) } : null;
  const csv = () =>
    result
      ? [['Month', 'Strategy', 'Equal weight', 'Index'], ...result.months.map((m, i) => [m, result.strategy[i], result.equal[i], result.index[i]])]
      : [['Month', 'Strategy', 'Equal weight', 'Index']];
  const status = !desktopData()
    ? 'Backtests run on real month-end closes from Yahoo Finance in the desktop app. The browser demo has none, and none are generated.'
    : !list || (list.state === 'loading' && !members.length)
      ? `Reading the ${u.label}'s members…`
      : !members.length
        ? (list.message ?? `The ${u.label}'s members could not be read.`)
        : pending > 0
          ? `Reading ten years of month-end closes from Yahoo Finance: ${symbols.length - pending} of ${symbols.length}…`
          : !by[u.bench]
            ? (problem ?? `Yahoo Finance gave no closes for the ${u.label}.`)
            : !result
              ? 'Not enough history for this rule from the start chosen.'
              : '';
  const sel = <T extends string | number>(label: string, value: T, options: [T, string][], set: (v: T) => void) => (
    <label className="fld">
      {label}
      <select className="sel-inp" aria-label={label} value={String(value)} onChange={(e) => set((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>{l}</option>
        ))}
      </select>
    </label>
  );
  return (
    <div>
      <FnHeader
        code="BACKTEST"
        title="Equity Backtesting"
        sub={<><RealBadge /> {u.label} members today, month-end closes from Yahoo Finance{result ? `, ${monthName(result.months[0])} to ${monthName(result.months[result.months.length - 1])}` : ''}</>}
        tabs={[{ n: 1, label: 'Performance' }, { n: 2, label: 'Years' }, { n: 3, label: 'Holdings' }]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `EQBT_${u.id.split(' ')[0]}_${rule}.csv`, csv)}
        controls={
          <div className="chart-tools">
            {sel('Universe', universe, UNIVERSES.map((x) => [x.id, x.label]), setUniverse)}
            {sel('Rule', rule, (Object.keys(RULES) as Rule[]).map((r) => [r, RULES[r].label]), (r) => {
              setRule(r);
              setLookback(RULES[r].lookback);
            })}
            {sel('Lookback', lookback, RULES[rule].lookbacks.map((n) => [n, `${n} month${n > 1 ? 's' : ''}`]), setLookback)}
            {sel('Stocks', holdings, [5, 10, 20, 30].map((n) => [n, String(n)]), setHoldings)}
            {sel('Rebalance', every, [[1, 'Monthly'], [3, 'Quarterly']], setEvery)}
            {sel('Cost', costBps, [0, 10, 25, 50].map((n) => [n, `${n} bp`]), setCostBps)}
            {sel('From', start, [['', 'Earliest'], ...years.slice(1, -1).map((y): [string, string] => [`${y}-01`, y])], setStart)}
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : result && tab === 1 ? (
        <>
          <XYChart series={chart} xTicks={ticks} yFormat={(v) => fmtNum(v, 0)} height={220} legend />
          <div className="note amber" role="status">
            Today&apos;s members only: a stock that joined the {u.label} after rising is held here from the start, so these returns are higher than
            the rule would have earned at the time.
          </div>
          <table className="tbl" aria-label="Backtest results">
            <thead>
              <tr>
                <th>Portfolio</th>
                <th className="num">Total</th>
                <th className="num">Annual</th>
                <th className="num">Volatility</th>
                <th className="num">Return/vol</th>
                <th className="num">Max drawdown</th>
                <th className="num">Best month</th>
                <th className="num">Worst month</th>
                <th className="num">Months beating index</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(([label, s], i) => (
                <tr key={label}>
                  <td className={i === 0 ? 'cyan' : i === 2 ? 'amber' : undefined}>{label}</td>
                  <td className={`num ${signClass(s!.total)}`}>{pct(s!.total)}</td>
                  <td className={`num ${signClass(s!.cagr)}`}>{pct(s!.cagr)}</td>
                  <td className="num">{fmtNum(s!.vol, 1)}%</td>
                  <td className="num">{fmtNum(s!.ratio, 2)}</td>
                  <td className="num dn">{pct(s!.maxDrawdown)}</td>
                  <td className="num">{pct(s!.best)}</td>
                  <td className="num">{pct(s!.worst)}</td>
                  <td className="num">{i === 2 ? '' : `${fmtNum(s!.beat, 0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            The rule holds {RULES[rule].desc}, {holdings} stocks in equal weights, rebalanced {every === 1 ? 'monthly' : 'quarterly'} on closes up to each
            month&apos;s end; {costBps} bp is charged on the weight bought and sold.{result.rebalances.length > 1 ? ` After the first purchase a rebalance bought ${fmtNum((result.rebalances.slice(1).reduce((a, r) => a + r.bought, 0) / (result.rebalances.length - 1)) * 100, 0)}% of the portfolio on average.` : ''} Annual is the compound annual return; volatility is that of monthly returns, annualised.
            {' '}Stocks that left the index in the period are not in it either, and a stock is ranked only once Yahoo has its closes. Returns are price returns (Yahoo&apos;s closes are not adjusted for dividends), as is the index&apos;s.
            {missing > 0 ? ` Yahoo gave no closes for ${missing} member${missing > 1 ? 's' : ''}.` : ''}
            {list?.message ? ` ${list.message}` : ''}
          </div>
        </>
      ) : result && tab === 2 && cal ? (
        <table className="tbl" aria-label="Calendar years">
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Strategy</th>
              <th className="num">Equal weight</th>
              <th className="num">{u.label}</th>
              <th className="num">Strategy less index</th>
            </tr>
          </thead>
          <tbody>
            {cal.s.map((y, k) => (
              <tr key={y.year}>
                <td>{y.year}{y.months < 12 ? ` (${y.months} month${y.months > 1 ? 's' : ''})` : ''}</td>
                <td className={`num ${signClass(y.ret)}`}>{pct(y.ret)}</td>
                <td className={`num ${signClass(cal.e[k].ret)}`}>{pct(cal.e[k].ret)}</td>
                <td className={`num ${signClass(cal.i[k].ret)}`}>{pct(cal.i[k].ret)}</td>
                <td className={`num ${signClass(y.ret - cal.i[k].ret)}`}>{pct(y.ret - cal.i[k].ret)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : result ? (
        <>
          <table className="tbl" aria-label="Picks now">
            <caption className="muted">The rule&apos;s picks at the end of {monthName(last)}</caption>
            <thead>
              <tr>
                <th>#</th>
                <th>Ticker</th>
                <th>Company</th>
                <th>Sector</th>
                <th className="num">{SCORE_LABEL[rule]}</th>
              </tr>
            </thead>
            <tbody>
              {result.latest.map((p, k) => (
                <tr key={p.symbol}>
                  <td>{k + 1}</td>
                  <td className="amber">{p.symbol}</td>
                  <td>{info.get(p.symbol)?.name ?? ''}</td>
                  <td>{info.get(p.symbol)?.sector ?? ''}</td>
                  <td className="num">{rule === 'lowvol' ? `${fmtNum(scoreShown(rule, p), 1)}%` : pct(scoreShown(rule, p))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="tbl" aria-label="Rebalances">
            <thead>
              <tr>
                <th>Month end</th>
                <th>Picks</th>
                <th className="num">Bought</th>
                <th className="num">Next period</th>
              </tr>
            </thead>
            <tbody>
              {[...result.rebalances].reverse().map((r) => {
                const i = result.months.indexOf(r.month);
                const j = Math.min(i + every, result.months.length - 1);
                const ret = j > i ? (result.strategy[j] / result.strategy[i] - 1) * 100 : NaN;
                return (
                  <tr key={r.month}>
                    <td>{monthName(r.month)}</td>
                    <td>{r.picks.length ? r.picks.map((p) => p.symbol).join(', ') : 'Cash'}</td>
                    <td className="num">{fmtNum(r.bought * 100, 0)}%</td>
                    <td className={`num ${signClass(ret)}`}>{pct(ret)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note">Bought is the share of the portfolio bought at the rebalance; next period is the portfolio&apos;s return to the following rebalance, after costs.</div>
        </>
      ) : null}
    </div>
  );
}

