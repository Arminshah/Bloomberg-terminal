import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { fmtDay, fmtNum, fmtPct, signClass } from '../core/format';
import { engine, useHistoryVersion } from '../data/market';
import { rankStrategies, STRATEGY, type StrategyId, type StrategyResult } from '../finance/strategies';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * STRATEGIES (BTST): popular trading rules run on the loaded security's daily closes over a period, ranked by return
 * or risk, with each rule's growth beside buying and holding.
 */

const PERIODS = [
  { id: '1Y', days: 252 },
  { id: '2Y', days: 504 },
  { id: '3Y', days: 756 },
  { id: '5Y', days: 1260 },
] as const;
type RankBy = 'totalReturn' | 'sharpe' | 'maxDrawdown' | 'winRate';
const RANK: Record<RankBy, string> = { totalReturn: 'Total return', sharpe: 'Sharpe ratio', maxDrawdown: 'Smallest drawdown', winRate: 'Win rate' };
const pct = (v: number) => (Number.isFinite(v) ? fmtPct(v, 1) : '');
/** A level, not a change: no plus sign. */
const lvl = (v: number) => (Number.isFinite(v) ? fmtPct(v, 1, false) : '');
const NOW: Record<number, string> = { 1: 'Long', 0: 'Out', [-1]: 'Short' };

