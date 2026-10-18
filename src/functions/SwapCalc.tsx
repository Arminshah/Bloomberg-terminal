import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { Chg, KV, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { engine } from '../data/market';
import { actualDays, contractDate, inputNumber, parseZeroCurve, swapValue, type DayBasis, type SwapInputs } from '../finance/contracts';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type Form = { valuation: string; start: string; maturity: string; frequency: string; notional: string; fixed: string; fixedBasis: string; floatBasis: string; side: string; currency: string; curve: string };
export function SwapCalc(_: FnProps) {
  const panel = usePanelId();
  const today = new Date(engine.now()).toISOString().slice(0, 10);
  const [form, setForm] = useState<Form>({ valuation: today, start: today, maturity: '', frequency: '1', notional: '1000000', fixed: '', fixedBasis: '365', floatBasis: '365', side: 'pay', currency: 'USD', curve: '' });
  const [example, setExample] = useState(false);
  const set = (key: keyof Form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setExample(false); };
  let result: ReturnType<typeof swapValue> | undefined;
  let curveBpPnl = NaN;
  let error = '';
  let inputs: SwapInputs | undefined;
  try {
    inputs = { valuation: contractDate(form.valuation), start: contractDate(form.start), maturity: contractDate(form.maturity), frequency: Number(form.frequency) as SwapInputs['frequency'],
      notional: inputNumber(form.notional), fixedPct: form.fixed.trim() ? inputNumber(form.fixed) : undefined, fixedBasis: Number(form.fixedBasis) as DayBasis, floatBasis: Number(form.floatBasis) as DayBasis, payFixed: form.side === 'pay', nodes: parseZeroCurve(form.curve) };
    result = swapValue(inputs);
    // Freeze the base trade coupon: a risk bump must not turn it into a newly struck par trade.
    curveBpPnl = swapValue({ ...inputs, fixedPct: result.fixedPct, nodes: inputs.nodes.map((n) => ({ ...n, discountPct: n.discountPct + 0.01, projectionPct: n.projectionPct + 0.01 })) }).npv - result.npv;
  } catch (e) { error = (e as Error).message; result = undefined; }
  const r = result;
  const rows = () => [['Source', example ? 'Calculation example' : 'User contract and continuous zero rates'], ['Currency', form.currency], ['Valuation', form.valuation], ['Start', form.start], ['Maturity', form.maturity],
    ['Frequency', form.frequency], ['Fixed basis', form.fixedBasis], ['Float basis', form.floatBasis], ['Side', form.side], ['Notional', inputNumber(form.notional)], ['Fixed coupon %', r?.fixedPct],
    ['Par coupon %', r?.parPct], ['NPV', r?.npv], ['Curve +1bp P&L', curveBpPnl], ['Coupon +1bp P&L', r?.couponBpPnl],
    ['Curve years', 'Discount zero %', 'Projection zero %'], ...(inputs?.nodes ?? []).map((n) => [n.years, n.discountPct, n.projectionPct]),
    ['Accrual start', 'Payment date', 'Days', 'Discount factor', 'Forward %', 'Fixed cash (signed)', 'Floating cash (signed)', 'Net PV'],
    ...(r?.flows ?? []).map((f) => [f.start.toISOString().slice(0, 10), f.end.toISOString().slice(0, 10), f.days, f.df, f.forwardPct, (form.side === 'pay' ? -1 : 1) * f.fixedCash, (form.side === 'pay' ? 1 : -1) * f.floatCash, f.netPV]),
  ];
  const loadExample = () => { setForm({ valuation: '2025-01-01', start: '2025-01-01', maturity: '2027-01-01', frequency: '1', notional: '1000000', fixed: '3', fixedBasis: '365', floatBasis: '365', side: 'pay', currency: 'USD', curve: '1,5\n2,5\n5,5' }); setExample(true); };
  return <div>
    <FnHeader code="SWAPCALC" title="Swap Manager" sub="Fixed/float analytics · separate discount and projection zero curves"
      actions={[{ n: 1, label: 'Example', onClick: loadExample }, ...(r ? exportActions(panel, 'swap-calculation.csv', rows) : [])]} />
    <CalcSource>{example ? 'Example inputs. ' : 'Your contract and zero curves. '}Calculated NPV, fair coupon, cash flows and risk; no market swap curve is assumed.</CalcSource>
    <div className="chart-tools">
      <CalcSelect label="Side" value={form.side} onChange={(v) => set('side', v)}><option value="pay">Pay fixed</option><option value="receive">Receive fixed</option></CalcSelect>
      <CalcSelect label="Currency" value={form.currency} onChange={(v) => set('currency', v)}>{['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD'].map((c) => <option key={c}>{c}</option>)}</CalcSelect>
      <CalcInput label="Valuation date" type="date" value={form.valuation} onChange={(v) => set('valuation', v)} />
      <CalcInput label="Swap start" type="date" value={form.start} onChange={(v) => set('start', v)} />
      <CalcInput label="Swap maturity" type="date" value={form.maturity} onChange={(v) => set('maturity', v)} />
      <CalcInput label="Notional" value={form.notional} onChange={(v) => set('notional', v)} />
      <CalcInput label="Fixed coupon %" value={form.fixed} placeholder="Solve at par" onChange={(v) => set('fixed', v)} />
      <CalcSelect label="Payments per year" value={form.frequency} onChange={(v) => set('frequency', v)}>{[1, 2, 4, 12].map((f) => <option key={f}>{f}</option>)}</CalcSelect>
      <CalcSelect label="Fixed day basis" value={form.fixedBasis} onChange={(v) => set('fixedBasis', v)}><option value="365">ACT/365F</option><option value="360">ACT/360</option></CalcSelect>
      <CalcSelect label="Floating day basis" value={form.floatBasis} onChange={(v) => set('floatBasis', v)}><option value="365">ACT/365F</option><option value="360">ACT/360</option></CalcSelect>
    </div>
    <Section title="Input zero curve"><div className="pad-s">
      <label htmlFor={`swap-curve-${panel}`}>Years, discount zero %, optional projection zero % (one node per line)</label>
      <textarea id={`swap-curve-${panel}`} className="inp" aria-label="Zero curve" value={form.curve} rows={5} spellCheck={false} onChange={(e) => set('curve', e.target.value)} style={{ width: '100%', display: 'block', marginTop: 6, fontFamily: 'inherit' }} placeholder={'1, discount rate, projection rate\n2, discount rate, projection rate'} />
      <span className="muted">Continuously compounded zero rates; tenor measured as ACT/365F from valuation. Two columns use the same curve for both legs. Log-linear discount factors; no extrapolation.</span>
    </div></Section>
    {!r ? <div className="pad amber" role="status">{error}</div> : <>
      <div className="cols"><Section title={`Valuation · ${form.currency}`}><KV items={[
        ['Par fixed coupon %', <span key="p" data-testid="swap-par">{fmtNum(r.parPct, 6)}</span>], ['Contract fixed coupon %', fmtNum(r.fixedPct, 6)],
        ['NPV', <span key="n" data-testid="swap-npv"><Chg v={r.npv} dec={2} /></span>], ['Floating leg PV', fmtNum(r.floatPV, 2)], ['Fixed leg PV', fmtNum(r.fixedPV, 2)], ['Fixed-leg annuity', fmtNum(r.annuity, 8)],
      ]} /></Section><Section title="Risk"><KV items={[
        ['Both zero curves +1bp P&L', <Chg key="b" v={curveBpPnl} dec={2} />], ['Fixed coupon +1bp P&L', fmtNum(r.couponBpPnl, 2)], ['Payment count', String(r.flows.length)],
        ['Curve risk convention', 'Revalue both curves +0.01 percentage point; trade coupon held fixed'],
      ]} /></Section><Section title="Zero and projected forward rates"><XYChart height={230} legend series={[
        { label: 'Discount zero %', color: '#ffb547', points: (inputs?.nodes ?? []).map((n) => ({ x: n.years, y: n.discountPct })), markers: true },
        { label: 'Projection zero %', color: '#45d3e6', points: (inputs?.nodes ?? []).map((n) => ({ x: n.years, y: n.projectionPct })) },
        { label: 'Period forward %', color: '#d77bff', points: r.flows.map((f) => ({ x: actualDays(contractDate(form.valuation), f.end) / 365, y: f.forwardPct })) },
      ]} xFormat={(v) => `${fmtNum(v, 1)}y`} yFormat={(v) => `${fmtNum(v, 2)}%`} /></Section></div>
      <Section title="Projected cash flows"><div style={{ overflow: 'auto', maxHeight: 350 }}><table className="tbl"><thead><tr><th>Start</th><th>Payment</th><th className="num">Days</th><th className="num">Fixed cash</th><th className="num">Forward %</th><th className="num">Floating cash</th><th className="num">Discount</th><th className="num">Net PV</th></tr></thead><tbody>
        {r.flows.map((f) => <tr key={f.end.getTime()}><td>{fmtDay(f.start.getTime(), true)}</td><td>{fmtDay(f.end.getTime(), true)}</td><td className="num">{f.days}</td><td className="num">{fmtNum((form.side === 'pay' ? -1 : 1) * f.fixedCash, 2)}</td><td className="num">{fmtNum(f.forwardPct, 6)}</td><td className="num">{fmtNum((form.side === 'pay' ? 1 : -1) * f.floatCash, 2)}</td><td className="num">{fmtNum(f.df, 8)}</td><td className="num">{fmtNum(f.netPV, 2)}</td></tr>)}</tbody></table></div></Section>
    </>}
    <p className="pad-s muted">Forward-start fixed/float model with a common payment schedule and unadjusted dates. Floating coupons are projected from your curve; no observed fixings, OIS lookback, business-day rolls, payment lags or collateral adjustments. Past-start trades require fixings and are not priced by this model.</p>
  </div>;
}
