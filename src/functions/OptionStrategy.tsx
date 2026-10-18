import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtNum } from '../core/format';
import { engine } from '../data/market';
import { inputNumber } from '../finance/contracts';
import { parseStrategyLegs, strategyValue } from '../finance/option-strategy';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type Form = { spot: string; days: string; rate: string; dividend: string; multiplier: string; shares: string; stockCost: string; legs: string; advance: string; move: string; volShift: string };
const EMPTY: Form = { spot: '', days: '90', rate: '', dividend: '', multiplier: '100', shares: '0', stockCost: '0', legs: '', advance: '0', move: '0', volShift: '0' };
const EXAMPLES = {
  vertical: { label: 'Bull call spread', shares: '0', legs: 'C,100,1,8,25\nC,110,-1,4,25' },
  straddle: { label: 'Long straddle', shares: '0', legs: 'C,100,1,6,25\nP,100,1,5,25' },
  condor: { label: 'Iron condor', shares: '0', legs: 'P,90,1,1,25\nP,95,-1,2,25\nC,105,-1,2,25\nC,110,1,1,25' },
  covered: { label: 'Covered call', shares: '100', legs: 'C,110,-1,4,25' },
  protective: { label: 'Protective put', shares: '100', legs: 'P,95,1,3,25' },
};
const limit = (v: number) => v === Infinity ? 'Unlimited' : fmtNum(v, 2);

