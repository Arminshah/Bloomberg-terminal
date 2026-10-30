import { useEffect, useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { createStore } from '../core/store';
import { backtestAsync, type BacktestResult } from '../finance/mpc';
import { align, policyOf, STOCKS, TESTS, type TestDef, type Varied } from '../data/mpc-tests';
import { useAdjustedHistory } from '../data/live/adjusted-history';
import { useFredChart } from '../data/live/fred-chart';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * MPC, the dissertation's portfolio back-tests (model predictive control applied to portfolio management): the Hold
 * policy and twelve MPC tests, each with its input and result table and its value chart (and weights chart for the
 * long-only and dollar-neutral tests), on Tiingo's adjusted closes of its 20 stocks and FRED's 3-month bill rate.
 */

const VARIED_LABEL: Record<Varied, string> = { horizon: 'Horizon', riskAversion: 'RAv', tradingAversion: 'TAv', holdingAversion: 'HAv', leverage: 'Lev' };
const SHORT: Record<string, string> = { hold: 'Hold', horizon: 'Horizon', rav1: 'RAv 10d', rav2: 'RAv 100d', tav1: 'TAv 10d', tav2: 'TAv 100d', hav1: 'HAv 10d', hav2: 'HAv 100d', lev1: 'Lev 10d', lev2: 'Lev 100d', long: 'Long only', 'dn-rav': 'DN RAv', 'dn-lev': 'DN Lev' };
const TABS = [...TESTS.map((t, i) => ({ n: i + 1, label: SHORT[t.id] })), { n: TESTS.length + 1, label: 'Data' }];
const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
/** 2012-01-01 as "1st January 2012", the dissertation's way. */
export const longDate = (iso: string) => `${ordinal(Number(iso.slice(8, 10)))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const group = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 });
/** Turnover as the dissertation prints it: four significant figures, thousands grouped. */
export const turnoverText = (v: number) => (!Number.isFinite(v) ? '' : Math.abs(v) >= 1000 ? group(v) : Number(v.toPrecision(4)).toString());

/** Back-test results kept while the app runs, by test, value and inputs; one run at a time. */
const runs = createStore<{ v: number; by: Record<string, BacktestResult | null>; running?: string; progress: number }>({ v: 0, by: {}, progress: 0 });
const queue: { key: string; start: () => Promise<BacktestResult | null> }[] = [];
let busy = false;
async function pump() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const job = queue.shift()!;
    if (job.key in runs.get().by) continue;
    runs.set((s) => ({ ...s, v: s.v + 1, running: job.key, progress: 0 }));
    const result = await job.start();
    runs.set((s) => ({ ...s, v: s.v + 1, by: { ...s.by, [job.key]: result }, running: undefined, progress: 0 }));
  }
  busy = false;
}

export function MPC(_: FnProps) {
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [start, setStart] = useState('2012-01-01');
  const [end, setEnd] = useState('2016-12-31');
  const [budget, setBudget] = useState('200000');
  const [spread, setSpread] = useState('0.05');
  const [borrow, setBorrow] = useState('0.01');
  const [weightsOf, setWeightsOf] = useState(0);
  const desktop = typeof window !== 'undefined' && typeof window.arminDesktop?.eod === 'function';
  const tickers = useMemo(() => STOCKS.map((s) => s.tiingo ?? s.ticker), []);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start < end;
  const hist = useAdjustedHistory(tickers, start, end, desktop && valid);
  // Two weeks before the start, so the first day has a published rate.
  const rfFrom = valid ? new Date(Date.parse(start) - 14 * 86_400_000).toISOString().slice(0, 10) : start;
  const fred = useFredChart(desktop ? [{ id: 'DTB3', units: 'lin' }] : [], rfFrom);
  const dtb3 = fred.obs({ id: 'DTB3', units: 'lin' });
  runs.use((s) => s.v);
  const loaded = tickers.filter((t) => hist[t]?.state === 'ok').length;
  const failed = tickers.filter((t) => hist[t]?.state === 'error');
  const data = useMemo(() => {
    if (loaded !== tickers.length || dtb3?.state !== 'ok') return null;
    return align(tickers.map((t) => (hist[t] as { bars: { date: string; adj: number; close: number }[] }).bars), dtb3.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, dtb3?.state]);
  const costs = { halfSpread: Number(spread) / 100, borrowPerDay: Number(borrow) / 100 };
  const each = Number(budget) / STOCKS.length;
  const inputsOk = Number.isFinite(costs.halfSpread) && costs.halfSpread >= 0 && Number.isFinite(costs.borrowPerDay) && costs.borrowPerDay >= 0 && each > 0;
  const test: TestDef | undefined = TESTS[tab - 1];
  const count = test?.values?.length ?? 1;
  const keyOf = (t: TestDef, k: number) => `${t.id}|${k}|${start}|${end}|${budget}|${spread}|${borrow}`;

  useEffect(() => {
    if (!data || !test || !inputsOk || data.lateStart.length) return;
    for (let k = 0; k < count; k++) {
      const key = keyOf(test, k);
      if (key in runs.get().by || queue.some((q) => q.key === key)) continue;
      const policy = policyOf(test, k);
      queue.push({
        key,
        start: () => backtestAsync({ dates: data.dates, prices: data.prices, rf: data.rf, start: data.dates[0], end, window: 250, initial: STOCKS.map(() => each), costs, policy }, (p) => runs.set((s) => ({ ...s, v: s.v + 1, progress: p }))),
      });
    }
    void pump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, tab, start, end, budget, spread, borrow]);

  const results = test ? Array.from({ length: count }, (_, k) => runs.get().by[keyOf(test, k)]) : [];
  const done = results.filter((r) => r !== undefined).length;
  const status = !desktop
    ? 'The back-tests run on real adjusted closes from Tiingo and the 3-month bill rate from FRED in the desktop app. The browser demo has none, and none are generated.'
    : !valid
      ? 'Choose a start date before the end date.'
      : failed.length
        ? `No prices for ${failed.map((t) => `${t}: ${(hist[t] as { message: string }).message}`).join('; ')}`
        : dtb3?.state === 'error'
          ? `No risk-free rate: ${dtb3.message}`
          : !data
            ? `Reading adjusted closes from Tiingo: ${loaded} of ${tickers.length} stocks${dtb3?.state === 'ok' ? '' : ', and the 3-month bill rate from FRED'}…`
            : data.lateStart.length
              ? `No price on the first day for ${data.lateStart.map((k) => STOCKS[k].ticker).join(', ')}: choose a later start.`
              : '';

  const label = (k: number) => (test?.varied && test.values ? `${VARIED_LABEL[test.varied]}=${test.values[k]}` : 'Hold');
  const valueChart: XYSeries[] = results.flatMap((r, k) => (r ? [{ label: label(k), color: COLORS[k % COLORS.length], points: r.value.map((v, i) => ({ x: i, y: v })) }] : []));
  const first = results.find((r): r is BacktestResult => !!r);
  const ticks = first ? first.days.map((d, i) => ({ v: i, label: d.slice(0, 7) })).filter((t, i, all) => i === 0 || (t.label !== all[i - 1].label && /-(01|07)$/.test(t.label))) : [];
  const showWeights = test?.id === 'long' || test?.id === 'dn-rav' || test?.id === 'dn-lev';
  const wRun = results[weightsOf];
  const weightChart: XYSeries[] = wRun
    ? [
        ...STOCKS.map((s, i) => ({ label: s.ticker, color: COLORS[i % COLORS.length], points: wRun.weights.map((w, d) => ({ x: d, y: w[i] })) })),
        { label: 'USDOLLAR', color: '#ffffff', points: wRun.cash.map((c, d) => ({ x: d, y: c })) },
      ]
    : [];

  const cell = (v: string, k?: number) => <td key={k} className="num">{v}</td>;
  const fixedRow = (name: string, v: string) => (
    <tr key={name}>
      <td>{name}</td>
      <td className="num" colSpan={count} style={{ textAlign: 'center' }}>{v}</td>
    </tr>
  );
  const setting = (name: string, key: Varied, v: number | undefined, fmt = (x: number) => String(x)) =>
    test?.varied === key && test.values ? (
      <tr key={name}>
        <td>{name}</td>
        {test.values.map((x, k) => cell(fmt(x), k))}
      </tr>
    ) : (
      fixedRow(name, test?.hold || v === undefined ? 'N/A' : fmt(v))
    );
  const metric = (name: string, f: (r: BacktestResult) => string) => (
    <tr key={name}>
      <td>{name}</td>
      {results.map((r, k) => cell(r ? f(r) : r === null ? 'n/a' : '…', k))}
    </tr>
  );
  const dp = test?.hold ? 3 : 2;
  const section = (title: string) => (
    <tr key={title}>
      <th colSpan={count + 1} style={{ textAlign: 'center' }}>{title}</th>
    </tr>
  );
  const csv = (): (string | number)[][] =>
    test && first
      ? [['Day', ...results.map((_, k) => label(k))], ...first.days.map((d, i) => [d, ...results.map((r) => r?.value[i] ?? '')])]
      : [['No results']];

  return (
    <div>
      <FnHeader
        code="MPC"
        title="MPC Portfolio Back-test"
        sub={
          <>
            <RealBadge /> Adjusted daily closes from Tiingo, the 3-month Treasury bill rate (DTB3) from FRED. Forecasts use only the 250 daily returns before each close; trades at the close; costs and interest by calendar day.
          </>
        }
        tabs={TABS}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `MPC_${test?.id ?? 'data'}.csv`, csv)}
        controls={
          <div className="chart-tools" style={{ flexWrap: 'wrap' }}>
            <label className="fld">
              Start
              <input className="inp" type="date" aria-label="Start date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="fld">
              End
              <input className="inp" type="date" aria-label="End date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <label className="fld">
              Budget ($)
              <input className="inp" style={{ width: 90 }} aria-label="Initial portfolio budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label className="fld">
              Half spread (%)
              <input className="inp" style={{ width: 60 }} aria-label="Bid/ask half spread, percent" inputMode="decimal" value={spread} onChange={(e) => setSpread(e.target.value)} />
            </label>
            <label className="fld">
              Borrow (% a day)
              <input className="inp" style={{ width: 60 }} aria-label="Borrow costs, percent a day" inputMode="decimal" value={borrow} onChange={(e) => setBorrow(e.target.value)} />
            </label>
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : !test && data ? (
        <table className="tbl" aria-label="Stocks">
          <thead>
            <tr>
              <th>Company</th>
              <th>Ticker</th>
              <th>Tiingo</th>
              <th className="num">First price</th>
              <th className="num">Last price</th>
              <th className="num">Days carried</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {STOCKS.map((s, k) => {
              const bars = (hist[tickers[k]] as { bars: { date: string }[] }).bars;
              return (
                <tr key={s.ticker}>
                  <td>{s.name}</td>
                  <td>{s.ticker}</td>
                  <td>{tickers[k]}</td>
                  <td className="num">{bars[0]?.date}</td>
                  <td className="num">{bars.at(-1)?.date}</td>
                  <td className="num">{data.filled[k]}</td>
                  <td>{s.note ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : test && data ? (
        <>
          {runs.get().running?.startsWith(`${test.id}|`) || done < count ? (
            <div className="note" role="status">{`Running ${done + 1} of ${count}: ${Math.round(runs.get().progress * 100)}%…`}</div>
          ) : null}
          <table className="tbl" style={{ width: 'auto', minWidth: 560 }} aria-label="Back-test inputs and results">
            <thead>
              <tr>
                <th colSpan={count + 1} style={{ textAlign: 'center' }}>{`Investment Policy: ${test.hold ? 'HOLD' : 'MPC'}`}</th>
              </tr>
            </thead>
            <tbody>
              {section('Data Inputs')}
              {fixedRow('Start date', longDate(start))}
              {fixedRow('End date', longDate(end))}
              {fixedRow('Historical data (days)', test.hold ? 'N/A' : '250')}
              {setting('Forecast horizon (days)', 'horizon', test.fixed.horizon)}
              {fixedRow('Initial portfolio budget ($)', group(Number(budget)))}
              {section('Aversion Parameters')}
              {setting('Risk Aversion', 'riskAversion', test.fixed.riskAversion)}
              {setting('Trading Aversion', 'tradingAversion', test.fixed.tradingAversion)}
              {setting('Holding Aversion', 'holdingAversion', test.fixed.holdingAversion)}
              {section('Cost Parameters')}
              {fixedRow('Bid/ask half spread (%)', test.hold ? 'N/A' : spread)}
              {fixedRow('Borrow costs (%)', test.hold ? 'N/A' : borrow)}
              {section('General constraints')}
              {test.fixed.longOnly ? fixedRow('Long Only portfolio', '') : null}
              {test.fixed.dollarNeutral ? fixedRow('Dollar Neutral portfolio', '') : null}
              {test.fixed.longOnly ? null : setting('Leverage limit', 'leverage', test.fixed.leverage)}
              {section('Results')}
              {metric('Annual Expected Portfolio Return (%)', (r) => r.metrics.annualReturn.toFixed(dp))}
              {metric('Annual Excess Return (%)', (r) => r.metrics.annualExcessReturn.toFixed(dp))}
              {metric('Annual Excess Risk (%)', (r) => r.metrics.annualExcessRisk.toFixed(dp))}
              {metric('Sharpe ratio', (r) => r.metrics.sharpe.toFixed(test.hold ? 3 : 2))}
              {metric('Maximum Drawdown (%)', (r) => r.metrics.maxDrawdown.toFixed(dp))}
              {metric('Annual Portfolio Turnover (%)', (r) => (test.hold ? `${r.metrics.annualTurnover.toFixed(0)}%` : turnoverText(r.metrics.annualTurnover)))}
            </tbody>
          </table>
          <div className="note">{`${test.title} (${test.table} in the dissertation.) Back-test from ${first ? longDate(first.days[0]) : '…'}: the first close with 250 daily returns before it.`}</div>
          {valueChart.length > 0 && (
            <div style={{ maxWidth: 1200 }}>
              <div style={{ textAlign: 'center', fontWeight: 600 }}>Portfolio value over time</div>
              <XYChart series={valueChart} xTicks={ticks} yFormat={(v) => group(v)} height={300} legend />
              <div style={{ textAlign: 'center' }}>Time · Portfolio value ($)</div>
            </div>
          )}
          {showWeights && (
            <div style={{ maxWidth: 1200 }}>
              <div className="chart-tools">
                <label className="fld">
                  Weights of
                  <select className="sel-inp" aria-label="Weights of" value={weightsOf} onChange={(e) => setWeightsOf(Number(e.target.value))}>
                    {(test.values ?? []).map((_, k) => (
                      <option key={k} value={k}>{label(k)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ textAlign: 'center', fontWeight: 600 }}>Portfolio weights over time</div>
              {weightChart.length ? <XYChart series={weightChart} xTicks={ticks} yFormat={(v) => v.toFixed(1)} height={300} legend /> : <div className="empty">Waiting for this run.</div>}
            </div>
          )}
          <div className="note">
            Returns are the change in value each day; excess returns subtract the bill rate (DTB3, actual/360 by calendar day). Annual figures count 250 days a year; excess risk is the standard deviation of daily excess returns × √250, and the Sharpe ratio their ratio. The dissertation&apos;s Hold results are close to these; its MPC results most likely read forecasts ahead of time (its notebook gives the policy a forecast table by date, which is read at the future dates of the horizon), so they are not targets for these.
          </div>
        </>
      ) : null}
    </div>
  );
}