export function BTST({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const history = useHistoryVersion();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['id']>('2Y');
  const [shorts, setShorts] = useState(false);
  const [cost, setCost] = useState(5);
  const [rankBy, setRankBy] = useState<RankBy>('totalReturn');
  const [picked, setPicked] = useState<StrategyId>('sma-cross');
  const days = PERIODS.find((p) => p.id === period)!.days;
  const run = useMemo(() => {
    const d = engine.daily(s.id);
    const n = d.length;
    if (n < 30) return null;
    const t = d.t.subarray(0, n);
    const c = d.c.subarray(0, n);
    if (s.quote === 'yield') return null;
    return { t, ...rankStrategies(t, c, days, cost, shorts) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id, days, cost, shorts, history]);
  const key = (r: StrategyResult) => (rankBy === 'maxDrawdown' ? -r.maxDrawdown : -r[rankBy]);
  const ranked = run ? [...run.results].sort((a, b) => (Number.isFinite(key(a)) ? key(a) : Infinity) - (Number.isFinite(key(b)) ? key(b) : Infinity) || a.id.localeCompare(b.id)) : [];
  const hold = run?.results.find((r) => r.id === 'hold');
  const chosen = run?.results.find((r) => r.id === picked) ?? ranked[0];
  const from = run ? run.t[run.start] : NaN;
  const to = run ? run.t[run.t.length - 1] : NaN;
  const growth = (r: StrategyResult) => r.equity.map((v, i) => ({ x: i, y: v * 100 }));
  const series: XYSeries[] = [
    ...(chosen && chosen.id !== 'hold' ? [{ label: STRATEGY[chosen.id].name, color: '#45d3e6', points: growth(chosen), width: 2 }] : []),
    ...(hold ? [{ label: 'Buy and hold', color: '#f0a030', points: growth(hold) }] : []),
  ];
  const ticks = run
    ? Array.from(run.t.subarray(run.start))
        .map((t, i) => ({ v: i, t }))
        .filter((x, i, a) => i === 0 || new Date(x.t).getUTCFullYear() !== new Date(a[i - 1].t).getUTCFullYear())
        .map((x) => ({ v: x.v, label: String(new Date(x.t).getUTCFullYear()) }))
    : [];
  const csv = () => [
    ['Strategy', 'Rule', 'Total return %', 'Annual return %', 'Volatility %', 'Sharpe', 'Max drawdown %', 'Trades', 'Closed', 'Win rate %', 'Time in market %', 'Position now'],
    ...ranked.map((r) => [STRATEGY[r.id].name, STRATEGY[r.id].rule, r.totalReturn, r.cagr, r.vol, r.sharpe, r.maxDrawdown, r.trades, r.closed, r.winRate, r.exposure, NOW[r.now]]),
  ];
  const sel = <T extends string | number>(label: string, value: T, options: [T, string][], set: (v: T) => void) => (
    <label className="fld">
      {label}
      <select className="sel-inp" aria-label={label} value={String(value)} onChange={(e) => set((typeof value === 'number' ? Number(e.target.value) : e.target.value) as T)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div>
      <FnHeader
        code="STRATEGIES"
        title="Strategy Backtesting"
        sec={s}
        sub={run && Number.isFinite(from) ? `${s.ticker}: daily closes ${fmtDay(from)} to ${fmtDay(to)}, ${run.t.length - 1 - run.start} trading days` : `${s.ticker}: daily closes`}
        actions={exportActions(panel, `BTST_${s.ticker.replace(/\W+/g, '_')}_${period}.csv`, csv)}
        controls={
          <div className="chart-tools">
            {sel('Period', period, PERIODS.map((p) => [p.id, p.id]), setPeriod)}
            {sel('Positions', shorts ? 'ls' : 'l', [['l', 'Long only'], ['ls', 'Long and short']], (v) => setShorts(v === 'ls'))}
            {sel('Cost', cost, [0, 5, 10, 25].map((n) => [n, `${n} bp a trade`]), setCost)}
            {sel('Rank by', rankBy, (Object.keys(RANK) as RankBy[]).map((k) => [k, RANK[k]]), setRankBy)}
          </div>
        }
      />
      {!run ? (
        <div className="empty">{s.quote === 'yield' ? 'A yield is not a traded price: the rules need a security’s closes.' : 'Waiting for daily history from the sources.'}</div>
      ) : (
        <>
          <table className="tbl zebra" data-testid="btst-table">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Strategy</th>
                <th className="num">Total</th>
                <th className="num hide-m">Annual</th>
                <th className="num hide-m">Volatility</th>
                <th className="num">Sharpe</th>
                <th className="num">Max DD</th>
                <th className="num hide-m">Trades</th>
                <th className="num hide-m">Win rate</th>
                <th className="num hide-m">In market</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.id} className={`link${chosen?.id === r.id ? ' sel' : ''}`} onClick={() => setPicked(r.id)} title={`${STRATEGY[r.id].rule}. Click to draw it beside buying and holding.`}>
                  <td className="num muted">{i + 1}</td>
                  <td className={r.id === 'hold' ? 'white' : 'amber'}>{STRATEGY[r.id].name}</td>
                  <td className={`num ${signClass(r.totalReturn)}`}>{pct(r.totalReturn)}</td>
                  <td className={`num hide-m ${signClass(r.cagr)}`}>{pct(r.cagr)}</td>
                  <td className="num hide-m">{lvl(r.vol)}</td>
                  <td className="num">{Number.isFinite(r.sharpe) ? fmtNum(r.sharpe, 2) : ''}</td>
                  <td className="num dn">{pct(r.maxDrawdown)}</td>
                  <td className="num hide-m">{r.trades}</td>
                  <td className="num hide-m" title={`${r.closed} closed trade${r.closed === 1 ? '' : 's'}`}>
                    {lvl(r.winRate)}
                  </td>
                  <td className="num hide-m">{lvl(r.exposure)}</td>
                  <td className={r.now > 0 ? 'up' : r.now < 0 ? 'dn' : 'muted'}>{NOW[r.now]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chosen && (
            <>
              <div className="note pad-s amber">
                {STRATEGY[chosen.id].name}: {STRATEGY[chosen.id].rule}
                {shorts && chosen.id !== 'hold' ? '; short on the mirror signal' : ''}.
              </div>
              <XYChart series={series} xTicks={ticks} yFormat={(v) => fmtNum(v, 0)} height={240} legend />
            </>
          )}
          <div className="note">
            Each rule decides on a day&apos;s close from the closes up to that day, and its position earns the next day&apos;s change; a change of position
            costs {cost} basis points of the amount traded (a reversal trades twice). Growth of 100 from the first day of the period, price changes only
            (no dividends, no interest on cash, no financing cost for shorts). The Sharpe ratio is the annualised mean daily return over its annualised
            volatility, with no risk-free rate deducted. Win rate is the share of closed trades that gained after costs.
            {run.short.length ? ` Not enough history before the period for ${run.short.map((id) => STRATEGY[id].name).join(', ')}.` : ''}
            {engine.quote(s.id)?.provider ? ` Daily closes from ${engine.quote(s.id)?.provider}.` : ''}
          </div>
        </>
      )}
    </div>
  );
}