export function OptionStrategy({ sec }: FnProps) {
  const panel = usePanelId();
  const [form, setForm] = useState<Form>(EMPTY);
  const [exampleKind, setExampleKind] = useState<keyof typeof EXAMPLES>('vertical');
  const [example, setExample] = useState(false);
  const set = (key: keyof Form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setExample(false); };
  const sourceSpot = sec ? engine.quote(sec.id)?.last ?? NaN : NaN;
  const spot = form.spot.trim() ? inputNumber(form.spot) : sourceSpot;
  let result: ReturnType<typeof strategyValue> | undefined;
  let error = '';
  let scenarioError = '';
  const advance = inputNumber(form.advance);
  const move = inputNumber(form.move);
  const volShift = inputNumber(form.volShift) / 100;
  const scenarioSpot = spot * Math.exp(move / 100);
  try {
    const legs = parseStrategyLegs(form.legs);
    result = strategyValue({ spot, days: inputNumber(form.days), rate: inputNumber(form.rate) / 100, dividend: inputNumber(form.dividend) / 100,
      multiplier: inputNumber(form.multiplier), shares: inputNumber(form.shares), stockCost: inputNumber(form.stockCost), legs });
    if (!Number.isFinite(result.scenario(scenarioSpot, advance, volShift))) scenarioError = 'Scenario needs positive finite spot, days forward between zero and expiry, and every shifted volatility between 0% and 1000%.';
  } catch (e) { error = (e as Error).message; }
  const r = result;
  const scenarioPnl = r && !scenarioError ? r.scenario(scenarioSpot, advance, volShift) : NaN;
  const spots = r ? [...new Set([0, ...r.marks.map((l) => l.strike), ...Array.from({ length: 81 }, (_, k) => spot * k / 40)])].sort((a, b) => a - b) : [];
  const atExpiry = spots.map((x) => ({ x, y: r!.atExpiry(x) }));
  const model = spots.filter((x) => x > 0).map((x) => ({ x, y: r!.scenario(x) }));
  const scenarioRows = r && !scenarioError ? [-30, -20, -10, -5, 0, 5, 10, 20, 30].map((pct) => {
    const scenario = spot * Math.exp(pct / 100);
    return { pct, spot: scenario, pnl: r.scenario(scenario, advance, volShift), expiryPnl: r.atExpiry(scenario) };
  }) : [];
  const csv = () => [
    ['Source', example ? 'Calculation example, not market data' : 'User inputs; source spot only when spot input is blank'],
    ['Convention', 'Common expiry; European Black-Scholes-Merton; no financing, dividends received, fees, exercise or assignment'],
    ['Spot', spot], ['Days to expiry (ACT/365F)', inputNumber(form.days)], ['Continuous rate %', inputNumber(form.rate)], ['Continuous dividend yield %', inputNumber(form.dividend)],
    ['Multiplier', inputNumber(form.multiplier)], ['Stock shares', inputNumber(form.shares)], ['Stock entry price', inputNumber(form.stockCost)],
    ['Type', 'Strike', 'Signed contracts', 'Entry premium / share', 'Volatility %'], ...r!.marks.map((l) => [l.type, l.strike, l.quantity, l.premium, l.volatility * 100]),
    ['Entry debit (negative is credit)', r!.entryDebit], ['Model value', r!.modelValue], ['Model P&L vs entry', r!.modelPnl], ['Max expiry profit', limit(r!.maxProfit)], ['Max expiry loss', limit(r!.maxLoss)],
    ['Breakevens', r!.breakEvens.join('; ')], ['Zero P&L intervals', r!.zeroRanges.map(([a, b]) => `${a} to ${b}`).join('; ')],
    ['Delta', r!.greeks.delta], ['Gamma', r!.greeks.gamma], ['Vega per vol point', r!.greeks.vega], ['Theta per calendar day', r!.greeks.theta], ['Rho per rate point', r!.greeks.rho],
    ['Scenario days forward', advance], ['Scenario log spot move %', move], ['Scenario volatility shift (percentage points)', volShift * 100],
    ['Log spot move %', 'Scenario spot', 'Scenario P&L vs entry', 'Expiry P&L vs entry'], ...scenarioRows.map((s) => [s.pct, s.spot, s.pnl, s.expiryPnl]),
  ];
  const loadExample = () => { const e = EXAMPLES[exampleKind]; setForm({ ...EMPTY, spot: '100', rate: '5', dividend: '0', stockCost: '100', shares: e.shares, legs: e.legs }); setExample(true); };
  return <div>
    <FnHeader code="OPTIONSTRATEGY" title="Option Strategy Analysis" sec={sec} sub="Up to 12 legs + stock · common expiry · European model"
      actions={[{ n: 1, label: 'Load example', onClick: loadExample }, ...(r ? exportActions(panel, 'option-strategy.csv', csv) : [])]} />
    <CalcSource>{example ? `${EXAMPLES[exampleKind].label} example inputs. ` : 'Your positions, entry premiums, model rates and volatilities. '}P&L is measured against entry cost. Maximum profit, loss and breakevens cover all nonnegative expiry spot prices, including unlimited tails.</CalcSource>
    <div className="chart-tools">
      <CalcSelect label="Strategy example" value={exampleKind} onChange={(v) => { setExampleKind(v as keyof typeof EXAMPLES); setExample(false); }}>{Object.entries(EXAMPLES).map(([key, e]) => <option key={key} value={key}>{e.label}</option>)}</CalcSelect>
      <CalcInput label="Strategy spot" value={form.spot} onChange={(v) => set('spot', v)} placeholder={fmtNum(sourceSpot, 2)} />
      <CalcInput label="Days to expiry" value={form.days} onChange={(v) => set('days', v)} />
      <CalcInput label="Continuous rate %" value={form.rate} onChange={(v) => set('rate', v)} />
      <CalcInput label="Continuous dividend %" value={form.dividend} onChange={(v) => set('dividend', v)} />
      <CalcInput label="Strategy multiplier" value={form.multiplier} onChange={(v) => set('multiplier', v)} />
      <CalcInput label="Stock shares" value={form.shares} onChange={(v) => set('shares', v)} />
      <CalcInput label="Stock entry price" value={form.stockCost} onChange={(v) => set('stockCost', v)} />
    </div>
    <div className="pad-s"><label className="fld" style={{ display: 'block', whiteSpace: 'normal' }}>Option legs: C/P, strike, signed contracts, entry premium per share, volatility %
      <textarea className="inp" aria-label="Option strategy legs" value={form.legs} onChange={(e) => set('legs', e.target.value)} rows={5} spellCheck={false} placeholder={'C,100,1,8,25\nC,110,-1,4,25'} style={{ width: 'min(100%, 620px)', display: 'block', resize: 'vertical' }} />
    </label><p className="muted">Positive quantity buys, negative quantity sells. Premiums remain positive; the quantity supplies their sign. All legs share the entered expiry and multiplier.</p></div>
    {!r ? <div className="pad amber" role="status">{error}</div> : <>
      <div className="cols">
        <Section title="Value and expiry risk"><KV items={[
          ['Entry debit (negative = credit)', <span key="d" data-testid="strategy-debit">{fmtNum(r.entryDebit, 2)}</span>],
          ['Model value today', fmtNum(r.modelValue, 2)], ['Model P&L vs entry', fmtNum(r.modelPnl, 2)],
          ['Maximum expiry profit', <span key="p" data-testid="strategy-max-profit">{limit(r.maxProfit)}</span>],
          ['Maximum expiry loss', <span key="l" data-testid="strategy-max-loss">{limit(r.maxLoss)}</span>],
          ['Expiry breakeven spot', <span key="b" data-testid="strategy-breakevens">{r.breakEvens.length ? r.breakEvens.map((v) => fmtNum(v, 4)).join(' / ') : 'None'}</span>],
          ...(r.zeroRanges.length ? [['Zero P&L intervals', r.zeroRanges.map(([a, b]) => `${fmtNum(a, 4)}–${b === Infinity ? '∞' : fmtNum(b, 4)}`).join(' / ')] as [string, string]] : []),
        ]} /></Section>
        <Section title="Aggregate model Greeks"><KV items={[
          ['Delta (shares equivalent)', fmtNum(r.greeks.delta, 4)], ['Gamma (delta change / spot unit)', fmtNum(r.greeks.gamma, 5)],
          ['Vega (P&L / vol point)', fmtNum(r.greeks.vega, 4)], ['Theta (P&L / calendar day)', fmtNum(r.greeks.theta, 4)], ['Rho (P&L / rate point)', fmtNum(r.greeks.rho, 4)],
        ]} /></Section>
        <Section title="P&L vs entry cost"><XYChart height={230} series={[{ label: 'Model today', color: '#ffb547', points: model }, { label: 'Expiry', color: '#45d3e6', points: atExpiry }]} refLines={[{ y: 0, color: '#555' }, { x: spot, color: '#555', label: 'Spot' }]} xFormat={(v) => fmtNum(v, 1)} yFormat={(v) => fmtNum(v, 0)} /></Section>
      </div>
      <Section title="Scenario analysis">
        <div className="chart-tools">
          <CalcInput label="Scenario days forward" value={form.advance} onChange={(v) => set('advance', v)} />
          <CalcInput label="Scenario log spot move %" value={form.move} onChange={(v) => set('move', v)} />
          <CalcInput label="Volatility shift (percentage points)" value={form.volShift} onChange={(v) => set('volShift', v)} />
        </div>
        {scenarioError ? <div className="pad-s amber" role="status">{scenarioError}</div> : <>
          <p className="pad-s">Scenario spot {fmtNum(scenarioSpot, 4)} · P&L vs entry <span className="white" data-testid="strategy-scenario-pnl">{fmtNum(scenarioPnl, 2)}</span> · change from today’s model {fmtNum(scenarioPnl - r.modelPnl, 2)}</p>
          <table className="tbl"><thead><tr><th>Log spot move %</th><th className="num">Spot</th><th className="num">Scenario P&L</th><th className="num">Expiry P&L</th></tr></thead><tbody>{scenarioRows.map((row) => <tr key={row.pct}><td>{row.pct}</td><td className="num">{fmtNum(row.spot, 4)}</td><td className="num">{fmtNum(row.pnl, 2)}</td><td className="num">{fmtNum(row.expiryPnl, 2)}</td></tr>)}</tbody></table>
        </>}
      </Section>
    </>}
    <p className="pad-s muted">European Black-Scholes-Merton with continuous rates/dividend yield and flat volatility per leg. Expiry P&L uses entered premiums without financing, cash dividends, fees, margin, exercise or assignment. American exercise, adjusted deliverables and different expiries are outside this model; a short option may require substantial margin before expiry.</p>
  </div>;
}
