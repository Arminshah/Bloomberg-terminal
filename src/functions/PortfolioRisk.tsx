import { useMemo, useState } from 'react';
import { XYChart } from '../components/chart/XYChart';
import { Chg, KV, SecLink, Section } from '../components/cells';
import { downloadText, toCsv } from '../core/csv';
import { fmtDay, fmtNum, fmtPct } from '../core/format';
import { engine, useHistoryVersion, useTick } from '../data/market';
import { benchmarkLevels, portfolioSnapshot } from '../data/portfolio-history';
import { resolveSecurity, CLASS_LABEL } from '../data/registry';
import { historicalRisk, benchmarkRisk, portfolioValue, positionShock, type RiskPosition } from '../finance/portfolio-risk';
import { inputNumber } from '../finance/contracts';
import { portfolio } from '../terminal/userdata';

const PERIODS = [{ label: '3M · 63', n: 63 }, { label: '6M · 126', n: 126 }, { label: '1Y · 252', n: 252 }, { label: '3Y · 756', n: 756 }];
const EMPTY_POSITIONS: RiskPosition[] = [];

function useSnapshot(observations: number) {
  const st = portfolio.use((s) => s);
  const tick = useTick(15);
  const historyVersion = useHistoryVersion();
  // The engine mutates outside React. Its revision/tick counters invalidate cached snapshots.
  const snapshot = useMemo(() => portfolioSnapshot(st.positions, st.cash, observations), [st.positions, st.cash, observations, tick, historyVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  return { st, snapshot };
}

function BenchmarkPicker() {
  const st = portfolio.use((s) => s);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const d = resolveSecurity(text);
    if (!d || d.quote !== 'price') { setError('Choose a security with a price history, such as SPX, SPY or AAPL.'); return; }
    portfolio.set((s) => ({ ...s, benchmark: d.id }));
    setText('');
    setError('');
  };
  return <>
    <span className="muted">Benchmark: {engine.get(st.benchmark)?.ticker ?? st.benchmark} (USD price return)</span>
    <input className="inp" aria-label="Portfolio benchmark" placeholder="Benchmark ticker" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
    <button type="button" className="btn" onClick={save}>Set benchmark</button>
    {error && <span className="amber" role="status">{error}</span>}
  </>;
}

function MethodNote() {
  return <div className="note">Today’s quantities and USD cash, with no trades, deposits, interest or dividend cash flows replayed. Historical FX is required for every foreign holding. Only shared dates before today’s UTC date are used; missing prices are never carried forward. Price returns can reflect splits, generic futures rolls and source adjustment conventions. This is a hypothetical replay, not your realised performance.</div>;
}

export function PortfolioPerformance() {
  const [observations, setObservations] = useState(252);
  const { st, snapshot } = useSnapshot(observations);
  const result = snapshot.ok ? snapshot.value.history : snapshot;
  const history = result.ok ? result.value : null;
  const bench = snapshot.ok ? new Map(benchmarkLevels(st.benchmark, snapshot.value.cutoff).map((r) => [r.date, r.value])) : new Map<number, number>();
  // Comparison is rebased on one shared date, never each line's own first date.
  const common = history?.dates.map((date, i) => ({ date, nav: history.nav[i], bench: bench.get(date) })).filter((r): r is { date: number; nav: number; bench: number } => r.bench !== undefined) ?? [];
  const positive = history?.nav.every((n) => n > 0) ?? false;
  const base = common[0];
  const last = common.at(-1);
  const rows = () => [
    ['Method', 'Fixed quantities and cash replay; historical FX; no dividend cash flows or trading'],
    ['Benchmark', st.benchmark], ['Omitted incomplete session dates', history?.omittedDates ?? ''],
    ['Session date', 'Hypothetical NAV USD', 'Benchmark USD level'],
    ...(history?.dates.map((date, i) => [new Date(date).toISOString().slice(0, 10), history.nav[i], bench.get(date)]) ?? []),
  ];
  return <>
    <div className="chart-tools">
      <label className="fld">Observations<select className="sel-inp" aria-label="Performance lookback" value={observations} onChange={(e) => setObservations(Number(e.target.value))}>{PERIODS.map((p) => <option key={p.n} value={p.n}>{p.label}</option>)}</select></label>
      <BenchmarkPicker />
      <button type="button" className="btn" disabled={!history} onClick={() => downloadText('portfolio-history.csv', toCsv(rows()))}>Export history CSV</button>
    </div>
    {!result.ok && <div className="pad amber" role="status">{result.error}</div>}
    {history && <>
      <div className="cols">
        <Section title="Fixed holdings replay (USD)"><KV items={[
          ['First / last session', `${fmtDay(history.dates[0])} / ${fmtDay(history.dates.at(-1)!)}`],
          ['Shared history levels', history.dates.length],
          ['First / last NAV', `${fmtNum(history.nav[0], 2)} / ${fmtNum(history.nav.at(-1)!, 2)}`],
          ['Change in replay NAV', <Chg key="pnl" v={history.nav.at(-1)! - history.nav[0]} dec={2} />],
          ['Replay return', positive ? fmtPct((history.nav.at(-1)! / history.nav[0] - 1) * 100, 2) : '-- (NAV crosses or reaches zero)'],
          ['Benchmark comparison levels', common.length],
          ['Benchmark matched return', base && last ? fmtPct((last.bench / base.bench - 1) * 100, 2) : '--'],
        ]} /></Section>
        <Section title="Historical NAV"><XYChart height={240} series={[{ label: 'Fixed holdings NAV USD', color: '#ffb547', points: history.dates.map((x, i) => ({ x, y: history.nav[i] })) }]} xFormat={fmtDay} yFormat={(n) => fmtNum(n, 0)} /></Section>
      </div>
      {base && common.length > 1 && common.every((r) => r.nav > 0) ? <Section title="Portfolio and benchmark · same dates, same rebasing"><XYChart height={260} series={[
        { label: 'Fixed holdings price return %', color: '#ffb547', points: common.map((r) => ({ x: r.date, y: (r.nav / base.nav - 1) * 100 })) },
        { label: `${engine.get(st.benchmark)?.ticker ?? st.benchmark} USD price return %`, color: '#45d3e6', points: common.map((r) => ({ x: r.date, y: (r.bench / base.bench - 1) * 100 })) },
      ]} xFormat={fmtDay} yFormat={(n) => `${fmtNum(n, 1)}%`} /></Section> : <div className="note amber">A rebased benchmark comparison needs at least two shared benchmark dates and positive portfolio NAVs.</div>}
      {history.omittedDates > 0 && <div className="note amber">{history.omittedDates} session dates lacked a price or FX observation for at least one holding. Risk calculations also exclude intervals that bridge those missing sessions.</div>}
    </>}
    <MethodNote />
  </>;
}

export function PortfolioRisk() {
  const [observations, setObservations] = useState(252);
  const [confidence, setConfidence] = useState(0.95);
  const [horizon, setHorizon] = useState(1);
  const [annualSessions, setAnnualSessions] = useState(252);
  const [shocks, setShocks] = useState<Record<string, { price: string; fx: string }>>({});
  const [group, setGroup] = useState('class');
  const { st, snapshot } = useSnapshot(observations);
  const positions = snapshot.ok ? snapshot.value.positions : EMPTY_POSITIONS;
  const history = snapshot.ok && snapshot.value.history.ok ? snapshot.value.history.value : null;
  const analysis = useMemo(() => history ? historicalRisk(positions, st.cash, history, confidence, horizon, annualSessions) : null, [positions, st.cash, history, confidence, horizon, annualSessions]);
  const risk = analysis?.ok ? analysis.value : null;
  const currentNav = snapshot.ok && positions.length ? portfolioValue(positions, st.cash) : NaN;
  const benchmark = risk && snapshot.ok ? benchmarkRisk(risk.dailyDates, risk.dailyPnl, risk.nav, benchmarkLevels(st.benchmark, snapshot.value.cutoff), snapshot.value.cutoff, annualSessions) : null;
  const issue = !snapshot.ok ? snapshot.error : !snapshot.value.history.ok ? snapshot.value.history.error : analysis && !analysis.ok ? analysis.error : '';
  const stress = positions.map((p) => {
    const input = shocks[p.id] ?? { price: '0', fx: '0' };
    return { p, ...input, pnl: positionShock(p, inputNumber(input.price) / 100, inputNumber(input.fx) / 100) };
  });
  const stressPnl = stress.length && stress.every((r) => Number.isFinite(r.pnl)) ? stress.reduce((sum, r) => sum + r.pnl, 0) : NaN;
  const setShock = (id: string, key: 'price' | 'fx', value: string) => setShocks((s) => ({ ...s, [id]: { ...(s[id] ?? { price: '0', fx: '0' }), [key]: value } }));
  const exposures = positions.map((p) => ({ p, exposure: p.quantity * p.price * p.fx * p.multiplier }));
  const gross = exposures.reduce((sum, r) => sum + Math.abs(r.exposure), 0);
  const groups = new Map<string, number>();
  for (const { p, exposure } of exposures) {
    const d = engine.get(p.id)!;
    const key = group === 'sector' ? d.eq?.sector ?? 'Other' : group === 'region' ? d.region : CLASS_LABEL[d.cls];
    groups.set(key, (groups.get(key) ?? 0) + Math.abs(exposure));
  }
  const worst = risk?.scenarioPnl.map((pnl, i) => ({ pnl, ...risk.scenarioDates[i] })).sort((a, b) => a.pnl - b.pnl).slice(0, 10) ?? [];
  const rows = () => [
    ['Method', 'Historical simulation of current fixed quantities; exact session dates and historical FX; signed losses'],
    ['Benchmark', st.benchmark], ['Confidence', confidence], ['Horizon shared intervals', horizon], ['Annualisation intervals', annualSessions],
    ['History start', history ? new Date(history.dates[0]).toISOString().slice(0, 10) : ''], ['History end', history ? new Date(history.dates.at(-1)!).toISOString().slice(0, 10) : ''],
    ['Scenarios', risk?.scenarioPnl.length], ['Tail observation mass', risk?.tail.tailMass], ['Cash USD', st.cash], ['Current NAV USD', currentNav],
    ['Historical VaR USD', risk?.tail.valueAtRisk], ['Historical expected shortfall USD', risk?.tail.expectedShortfall], ['Annual volatility USD', risk?.annualVolatilityUsd],
    ['Security', 'Quantity', 'Cost', 'Multiplier incl minor units', 'Margined', 'Current price', 'USD per currency unit', 'Price provider', 'Quote time', 'FX source ID', 'FX provider', 'FX quote time', 'Exposure USD', 'Annual volatility contribution USD', 'Expected shortfall contribution USD', 'Stress price %', 'Stress FX %', 'Stress P&L USD'],
    ...positions.map((p, i) => [p.id, p.quantity, p.cost, p.multiplier, String(p.margined), p.price, p.fx, engine.quote(p.id)?.provider ?? engine.quote(p.id)?.src ?? '', Number.isFinite(engine.quote(p.id)?.time) ? new Date(engine.quote(p.id)!.time).toISOString() : '', p.fxId ?? 'USD', p.fxId ? engine.quote(p.fxId)?.provider ?? engine.quote(p.fxId)?.src ?? '' : '', p.fxId && Number.isFinite(engine.quote(p.fxId)?.time) ? new Date(engine.quote(p.fxId)!.time).toISOString() : '', risk?.contributions[i].exposure, risk?.contributions[i].volatilityUsd, risk?.contributions[i].expectedShortfall, stress[i].price, stress[i].fx, stress[i].pnl]),
    ['Historical session', 'Replay NAV USD', ...positions.flatMap((p) => [`${p.id} local price`, `${p.id} USD per currency unit`])],
    ...(history?.dates.map((date, i) => [new Date(date).toISOString().slice(0, 10), history.nav[i], ...positions.flatMap((_, j) => [history.prices[j][i], history.fx[j][i]])]) ?? []),
    ['Scenario start', 'Scenario end', 'Historical shock P&L USD'],
    ...(risk?.scenarioDates.map((d, i) => [new Date(d.start).toISOString().slice(0, 10), new Date(d.end).toISOString().slice(0, 10), risk.scenarioPnl[i]]) ?? []),
  ];
  return <>
    <div className="chart-tools">
      <label className="fld">Lookback<select className="sel-inp" aria-label="Risk lookback" value={observations} onChange={(e) => setObservations(Number(e.target.value))}>{PERIODS.map((p) => <option key={p.n} value={p.n}>{p.label}</option>)}</select></label>
      <label className="fld">Confidence<select className="sel-inp" aria-label="Risk confidence" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))}>{[0.95, 0.975, 0.99].map((c) => <option key={c} value={c}>{c * 100}%</option>)}</select></label>
      <label className="fld">Horizon<select className="sel-inp" aria-label="Risk horizon" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>{[1, 5, 10, 20].map((n) => <option key={n} value={n}>{n} shared interval{n === 1 ? '' : 's'}</option>)}</select></label>
      <label className="fld">Annualisation<select className="sel-inp" aria-label="Risk annualisation" value={annualSessions} onChange={(e) => setAnnualSessions(Number(e.target.value))}><option value={252}>252 sessions</option><option value={365}>365 days</option></select></label>
      <BenchmarkPicker />
      <button type="button" className="btn" disabled={!risk} onClick={() => downloadText('portfolio-risk.csv', toCsv(rows()))}>Export risk CSV</button>
    </div>
    {issue && <div className="pad amber" role="status">{issue}</div>}
    {risk && history && <>
      <div className="cols">
        <Section title="Historical risk · signed loss in USD"><KV items={[
          ['Current marked NAV', <span key="nav" data-testid="risk-nav">{fmtNum(risk.nav, 2)}</span>],
          ['Gross / net notional', `${fmtNum(risk.grossExposure, 0)} / ${fmtNum(risk.netExposure, 0)}`],
          ['Gross leverage / NAV', risk.nav > 0 ? `${fmtNum(risk.grossExposure / risk.nav, 2)}×` : '-- (nonpositive NAV)'],
          ['Annualised volatility', `${fmtPct(risk.annualVolatility * 100, 2, false)} / ${fmtNum(risk.annualVolatilityUsd, 2)} USD`],
          [`VaR ${confidence * 100}%`, <span key="var" data-testid="risk-var">{fmtNum(risk.tail.valueAtRisk, 2)}</span>],
          [`Expected shortfall ${confidence * 100}%`, <span key="es" data-testid="risk-es">{fmtNum(risk.tail.expectedShortfall, 2)}</span>],
          ['Worst / best historical shock P&L', `${fmtNum(risk.worst, 2)} / ${fmtNum(risk.best, 2)}`],
          ['Max drawdown of replay NAV', fmtPct(risk.drawdown * 100, 2)],
          ['Shared historical scenarios', <span key="n" data-testid="risk-samples">{risk.scenarioPnl.length}</span>],
          ['Expected shortfall tail mass', `${fmtNum(risk.tail.tailMass, 2)} observations`],
        ]} /></Section>
        <Section title="Benchmark risk · matched interval returns"><KV items={[
          ['Benchmark', engine.get(st.benchmark)?.ticker ?? st.benchmark],
          ['Matched observations', benchmark?.dates.length ?? 0],
          ['Beta', fmtNum(benchmark?.regression.beta, 4)],
          ['Correlation / R²', `${fmtNum(benchmark?.regression.corr, 4)} / ${fmtNum(benchmark?.regression.r2, 4)}`],
          ['Annualised tracking error', fmtPct((benchmark?.trackingError ?? NaN) * 100, 2, false)],
          ['Information ratio', fmtNum(benchmark?.informationRatio, 4)],
        ]} /><div className="note">Portfolio historical shock P&L / current NAV versus benchmark USD price returns. Same start and end dates; at least 20 matches. Ratios require positive NAV and nonzero denominator variance.</div></Section>
      </div>
      <div className="note">{fmtDay(history.dates[0])}–{fmtDay(history.dates.at(-1)!)} · {risk.dailyPnl.length} one-interval observations · {history.omittedDates} incomplete dates omitted. Multi-interval shocks use overlapping observed windows and full repricing, without square-root scaling. Annual volatility assumes {annualSessions} comparable intervals per year. Negative VaR/ES means gains at that quantile/tail. These are historical estimates, not loss limits.</div>
      {risk.tail.tailMass < 5 && <div className="note amber">The expected shortfall tail contains less than five observations ({fmtNum(risk.tail.tailMass, 2)}). Extreme-tail estimates are sensitive to this small sample; overlapping horizons also share data.</div>}
      <Section title="Position risk contributions" right="signed · hedges may contribute negatively">
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Security</th><th className="num">Exposure USD</th><th className="num">Annual vol contribution USD</th><th className="num">Vol contribution %</th><th className="num">ES contribution USD</th></tr></thead><tbody>
          {risk.contributions.map((r) => <tr key={r.id}><td><SecLink id={r.id}>{engine.get(r.id)?.ticker ?? r.id}</SecLink></td><td className="num">{fmtNum(r.exposure, 2)}</td><td className="num">{fmtNum(r.volatilityUsd, 2)}</td><td className="num">{fmtNum(r.volatilityShare * 100, 2)}</td><td className="num">{fmtNum(r.expectedShortfall, 2)}</td></tr>)}
        </tbody></table></div>
        <div className="note">Volatility contributions use sample covariance with total portfolio P&L and sum to annual dollar volatility. ES contributions share the portfolio’s worst-tail weights, including tied-boundary scenarios, and sum to portfolio ES.</div>
      </Section>
      <Section title="Worst historical scenarios"><table className="tbl"><thead><tr><th>Start</th><th>End</th><th className="num">Repriced P&L USD</th></tr></thead><tbody>{worst.map((r) => <tr key={r.end}><td>{fmtDay(r.start)}</td><td>{fmtDay(r.end)}</td><td className="num"><Chg v={r.pnl} dec={2} /></td></tr>)}</tbody></table></Section>
    </>}
    <Section title="Custom stress test" right="instant local price and USD-per-currency moves">
      <div className="pad-s row" style={{ gap: 8 }}><button type="button" className="btn" onClick={() => setShocks(Object.fromEntries(positions.map((p) => [p.id, { price: '-10', fx: '0' }])))}>All prices −10%</button><button type="button" className="btn" onClick={() => setShocks({})}>Reset shocks</button></div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Security</th><th className="num">Local price move %</th><th className="num">FX move %</th><th className="num">P&L USD</th></tr></thead><tbody>{stress.map((r) => <tr key={r.p.id}><td>{engine.get(r.p.id)?.ticker ?? r.p.id}</td>
        <td className="num"><input className="inp" style={{ width: 95, textAlign: 'right' }} aria-label={`Price shock ${r.p.id}`} value={r.price} inputMode="decimal" onChange={(e) => setShock(r.p.id, 'price', e.target.value)} /></td>
        <td className="num">{r.p.fxHistory ? <input className="inp" style={{ width: 95, textAlign: 'right' }} aria-label={`FX shock ${r.p.id}`} value={r.fx} inputMode="decimal" onChange={(e) => setShock(r.p.id, 'fx', e.target.value)} /> : 'USD · 0%'}</td><td className="num">{fmtNum(r.pnl, 2)}</td></tr>)}</tbody></table></div>
      <div className="pad-s"><strong>Stress P&L USD: <span data-testid="stress-pnl">{fmtNum(stressPnl, 2)}</span></strong> · Stressed NAV: <span data-testid="stress-nav">{fmtNum(currentNav + stressPnl, 2)}</span></div>
      {stress.some((r) => !Number.isFinite(r.pnl)) && <div className="note amber" role="status">Enter a price move of at least −100%, an FX move greater than −100%, and wait for valid current marks for every position.</div>}
      <div className="note">Linear price exposures are fully repriced. Futures contribute unrealised P&L to NAV and full contract notional to risk; FX changes also revalue that unrealised amount. Cash stays unchanged. Options, yield-only series, financing, margin calls and transaction costs are outside this calculation.</div>
    </Section>
    <Section title="Exposure allocation · share of gross absolute notional" right={<select className="sel-inp" aria-label="Exposure grouping" value={group} onChange={(e) => setGroup(e.target.value)}><option value="class">Asset class</option><option value="sector">Sector</option><option value="region">Region</option></select>}><table className="tbl"><tbody>{[...groups.entries()].sort((a, b) => b[1] - a[1]).map(([key, value]) => <tr key={key}><td>{key}</td><td className="num">{fmtNum(value, 2)} USD</td><td className="num">{fmtNum(gross > 0 ? value / gross * 100 : NaN, 2)}%</td></tr>)}</tbody></table></Section>
    <Section title="Current marks and history coverage"><div className="tbl-wrap"><table className="tbl"><thead><tr><th>Security</th><th>Price source / state</th><th>Quote time</th><th>FX source / state</th><th className="num">Prior-date price bars</th><th className="num">Prior-date FX bars</th></tr></thead><tbody>{positions.map((p) => { const q = engine.quote(p.id); const fx = p.fxId ? engine.quote(p.fxId) : undefined; return <tr key={p.id}><td>{engine.get(p.id)?.ticker ?? p.id}</td><td>{q?.provider ?? q?.src ?? 'Unavailable'} · {q?.src}</td><td>{q && Number.isFinite(q.time) ? new Date(q.time).toLocaleString() : '--'}</td><td>{p.fxId ? `${p.fxId} · ${fx?.provider ?? fx?.src ?? 'Unavailable'} · ${fx?.src ?? ''}` : 'USD'}</td><td className="num">{p.prices.length}</td><td className="num">{p.fxHistory?.length ?? 'USD'}</td></tr>; })}</tbody></table></div></Section>
    <MethodNote />
  </>;
}
