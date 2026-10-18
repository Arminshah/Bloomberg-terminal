import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { KV, LivePx, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtNum } from '../core/format';
import { engine, useQuote } from '../data/market';
import { resolveSecurity } from '../data/registry';
import { forwardValue, inputNumber, type DayBasis } from '../finance/contracts';
import { usePanelId } from '../terminal/panel';
import { execute } from '../terminal/exec';
import type { FnProps } from '../terminal/types';

type Form = { spot: string; base: string; quote: string; days: string; baseBasis: string; quoteBasis: string; point: string; notional: string; strike: string };
export function ForwardCalc({ sec, route }: FnProps) {
  const requested = route.args ? resolveSecurity(route.args) : undefined;
  const pair = sec?.fx ? sec : requested?.fx ? requested : engine.get('EURUSD Curncy')!;
  const { base, quote } = pair.fx!;
  const q = useQuote(pair.id);
  const panel = usePanelId();
  const [form, setForm] = useState<Form>({ spot: '', base: '', quote: '', days: '90', baseBasis: '360', quoteBasis: '360', point: quote === 'JPY' ? '0.01' : '0.0001', notional: '1000000', strike: '' });
  const [example, setExample] = useState(false);
  const set = (key: keyof Form, value: string) => { setForm((f) => ({ ...f, [key]: value })); setExample(false); };
  const spot = form.spot.trim() ? inputNumber(form.spot) : q?.last ?? NaN;
  const inputs = { spot, baseRate: inputNumber(form.base), quoteRate: inputNumber(form.quote), days: inputNumber(form.days),
    baseBasis: Number(form.baseBasis) as DayBasis, quoteBasis: Number(form.quoteBasis) as DayBasis,
    pointSize: inputNumber(form.point), notional: inputNumber(form.notional), strike: form.strike.trim() ? inputNumber(form.strike) : undefined };
  let result: ReturnType<typeof forwardValue> | undefined;
  let error = '';
  try { result = forwardValue(inputs); } catch (e) { error = (e as Error).message; }
  const r = result;
  const tenors = r ? [...new Set([7, 30, 90, 180, 365, inputs.days])].sort((a, b) => a - b).map((days) => {
    try { return { days, ...forwardValue({ ...inputs, days, strike: undefined }) }; } catch { return { days, outright: NaN, points: NaN }; }
  }) : [];
  const rows = () => [['Source', example ? 'Example inputs' : 'User rates and input/source spot'], ['Pair', `${base}/${quote}`], ['Spot', spot],
    ['Spot mode', form.spot.trim() ? 'Manual override' : 'Source price'], ['Source provider', q?.provider], ['Source timestamp', Number.isFinite(q?.time) ? new Date(q!.time).toISOString() : undefined],
    ['Base rate %', inputs.baseRate], ['Quote rate %', inputs.quoteRate],
    ['Base basis', inputs.baseBasis], ['Quote basis', inputs.quoteBasis], ['Days', inputs.days], ['Notional base', inputs.notional], ['Point size', inputs.pointSize],
    ['Model outright', r?.outright], ['Points', r?.points], ['Contractual rate', inputs.strike], ['PV at spot settlement in quote currency (long base)', r?.pv], ['Days', 'Outright (flat input rates)', 'Points'], ...tenors.map((t) => [t.days, t.outright, t.points])];
  const loadExample = () => { setForm({ spot: '1.1', base: '2', quote: '5', days: '90', baseBasis: '360', quoteBasis: '360', point: quote === 'JPY' ? '0.01' : '0.0001', notional: '1000000', strike: '1.09' }); setExample(true); };
  return <div>
    <FnHeader code="FXFORWARD" title="Forward Rates" sec={pair} sub="Covered interest parity · user-entered term rates"
      actions={[{ n: 1, label: 'Example', onClick: loadExample }, ...(r ? exportActions(panel, 'fx-forward-calculation.csv', rows) : [])]} />
    <CalcSource>{example ? 'Example inputs. ' : 'Your term rates and input/source spot. '}Model forwards and contract PV at spot settlement in {quote}; dealer bid/ask points and cross-currency basis are not supplied.</CalcSource>
    <div className="chart-tools">
      <CalcSelect label="Currency pair" value={pair.id} onChange={(id) => execute(panel, `${id} FXFORWARD`)}>{engine.securities.filter((d) => d.cls === 'fx' && d.fx).map((d) => <option key={d.id} value={d.id}>{d.ticker}</option>)}</CalcSelect>
      <span>Source spot <LivePx id={pair.id} /></span>
      <CalcInput label="Spot override" value={form.spot} placeholder="Use source" onChange={(v) => set('spot', v)} />
      <CalcInput label={`${base} deposit %`} value={form.base} onChange={(v) => set('base', v)} />
      <CalcInput label={`${quote} deposit %`} value={form.quote} onChange={(v) => set('quote', v)} />
      <CalcSelect label={`${base} day basis`} value={form.baseBasis} onChange={(v) => set('baseBasis', v)}><option value="360">ACT/360</option><option value="365">ACT/365F</option></CalcSelect>
      <CalcSelect label={`${quote} day basis`} value={form.quoteBasis} onChange={(v) => set('quoteBasis', v)}><option value="360">ACT/360</option><option value="365">ACT/365F</option></CalcSelect>
      <CalcInput label="Days from spot settlement" value={form.days} onChange={(v) => set('days', v)} />
      <CalcSelect label="Point size" value={form.point} onChange={(v) => set('point', v)}>{['0.0001', '0.01', '1'].map((p) => <option key={p}>{p}</option>)}</CalcSelect>
      <CalcInput label={`Notional ${base}`} value={form.notional} onChange={(v) => set('notional', v)} />
      <CalcInput label="Contractual forward rate" value={form.strike} placeholder="Optional" onChange={(v) => set('strike', v)} />
    </div>
    {!r ? <div className="pad amber" role="status">{error}</div> : <div className="cols">
      <Section title="Model valuation"><KV items={[
        ['Spot (quote per base)', fmtNum(spot, 8)], ['Forward outright', <span key="f" data-testid="forward-outright" className="white b">{fmtNum(r.outright, 8)}</span>], ['Forward points', fmtNum(r.points, 4)],
        [`Pay ${quote} at maturity`, fmtNum(r.quoteAmount, 2)], [`Receive ${base} at maturity`, fmtNum(r.baseAmount, 2)],
        [`PV ${quote} at spot settlement (long ${base})`, <span key="p" data-testid="forward-pv">{fmtNum(r.pv, 2)}</span>], ['Quote discount factor', fmtNum(r.quoteDiscount, 9)],
      ]} /></Section>
      <Section title="Tenor scenarios · rates held flat"><table className="tbl"><thead><tr><th>Days</th><th className="num">Outright</th><th className="num">Points</th></tr></thead><tbody>
        {tenors.map((t) => <tr key={t.days}><td>{t.days}</td><td className="num">{fmtNum(t.outright, 8)}</td><td className="num">{fmtNum(t.points, 4)}</td></tr>)}</tbody></table></Section>
      <Section title="Model forward points"><XYChart height={230} series={[{ label: 'Points', color: '#ffb547', points: tenors.filter((t) => Number.isFinite(t.points)).map((t) => ({ x: t.days, y: t.points })), markers: true }]} xFormat={(v) => `${v}d`} yFormat={(v) => fmtNum(v, 2)} /></Section>
    </div>}
    <p className="pad-s muted">F = S × (1 + quote rate × days / quote basis) ÷ (1 + base rate × days / base basis). Rates are annual simple deposit rates. PV discounts the long-base contractual payoff to spot settlement, without a further discount to today. Use the correct settlement-to-value days; holiday rolls, collateral and funding adjustments are outside this model.</p>
  </div>;
}
