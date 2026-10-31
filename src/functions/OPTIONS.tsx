import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcSource } from '../components/CalcInputs';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { dividendYield, equityExpiryTimestamp, expiries, expiryLabel, riskFreeRate, strikeStep } from '../data/options';
import { blackScholes, impliedVol, type OptType } from '../finance/options';
import { inputNumber } from '../finance/contracts';
import type { FnProps } from '../terminal/types';
import { rangeStats } from '../data/analytics';
import { americanImpliedVol, americanOption, americanPrice } from '../finance/american-options';
import { exportActions } from '../components/ExportActions';
import { usePanelId } from '../terminal/panel';

export { OptionMonitor as OMON } from './OptionMonitor';

export function OVME(props: FnProps) {
  return <OptionCalculator key={`${props.sec?.id}|${props.route.args ?? ''}`} {...props} />;
}

function OptionCalculator({ sec, route }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  useTick(15);
  const parts = (route.args ?? '').split(/\s+/);
  // Friday expiry dates (weeklies, third-Friday monthlies, January long-dated): a calendar, not a list of
  // listed contracts, which needs option data the app does not have.
  const exps = expiries(engine.now());
  const spotLive = engine.quote(s.id)!.last;
  const [type, setType] = useState<OptType>(parts[0] === 'P' ? 'P' : 'C');
  const [strikeText, setStrike] = useState(parts[1] ?? '');
  const [expiry, setExpiry] = useState(() => {
    const p = parts[2] ? equityExpiryTimestamp(parts[2]) : NaN;
    return Number.isFinite(p) ? p : exps[Math.min(3, exps.length - 1)];
  });
  const [spotOverride, setSpotOverride] = useState('');
  const [exercise, setExercise] = useState('E');
  const [steps, setSteps] = useState(400);
  const [daysOverride, setDaysOverride] = useState('');
  // A fourth argument is a volatility you give, in percent.
  const [volOverride, setVolOverride] = useState(parts[3] ?? '');
  const spot = spotOverride.trim() ? inputNumber(spotOverride) : spotLive;
  const strike = strikeText.trim() ? inputNumber(strikeText) : Math.round(spot / strikeStep(spot)) * strikeStep(spot);
  // A rate you type replaces the published one, which some currencies lack.
  const [rateOverride, setRateOverride] = useState('');
  const [dividendOverride, setDividendOverride] = useState('');
  const [multiplier, setMultiplier] = useState('100');
  const [solve, setSolve] = useState('value');
  const [premium, setPremium] = useState('');
  // Time to expiry is taken when an input changes, and at least once a minute: exact when you price, without
  // recomputing the lattice and its scenario grids on every render.
  const minute = Math.floor(engine.now() / 60_000);
  const pricedAt = useMemo(() => engine.now(), [minute, spot, strikeText, expiry, daysOverride, rateOverride, dividendOverride, volOverride, premium, solve, exercise, steps, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = daysOverride.trim() ? inputNumber(daysOverride) / 365 : Math.max((expiry - pricedAt) / (365 * DAY_MS), 0);
  const published = riskFreeRate(s);
  const typedRate = rateOverride.trim() !== '';
  const r = typedRate ? inputNumber(rateOverride) / 100 : published.r;
  const rateName = typedRate ? 'your input' : published.name;
  // On real data an unknown dividend yield counts as zero (and says so). The default volatility is the
  // 30-day realised volatility of the price history: a reference, independent of the indicative monitor.
  const qSource = dividendYield(s);
  const q = dividendOverride.trim() ? inputNumber(dividendOverride) / 100 : engine.realOnly && !Number.isFinite(qSource) ? 0 : qSource;
  const fwd = spot * Math.exp((r - q) * t);
  const realised = rangeStats(s.id).vol30;
  const volDefault = realised / 100;
  const model = exercise === 'A' ? 'American Tian binomial' : 'European Black-Scholes-Merton';
  const volSource = solve === 'iv' ? `implied from your premium (${exercise === 'A' ? 'American' : 'European'} model)` : volOverride.trim() ? 'your input' : '30D realised (not implied)';
  const vol = useMemo(() => solve === 'iv' ? exercise === 'A' ? americanImpliedVol(type, inputNumber(premium), spot, strike, t, r, q, steps) : impliedVol(type, inputNumber(premium), spot, strike, t, r, q) : volOverride.trim() ? inputNumber(volOverride) / 100 : volDefault, [solve, exercise, type, premium, spot, strike, t, r, q, steps, volOverride, volDefault]);
  const american = useMemo(() => exercise === 'A' ? americanOption(type, spot, strike, t, r, q, vol, steps) : null, [exercise, type, spot, strike, t, r, q, vol, steps]);
  const g = american ?? blackScholes(type, spot, strike, t, r, q, vol);
  const contract = inputNumber(multiplier);
  const error = !Number.isFinite(spot) || spot <= 0 ? 'Enter a positive spot or wait for a source price.'
    : !Number.isFinite(strike) || strike <= 0 ? 'Enter a positive strike.'
    : !Number.isFinite(t) || t < 0 || t > 100 ? 'Enter a tenor from 0 to 36,500 calendar days.'
    : !Number.isFinite(r) || !Number.isFinite(q) ? 'Enter finite rate and dividend yield inputs.'
    : !Number.isFinite(vol) || vol < 0 ? solve === 'iv' ? exercise === 'A' ? 'No unique finite American implied volatility: check the premium and unexpired tenor. Premiums at the zero-volatility exercise floor may support several volatilities; values outside the model bounds are rejected.' : 'Enter a premium within European no-arbitrage bounds and choose an unexpired date. No finite implied volatility exists for this input.' : 'Enter a nonnegative volatility or wait for realised volatility.'
    : !Number.isFinite(contract) || contract <= 0 ? 'Enter a positive contract multiplier.'
    : !Number.isFinite(g.price) || !Number.isFinite(g.price * contract) ? 'These inputs exceed the calculator’s numerical range.' : '';
  const scenarioValues = useMemo(() => {
    const price = (sp: number) => exercise === 'A' ? americanPrice(type, sp, strike, t, r, q, vol, steps) : blackScholes(type, sp, strike, t, r, q, vol).price;
    return Array.from({ length: 41 }, (_, i) => { const sp = spot * (0.7 + i * 0.015); return { x: sp, value: price(sp), payoff: type === 'C' ? Math.max(0, sp - strike) : Math.max(0, strike - sp) }; });
  }, [exercise, type, spot, strike, t, r, q, vol, steps]);
  const scen = useMemo(() => [-20, -10, -5, -2, 0, 2, 5, 10, 20].map((pct) => {
    const sp = spot * (1 + pct / 100);
    const v = exercise === 'A' ? americanPrice(type, sp, strike, t, r, q, vol, steps) : blackScholes(type, sp, strike, t, r, q, vol).price;
    const payoff = type === 'C' ? Math.max(0, sp - strike) : Math.max(0, strike - sp);
    return { pct, sp, v, payoff };
  }), [exercise, type, spot, strike, t, r, q, vol, steps]);
  const curve = scenarioValues.map((p) => ({ x: p.x, y: p.value - g.price }));
  const atExp = scenarioValues.map((p) => ({ x: p.x, y: p.payoff - g.price }));
  const csv = () => [
    ['Model', model], ['Convention', 'Flat continuous rate/dividend yield; ACT/365F; no discrete cash dividends'], ['Calculation time UTC', new Date(engine.now()).toISOString()],
    ['Security', s.id], ['Type', type], ['Spot', spot], ['Spot source', spotOverride.trim() ? 'Your input' : engine.quote(s.id)?.provider ?? engine.quote(s.id)?.src],
    ['Strike', strike], ['Tenor calendar days', t * 365], ['Tenor source', daysOverride.trim() ? 'Your input' : 'Friday calendar at 16:00 New York; not a verified listed expiry'],
    ['Continuous rate %', r * 100], ['Rate source', rateName], ['Continuous dividend yield %', q * 100], ['Volatility %', vol * 100], ['Volatility source', volSource], ['Multiplier', contract],
    ['Lattice steps (American)', exercise === 'A' ? `${steps} and ${steps + 1}` : ''], ['Theoretical value per share', g.price], ['Value per contract', g.price * contract],
    ['Delta', g.delta], ['Gamma', g.gamma], ['Vega per vol point', g.vega], ['Theta per day', g.theta], ['Rho per rate percentage point', g.rho],
    ['American finite bump conventions', exercise === 'A' ? `Spot +/-${american?.spotBumpPercent}%; volatility +/-0.1pt (smaller near zero); rate +/-1bp; theta one-day roll (smaller near expiry); BSM terminal smoothing` : ''],
    ['European reference value', american?.europeanPrice], ['Early exercise premium', american?.earlyExercisePremium], ['Grid change vs half steps (not an error bound)', american?.gridDifference],
    ['Spot move %', 'Scenario spot', 'Theoretical value per share', 'P&L per contract', 'Intrinsic at expiry'], ...scen.map((p) => [p.pct, p.sp, p.v, (p.v - g.price) * contract, p.payoff]),
  ];
  const numInput = (value: string, set: (v: string) => void, label: string, ph: string) => (
    <input className="inp" style={{ width: 96, textAlign: 'right' }} aria-label={label} placeholder={ph} value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" />
  );
  return (
    <div>
      <FnHeader code="OPTIONCALC" title="Option Valuation" sec={s} sub={`${model} · continuous rate and dividend yield`} actions={exportActions(panel, 'option-calculation.csv', csv)} />
      <CalcSource>Source inputs or your overrides. Choose European or American exercise; confirm the tenor and multiplier. Flat continuous rates, dividend yield and volatility. No discrete cash dividend schedule or executable option quote.</CalcSource>
      {engine.realOnly && !Number.isFinite(r) && (
        <div className="note amber">There is {rateName} (the central bank has no free daily source here), so the option is valued only once you enter a rate.</div>
      )}
      <div className="chart-tools" style={{ gap: '6px 14px' }}>
        <label className="fld">Exercise<select className="sel-inp" aria-label="Option exercise style" value={exercise} onChange={(e) => setExercise(e.target.value)}><option value="E">European · BSM</option><option value="A">American · binomial</option></select></label>
        {exercise === 'A' && <label className="fld">Lattice<select className="sel-inp" aria-label="American lattice steps" value={steps} onChange={(e) => setSteps(Number(e.target.value))}>{[200, 400, 800, 1600].map((n) => <option key={n} value={n}>{n} / {n + 1} steps</option>)}</select></label>}
        <label className="fld">Solve<select className="sel-inp" aria-label="Option solve mode" value={solve} onChange={(e) => setSolve(e.target.value)}><option value="value">Value from volatility</option><option value="iv">Volatility from premium</option></select></label>
        <span className="seg" role="group" aria-label="Option type">
          {(['C', 'P'] as OptType[]).map((x) => (
            <button key={x} type="button" className={type === x ? 'on' : ''} onClick={() => setType(x)}>
              {x === 'C' ? 'Call' : 'Put'}
            </button>
          ))}
        </span>
        <label className="fld">
          Strike
          <input className="inp" style={{ width: 90, textAlign: 'right' }} aria-label="Strike" placeholder={fmtNum(strike, s.dec)} value={strikeText} onChange={(e) => setStrike(e.target.value)} inputMode="decimal" />
        </label>
        <label className="fld">
          Expiry
          <select className="sel-inp" aria-label="Expiry" disabled={daysOverride.trim() !== ''} title={daysOverride.trim() ? 'Your days override determines the valuation tenor' : 'Friday calendar, not a verified listed expiry'} value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
            {[...new Set([expiry, ...exps])].sort((a, b) => a - b).map((e) => (
              <option key={e} value={e}>
                {expiryLabel(e)}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">Days override {numInput(daysOverride, setDaysOverride, 'Days to expiry override', fmtNum(t * 365, 1))}</label>
        <label className="fld">Spot {numInput(spotOverride, setSpotOverride, 'Spot override', fmtNum(spotLive, s.dec))}</label>
        {solve === 'iv' ? <label className="fld">Premium / share {numInput(premium, setPremium, 'Option premium per share', '')}</label> : <label className="fld">Vol % {numInput(volOverride, setVolOverride, 'Volatility override', fmtNum(vol * 100, 2))}</label>}
        <label className="fld">Rate % {numInput(rateOverride, setRateOverride, 'Rate override', Number.isFinite(published.r) ? fmtNum(published.r * 100, 2) : '')}</label>
        <label className="fld">Dividend % {numInput(dividendOverride, setDividendOverride, 'Dividend yield override', fmtNum(q * 100, 2))}</label>
        <label className="fld">Multiplier {numInput(multiplier, setMultiplier, 'Contract multiplier', '100')}</label>
      </div>
      {error ? <div className="pad amber" role="status">{error}</div> : <><div className="cols">
        <Section title="Valuation">
          <KV
            items={[
              ['Theoretical value', <span key="v" data-testid="option-value" className="white b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(g.price, 4)}</span>],
              [`Per contract (x${contract})`, fmtNum(g.price * contract, 2)],
              ['Underlying', fmtNum(spot, s.dec)],
              ['Forward', fmtNum(fwd, s.dec)],
              ['Volatility', <span key="iv" data-testid="option-iv">{fmtNum(vol * 100, 4)}% ({volSource})</span>],
              ['Time to expiry', `${fmtNum(t * 365, 1)} days`],
              [`Rate (${rateName}) / dividend`, `${fmtNum(r * 100, 2)}% / ${dividendOverride.trim() ? `${fmtNum(q * 100, 2)}% (your input)` : engine.realOnly && !Number.isFinite(qSource) ? 'unknown, 0% used' : `${fmtNum(q * 100, 2)}%`}`],
              ['Intrinsic / time value', `${fmtNum(Math.max(0, type === 'C' ? spot - strike : strike - spot), 4)} / ${fmtNum(g.price - Math.max(0, type === 'C' ? spot - strike : strike - spot), 4)}`],
              ...(american ? [
                ['European reference', <span key="ep" data-testid="option-european-value">{fmtNum(american.europeanPrice, 4)}</span>],
                ['Early exercise premium', <span key="eep" data-testid="option-exercise-premium">{fmtNum(american.earlyExercisePremium, 4)}</span>],
                ['Exercise now (model)', t === 0 ? 'At expiry' : american.exerciseNow ? 'Immediate exercise reaches model value' : 'Intrinsic is zero or below model value'],
                ['Grid change vs half steps', `${fmtNum(american.gridDifference, 6)} / share (not an error bound)`],
              ] satisfies [ReactNode, ReactNode][] : []),
            ]}
          />
        </Section>
        <Section title="Greeks">
          <KV
            items={[
              ['Delta', fmtNum(g.delta, 4)],
              ['Gamma', fmtNum(g.gamma, 5)],
              ['Vega (per vol pt)', fmtNum(g.vega, 4)],
              ['Theta (per day)', fmtNum(g.theta, 4)],
              ['Rho (per 1%)', fmtNum(g.rho, 4)],
              ['Delta $ / contract', fmtNum(g.delta * spot * contract, 0)],
            ]}
          />
        </Section>
        <Section title="P&L vs underlying (per share)">
          <XYChart
            height={210}
            series={[
              { label: 'Today', color: '#ffb547', points: curve },
              { label: 'At expiry', color: '#45d3e6', points: atExp, dash: [4, 4] },
            ]}
            refLines={[{ y: 0, color: '#3a3a3a' }, { x: spot, color: '#5c5c5c', label: 'Spot' }, { x: strike, color: '#9a5e0f', label: 'K' }]}
            xFormat={(v) => fmtNum(v, s.dec > 2 ? 2 : 0)}
            yFormat={(v) => fmtNum(v, 2)}
          />
        </Section>
      </div>
      <Section title="Scenario analysis (instant spot move)">
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Spot move</th>
              <th className="num">Spot</th>
              <th className="num">Option value</th>
              <th className="num">P&L / contract</th>
              <th className="num">Value at expiry</th>
            </tr>
          </thead>
          <tbody>
            {scen.map((x) => (
              <tr key={x.pct} className={x.pct === 0 ? 'sel' : ''}>
                <td className="num amber">{x.pct > 0 ? '+' : ''}{x.pct}%</td>
                <td className="num">{fmtNum(x.sp, s.dec)}</td>
                <td className="num white">{fmtNum(x.v, 4)}</td>
                <td className={`num ${x.v >= g.price ? 'up' : 'dn'}`}>{fmtNum((x.v - g.price) * contract, 2)}</td>
                <td className="num">{fmtNum(x.payoff, 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      </>}
      {american && <div className="note">American approximation: Tian three-moment binomial with BSM terminal smoothing, averaging {steps} and {steps + 1} steps with intrinsic/European price floors. Compare grid sizes before relying on small differences. Bump Greeks use spot ±{fmtNum(american.spotBumpPercent, 3)}% (adapted to grid spacing, 0.5–5%), vol ±0.1 point (smaller near zero), rate ±1bp and a one-day theta roll (smaller near expiry); exercise boundaries and lattice alignment can make them unstable. No-early-exercise cases use exact BSM.</div>}
      <div className="note">{daysOverride.trim() ? 'Tenor is your entered calendar days / 365.' : 'Expiry choices are a Friday calendar at 16:00 New York with DST, not verified listed contracts or holiday-adjusted expiries.'} Rates are held flat. {solve === 'iv' ? `Volatility is solved from your premium using the ${exercise === 'A' ? 'American' : 'European'} model.` : volOverride.trim() ? 'Volatility is your input.' : 'Source volatility is realised, not implied.'} Unknown dividend yield uses the displayed 0% assumption. Early exercise and discrete ex-dividend effects depend on actual contract terms.</div>
    </div>
  );
}
