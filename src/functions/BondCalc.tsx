import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { engine } from '../data/market';
import { analytics, cleanFromYield, couponSchedule, to32nds, yieldFromClean, type BondAnalytics } from '../finance/bonds';
import { contractDate, inputNumber } from '../finance/contracts';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

type Form = { coupon: string; maturity: string; settle: string; frequency: string; mode: string; value: string; face: string };
const EXAMPLE: Form = { coupon: '5', maturity: '2030-01-01', settle: '2025-01-01', frequency: '2', mode: 'yield', value: '4', face: '1000000' };

/** Regular fixed-rate bullet analytics, available without a bond quote or subscription. */
export function BondCalc({ sec }: FnProps) {
  const panel = usePanelId();
  const [form, setForm] = useState<Form>({ coupon: '', maturity: '', settle: new Date(engine.now()).toISOString().slice(0, 10), frequency: '2', mode: 'yield', value: '', face: '1000000' });
  const [example, setExample] = useState(false);
  const set = (key: keyof Form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setExample(false); };
  const terms = { coupon: inputNumber(form.coupon), maturity: contractDate(form.maturity), freq: Number(form.frequency) };
  const settle = contractDate(form.settle);
  const face = inputNumber(form.face);
  const input = inputNumber(form.value);
  let error = '';
  let result: BondAnalytics | undefined;
  if (!Number.isFinite(terms.coupon) || terms.coupon < 0) error = 'Enter a nonnegative annual coupon.';
  else if (!Number.isFinite(settle.getTime()) || !Number.isFinite(terms.maturity.getTime()) || terms.maturity <= settle) error = 'Enter a valid settlement date and a later maturity date.';
  else if (!couponSchedule(terms, settle).length) error = 'Use a supported frequency and a maturity within 200 years.';
  else if (!Number.isFinite(face) || face <= 0) error = 'Enter a positive face amount.';
  else if (!Number.isFinite(input) || form.mode === 'price' && input <= 0) error = `Enter a ${form.mode === 'price' ? 'positive clean price per 100' : 'finite nominal yield in percent'}.`;
  else {
    const y = form.mode === 'price' ? yieldFromClean(terms, settle, input) : input;
    if (!Number.isFinite(y) || y <= -100 * terms.freq) error = `Yield must exceed ${-100 * terms.freq}% for this coupon frequency.`;
    else {
      const a = analytics(terms, settle, y);
      if (![a.clean, a.dirty, a.modified, a.convexity, a.dv01, a.dirty * face].every(Number.isFinite)) error = 'These inputs exceed the calculator’s numerical range.';
      else result = a;
    }
  }
  const r = result;
  const cash = r ? couponSchedule(terms, settle).slice(1).map((date, index, dates) => {
    const amount = terms.coupon / terms.freq + (index === dates.length - 1 ? 100 : 0);
    const fraction = (r.nextCoupon.getTime() - settle.getTime()) / (r.nextCoupon.getTime() - r.prevCoupon.getTime());
    return { date, amount, pv: amount / (1 + r.yield / 100 / terms.freq) ** (fraction + index) };
  }) : [];
  const scenarios = r ? [-100, -50, -25, -10, 10, 25, 50, 100].map((bp) => {
    const price = cleanFromYield(terms, settle, r.yield + bp / 100);
    return { bp, price, change: price - r.clean, pnl: (price - r.clean) / 100 * face };
  }) : [];
  const points = r ? Array.from({ length: 41 }, (_, k) => ({ x: r.yield - 2 + k / 10, y: cleanFromYield(terms, settle, r.yield - 2 + k / 10) })).filter((p) => Number.isFinite(p.y)) : [];
  const rows = () => [
    ['Source', example ? 'Calculation example, not market data' : 'User-entered contract terms and price/yield'],
    ['Convention', 'Regular fixed-rate bullet; Actual/Actual ICMA; unadjusted dates'],
    ['Coupon %', terms.coupon], ['Maturity', form.maturity], ['Settlement', form.settle], ['Frequency', terms.freq], ['Face', face],
    ['Yield %', r?.yield], ['Clean / 100', r?.clean], ['Dirty / 100', r?.dirty], ['DV01 / 100', r?.dv01],
    ['Payment date', 'Cash flow / 100', 'PV / 100'], ...cash.map((c) => [c.date.toISOString().slice(0, 10), c.amount, c.pv]),
  ];
  return <div>
    <FnHeader code="BONDCALC" title="Yield & Spread Analysis" sec={sec} sub="Regular fixed-rate bullet · Actual/Actual ICMA"
      actions={[{ n: 1, label: 'Example', onClick: () => { setForm(EXAMPLE); setExample(true); } }, ...(r ? exportActions(panel, 'bond-calculation.csv', rows) : [])]} />
    <CalcSource>{example ? 'Example inputs. ' : 'Your contract terms and price/yield. '}Calculated price and risk; no market bond quote, credit spread or issue terms are inferred.</CalcSource>
    <div className="chart-tools">
      <CalcInput label="Coupon %" value={form.coupon} onChange={(v) => set('coupon', v)} />
      <CalcInput label="Maturity" type="date" value={form.maturity} onChange={(v) => set('maturity', v)} />
      <CalcInput label="Settlement" type="date" value={form.settle} onChange={(v) => set('settle', v)} />
      <CalcSelect label="Coupons per year" value={form.frequency} onChange={(v) => set('frequency', v)}>{[1, 2, 4, 12].map((f) => <option key={f} value={f}>{f}</option>)}</CalcSelect>
      <CalcSelect label="Solve from" value={form.mode} onChange={(v) => { set('mode', v); set('value', ''); }}><option value="yield">Yield</option><option value="price">Clean price</option></CalcSelect>
      <CalcInput label={form.mode === 'price' ? 'Clean price per 100' : 'Yield %'} value={form.value} onChange={(v) => set('value', v)} />
      <CalcInput label="Face amount" value={form.face} onChange={(v) => set('face', v)} />
    </div>
    {!r ? <div className="pad amber" role="status">{error} Enter your inputs or load the calculation example.</div> : <>
      <div className="cols">
        <Section title="Price and yield"><KV items={[
          ['Clean price / 100', <span key="p" data-testid="bond-clean" className="white b">{fmtNum(r.clean, 6)}</span>],
          ['Price in 32nds (rounded to 1/64)', to32nds(r.clean)], ['Yield %', <span key="y" data-testid="bond-yield">{fmtNum(r.yield, 6)}</span>],
          ['Accrued interest / 100', fmtNum(r.accrued, 6)], ['Accrued days', String(r.accruedDays)], ['Dirty price / 100', fmtNum(r.dirty, 6)],
          ['Invoice amount', fmtNum(r.dirty / 100 * face, 2)], ['Previous / next coupon', `${fmtDay(r.prevCoupon.getTime(), true)} / ${fmtDay(r.nextCoupon.getTime(), true)}`],
        ]} /></Section>
        <Section title="Risk"><KV items={[
          ['Macaulay duration (years)', fmtNum(r.macaulay, 6)], ['Modified duration', fmtNum(r.modified, 6)], ['Convexity', fmtNum(r.convexity, 6)],
          ['DV01 per 100 face', fmtNum(r.dv01, 6)], ['DV01 for face amount', fmtNum(r.dv01 * face / 100, 2)], ['Remaining coupons', String(r.remaining)],
        ]} /></Section>
        <Section title="Price / yield"><XYChart height={210} series={[{ label: 'Clean price / 100', color: '#ffb547', points }]} xFormat={(v) => `${fmtNum(v, 2)}%`} yFormat={(v) => fmtNum(v, 2)} /></Section>
      </div>
      <div className="cols"><Section title="Parallel yield scenarios"><table className="tbl"><thead><tr><th>Shift bp</th><th className="num">Clean / 100</th><th className="num">Price change</th><th className="num">P&L</th></tr></thead>
        <tbody>{scenarios.map((s) => <tr key={s.bp}><td>{s.bp > 0 ? '+' : ''}{s.bp}</td><td className="num">{fmtNum(s.price, 6)}</td><td className="num">{fmtNum(s.change, 6)}</td><td className="num">{fmtNum(s.pnl, 2)}</td></tr>)}</tbody></table></Section>
        <Section title="Cash flows" right={`${cash.length} payments`}><div style={{ maxHeight: 300, overflow: 'auto' }}><table className="tbl"><thead><tr><th>Payment date</th><th className="num">Cash flow / 100</th><th className="num">PV / 100</th></tr></thead>
          <tbody>{cash.map((c) => <tr key={c.date.getTime()}><td>{fmtDay(c.date.getTime(), true)}</td><td className="num">{fmtNum(c.amount, 6)}</td><td className="num">{fmtNum(c.pv, 6)}</td></tr>)}</tbody></table></div></Section></div>
    </>}
    <p className="pad-s muted">Regular fixed-rate bullet, nominal yield compounded at coupon frequency, Actual/Actual ICMA. Dates are unadjusted. Confirm contractual settlement and coupon schedule; stubs, calls, defaults and taxes are outside this model.</p>
  </div>;
}
