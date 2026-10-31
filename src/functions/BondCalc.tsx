import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { CalcInput, CalcSelect, CalcSource } from '../components/CalcInputs';
import { XYChart } from '../components/chart/XYChart';
import { KV, Section } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { afterTaxYield, currentYield, invoice, moneyMarketYield, restateYield, yasRisk } from '../finance/yas';
import { engine } from '../data/market';
import { analytics, cleanFromYield, couponSchedule, DAY_COUNTS, defaultSettlementLag, parseCallSchedule, settlementDate, to32nds, workouts, yieldFromClean, type BondAnalytics, type BondTerms, type DayCount } from '../finance/bonds';
import { contractDate, inputNumber } from '../finance/contracts';
import { parseZeroCurve } from '../finance/contracts';
import { bondSpreadValue } from '../finance/bond-spreads';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { fedinvest, fedinvestOwns } from '../data/live/fedinvest';

type Form = {
  coupon: string; maturity: string; trade: string; lag: string; settle: string; frequency: string; basis: DayCount; mode: string; value: string; face: string;
  benchmark: string; curve: string; calls: string;
};
const EXAMPLE: Form = {
  coupon: '5', maturity: '2030-01-01', trade: '2025-01-01', lag: 'manual', settle: '2025-01-01', frequency: '2', basis: 'ACT/ACT ICMA', mode: 'yield', value: '4',
  face: '1000000', benchmark: '3', curve: '1,3\n5,3\n10,3', calls: '',
};
const LAGS: { value: string; label: string }[] = [
  { value: '0', label: 'T+0' }, { value: '1', label: 'T+1 (US Treasuries)' }, { value: '2', label: 'T+2 (European govts, corporates)' },
  { value: '3', label: 'T+3' }, { value: 'manual', label: 'Manual date' },
];
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Regular fixed-rate bullet analytics, available without a bond quote or subscription. */
export function BondCalc({ sec }: FnProps) {
  const panel = usePanelId();
  // A Treasury priced by FedInvest starts from its terms and that day's Sell price, the figures the page names.
  const [priced] = useState(() => fedPriced(sec));
  const [form, setForm] = useState<Form>(() => {
    const today = isoDay(new Date(engine.now()));
    const base: Form = { coupon: '', maturity: '', trade: today, lag: String(defaultSettlementLag(sec?.cls === 'bond' ? sec : undefined)), settle: '', frequency: '2',
      basis: 'ACT/ACT ICMA', mode: 'yield', value: '', face: '1000000', benchmark: '', curve: '', calls: '' };
    return priced ? { ...base, coupon: String(priced.coupon), maturity: priced.maturity, trade: priced.date, mode: 'price', value: String(priced.price) } : base;
  });
  const [example, setExample] = useState(false);
  const [edited, setEdited] = useState(false);
  // YAS's page tabs and its own settings (TE07 03:47): yields quoted semi-annually, modified duration, Equiv once a
  // year, the after-tax yield at the frame's 40.8 % income and 23.8 % capital gains rates.
  const [tab, setTab] = useState(1);
  const [quoteBasis, setQuoteBasis] = useState(2);
  const [durKind, setDurKind] = useState<'mod' | 'mac'>('mod');
  const [equivFreq, setEquivFreq] = useState(1);
  const [incTax, setIncTax] = useState('40.8');
  const [cgTax, setCgTax] = useState('23.8');
  const update = (fn: (f: Form) => Form) => { setForm(fn); setExample(false); setEdited(true); };
  const set = (key: keyof Form, value: string) => update((f) => ({ ...f, [key]: value }));
  const marketLag = String(defaultSettlementLag(sec?.cls === 'bond' ? sec : undefined));
  const trade = contractDate(form.trade);
  // A lag counts business days from the trade date (weekends only, no holiday calendar); typing a date overrides it.
  const settleText = form.lag === 'manual' ? form.settle : Number.isFinite(trade.getTime()) ? isoDay(settlementDate(trade, Number(form.lag))) : '';
  const basisLabel = DAY_COUNTS.find((d) => d.id === form.basis)?.label ?? form.basis;
  const lagLabel = LAGS.find((l) => l.value === form.lag)?.label ?? form.lag;
  const terms: BondTerms & { freq: number } = { coupon: inputNumber(form.coupon), maturity: contractDate(form.maturity), freq: Number(form.frequency), basis: form.basis };
  const settle = contractDate(settleText);
  const face = inputNumber(form.face);
  const input = inputNumber(form.value);
  let error = '';
  let result: BondAnalytics | undefined;
  if (!Number.isFinite(terms.coupon) || terms.coupon < 0) error = 'Enter a nonnegative annual coupon.';
  else if (form.lag !== 'manual' && !Number.isFinite(trade.getTime())) error = 'Enter a valid trade date, or type the settlement date.';
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
  const risk = yasRisk(r ?? ({} as BondAnalytics), terms.freq, quoteBasis);
  const inv = invoice(r ?? ({} as BondAnalytics), face);
  const mmkt = r ? moneyMarketYield(terms, settle, r) : NaN;
  const afterTax = r ? afterTaxYield(terms, settle, r, inputNumber(incTax), inputNumber(cgTax)) : NaN;
  const benchmark = inputNumber(form.benchmark);
  const gSpread = r && Number.isFinite(benchmark) && benchmark > -100 * terms.freq ? (r.yield - benchmark) * 100 : NaN;
  let spread: ReturnType<typeof bondSpreadValue> | undefined;
  let spreadError = '';
  if (r && form.curve.trim()) {
    try { spread = bondSpreadValue(terms, settle, r.clean, parseZeroCurve(form.curve)); }
    catch (e) { spreadError = (e as Error).message; }
  }
  // The call schedule: each call a possible redemption; the yield to worst is the lowest yield over the calls and maturity.
  const callParse = r && form.calls.trim() ? parseCallSchedule(form.calls, settle, terms.maturity) : null;
  const callError = callParse && 'error' in callParse ? callParse.error : '';
  const work = r && callParse && !('error' in callParse) && callParse.calls.length ? workouts(terms, settle, callParse.calls, r.clean, r.yield) : null;
  const skipped = callParse && !('error' in callParse) ? [callParse.past ? `${callParse.past} on or before settlement` : '', callParse.late ? `${callParse.late} on or after maturity` : ''].filter(Boolean).join(' and ') : '';
  const cash = r ? couponSchedule(terms, settle).slice(1).map((date, index, dates) => {
    const amount = terms.coupon / terms.freq + (index === dates.length - 1 ? 100 : 0);
    // The first flow is discounted DSC/E periods on the bond's day count, each later one a whole period more.
    return { date, amount, pv: amount / (1 + r.yield / 100 / terms.freq) ** (r.fraction + index) };
  }) : [];
  const scenarios = r ? [-100, -50, -25, -10, 10, 25, 50, 100].map((bp) => {
    const price = cleanFromYield(terms, settle, r.yield + bp / 100);
    return { bp, price, change: price - r.clean, pnl: (price - r.clean) / 100 * face };
  }) : [];
  const points = r ? Array.from({ length: 41 }, (_, k) => ({ x: r.yield - 2 + k / 10, y: cleanFromYield(terms, settle, r.yield - 2 + k / 10) })).filter((p) => Number.isFinite(p.y)) : [];
  const rows = () => [
    ['Source', example ? 'Calculation example, not market data' : priced && !edited ? `Coupon and maturity of ${sec!.ticker}; price: TreasuryDirect FedInvest's Sell price of ${fmtDay(Date.parse(priced.date))}` : 'User-entered contract terms and price/yield'],
    ['Convention', `${work ? 'Fixed-rate bond with the calls typed in, each a redemption without option value' : 'Regular fixed-rate bullet'}; ${basisLabel}; unadjusted dates`],
    ['Day count', form.basis], ['Trade date', form.lag === 'manual' ? '' : form.trade], ['Settlement lag', lagLabel],
    ['Coupon %', terms.coupon], ['Maturity', form.maturity], ['Settlement', settleText], ['Frequency', terms.freq], ['Face', face],
    ['Yield %', r?.yield], ['Clean / 100', r?.clean], ['Accrued / 100', r?.accrued], ['Accrued days', r?.accruedDays], ['Days in coupon period', r?.periodDays],
    ['Periods to next coupon (DSC/E)', r?.fraction], ['Dirty / 100', r?.dirty], ['DV01 / 100', r?.dv01],
    ['Benchmark nominal yield %', form.benchmark], ['G-spread bp (matching nominal compounding)', gSpread],
    ['Settlement-relative zero curve: years, continuous zero %, optional projection ignored', form.curve],
    ['Z-spread bp (continuous ACT/365F)', spread?.spreadBp], ['Z01 per 100', spread?.z01], ['Spread duration', spread?.spreadDuration], ['Zero-spread clean price', spread?.zeroSpreadClean], ['Spread input error', spreadError],
    ['Call schedule (date and price per 100)', form.calls.trim().replace(/\r?\n/g, '; ')], ['Call schedule error', callError],
    ['Yield to worst %', work?.toWorst?.yield], ['Workout date', work?.toWorst ? work.toWorst.date.toISOString().slice(0, 10) : ''], [`Price to worst / 100 at ${r?.yield ?? ''}%`, work?.priceToWorst?.cleanAtYield],
    ...(work ? [['Redemption', 'Date', 'Price / 100', `Yield % from clean ${r?.clean ?? ''}`, `Clean / 100 at ${r?.yield ?? ''}%`], ...work.rows.map((w) => [w.kind, w.date.toISOString().slice(0, 10), w.price, w.yield, w.cleanAtYield])] : []),
    ['Payment date', 'Cash flow / 100', 'PV / 100'], ...cash.map((c) => [c.date.toISOString().slice(0, 10), c.amount, c.pv]),
  ];
  return <div>
    <FnHeader code="BONDCALC" title="Yield & Spread Analysis" sec={sec} sub={`${work ? 'Fixed-rate bond with calls' : 'Regular fixed-rate bullet'} · ${basisLabel} · ${form.lag === 'manual' ? 'manual settlement' : lagLabel.replace(/ \(.*\)$/, '')}`}
      plainTabs
      tabs={[{ n: 1, label: 'Yield & Spread' }, { n: 2, label: 'Graphs' }, { n: 3, label: 'Pricing' }, { n: 4, label: 'Description' }, { n: 6, label: 'Calls' }]}
      tab={tab}
      onTab={setTab}
      actions={[{
        n: 9971,
        bare: true,
        label: 'Settings',
        onClick: () => {},
        menu: [
          { label: 'Load the Calculation Example', onClick: () => { setForm(EXAMPLE); setExample(true); } },
          ...(r ? exportActions(panel, 'bond-calculation.csv', rows).map((a, i) => ({ label: a.label === 'Copy' ? 'Copy the Calculation' : 'Download as CSV', title: a.title, sep: i === 0, onClick: a.onClick })) : []),
        ],
      }]} />
    <CalcSource>{example ? 'Example inputs. ' : priced && !edited ? `Coupon and maturity of ${sec!.ticker}; price: TreasuryDirect FedInvest's Sell price of ${fmtDay(Date.parse(priced.date))}, traded that day. ` : 'Your contract terms and price/yield. '}Calculated price, yield risk and optional benchmark/Z-spreads. Supply the benchmark or zero curve; no market quote, curve or issue terms are inferred.</CalcSource>
    <div className="chart-tools">
      <CalcInput label="Coupon %" value={form.coupon} onChange={(v) => set('coupon', v)} />
      <CalcInput label="Maturity" type="date" value={form.maturity} onChange={(v) => set('maturity', v)} />
      {/* A new trade date settles on the lag again; typing a settlement date switches to a manual date. */}
      <CalcInput label="Trade date" type="date" value={form.trade} onChange={(v) => update((f) => ({ ...f, trade: v, lag: f.lag === 'manual' ? marketLag : f.lag }))} />
      <CalcSelect label="Settlement lag" value={form.lag} onChange={(v) => update((f) => ({ ...f, lag: v, settle: settleText || f.settle }))}>{LAGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</CalcSelect>
      <CalcInput label="Settlement" type="date" value={settleText} onChange={(v) => update((f) => ({ ...f, settle: v, lag: 'manual' }))} />
      <CalcSelect label="Coupons per year" value={form.frequency} onChange={(v) => set('frequency', v)}>{[1, 2, 4, 12].map((f) => <option key={f} value={f}>{f}</option>)}</CalcSelect>
      <CalcSelect label="Day count" value={form.basis} onChange={(v) => set('basis', v)}>{DAY_COUNTS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</CalcSelect>
      <CalcSelect label="Solve from" value={form.mode} onChange={(v) => { set('mode', v); set('value', ''); }}><option value="yield">Yield</option><option value="price">Clean price</option></CalcSelect>
      <CalcInput label={form.mode === 'price' ? 'Clean price per 100' : 'Yield %'} value={form.value} onChange={(v) => set('value', v)} />
      <CalcInput label="Face amount" value={form.face} onChange={(v) => set('face', v)} />
    </div>
    {!r ? <div className="pad amber" role="status">{error} Enter your inputs or load the calculation example.</div> : tab === 1 ? <>
      {/* The Yield & Spread page as TE07 03:47 lays it out: the inputs at the left, Risk at the right, then Spreads,
          Yield Calculations and Invoice, and the after-tax yield. */}
      <div className="yas" data-testid="yas-page">
        <div className="yas-head">{sec?.cls === 'bond' ? sec.name : `${fmtNum(terms.coupon, 3)} ${fmtDay(terms.maturity.getTime(), true)}`}</div>
        <div className="yas-top">
          <div className="yas-in">
            <span className="amber">Spread</span>
            <span className="yas-box" title="The yield over the benchmark yield typed beside it, in basis points (YAS's spread to its benchmark)">{Number.isFinite(gSpread) ? <span data-testid="bond-g-spread">{fmtNum(gSpread, 2)}</span> : ''}</span>
            <span className="yas-unit">bp vs</span>
            <span className="yas-bench"><CalcInput label="Benchmark nominal yield %" value={form.benchmark} onChange={(v) => set('benchmark', v)} /></span>
            <span className="amber">Price</span>
            <span className="yas-box"><span data-testid="bond-clean">{fmtNum(r.clean, 6)}</span></span>
            <span className="yas-unit">{to32nds(r.clean)}</span>
            <span />
            <span className="amber">Yield</span>
            <span className="yas-box" title={quoteBasis === terms.freq ? undefined : `${fmtNum(r.yield, 6)} on the bond's own ${terms.freq} times a year`}>{fmtNum(risk.yieldPct, 6)}</span>
            <span className="yas-unit">{work?.toWorst && work.toWorst.kind === 'call' ? 'Wst' : 'Mty'}</span>
            <select className="sel-inp yas-basis" aria-label="Yields are" value={quoteBasis} onChange={(e) => setQuoteBasis(Number(e.target.value))}>
              <option value={2}>S/A</option>
              <option value={1}>Annual</option>
              {![1, 2].includes(terms.freq) && <option value={terms.freq}>{terms.freq}/Yr</option>}
            </select>
            <span className="amber">Wkout</span>
            <span className="yas-plain">{fmtDay((work?.toWorst?.date ?? terms.maturity).getTime(), true)} @ {fmtNum(work?.toWorst?.price ?? 100, 2)}</span>
            <span />
            <span />
            <span className="amber">Accrued</span>
            <span className="yas-plain"><span data-testid="bond-accrued">{fmtNum(r.accrued, 6)}</span></span>
            <span className="yas-unit"><span data-testid="bond-accrued-days">{`${r.accruedDays} of ${fmtNum(r.periodDays, Number.isInteger(r.periodDays) ? 0 : 1)}`}</span> days</span>
            <span />
            <span className="amber">Settle</span>
            <span className="yas-plain">{fmtDay(settle.getTime(), true)}</span>
            <span />
            <span />
          </div>
          <div className="yas-risk">
            <div className="yas-strip">Risk</div>
            <div className="yas-radio" role="radiogroup" aria-label="Duration">
              <label><input type="radio" checked={durKind === 'mod'} onChange={() => setDurKind('mod')} /> M.Dur</label>
              <label><input type="radio" checked={durKind === 'mac'} onChange={() => setDurKind('mac')} /> Dur</label>
              <span className="num white">{fmtNum(durKind === 'mod' ? risk.modified : r.macaulay, 3)}</span>
            </div>
            <KV items={[
              [<span key="r" title="Modified duration times the full price over 100, as YAS shows it">Risk</span>, fmtNum(risk.risk, 3)],
              [<span key="c" title="Convexity scaled by a hundredth, as YAS shows it">Convexity</span>, fmtNum(risk.convexity, 3)],
              [`DV01 on ${face === 1_000_000 ? '1MM' : fmtBig(face, 0)}`, fmtNum(risk.dvOn(face), 2)],
              [<span key="b" title="Needs the benchmark bond's own terms, which the calculator does not take">Benchmark Risk</span>, '--'],
              [<span key="h" title="Needs the benchmark bond's own terms">Risk Hedge</span>, '--'],
              [<span key="p" title="Needs the benchmark bond's own terms">Proceeds Hedge</span>, '--'],
            ]} />
          </div>
        </div>
        <div className="yas-bottom">
          <div>
            <div className="yas-strip">Spreads</div>
            <table className="tbl yas-tbl"><tbody>
              <tr><td><b className="yas-n">11)</b> <span className="amber" title="Against the government curve interpolated at maturity; the calculator takes no curve of yields">G-Sprd</span></td><td className="num">--</td></tr>
              <tr><td><b className="yas-n">12)</b> <span className="amber" title="Against the swap curve; no source the app reads gives one">I-Sprd</span></td><td className="num">--</td></tr>
              <tr><td><b className="yas-n">13)</b> <span className="amber" title="Against a futures contract's implied yield; not modelled">Basis</span></td><td className="num">--</td></tr>
              <tr><td><b className="yas-n">14)</b> <span className="amber" title="From the zero curve typed below">Z-Sprd</span></td><td className="num">{spread ? fmtNum(spread.spreadBp, 1) : '--'}</td></tr>
              <tr><td><b className="yas-n">15)</b> <span className="amber" title="Needs a swap curve; no source the app reads gives one">ASW</span></td><td className="num">--</td></tr>
              <tr><td><b className="yas-n">16)</b> <span className="amber" title="For a bullet bond the option-adjusted spread is the Z-spread; with calls it needs a rate tree, not modelled">OAS</span></td><td className="num">{spread && !work ? fmtNum(spread.spreadBp, 1) : '--'}</td></tr>
            </tbody></table>
          </div>
          <div>
            <div className="yas-strip">Yield Calculations</div>
            <table className="tbl yas-tbl"><tbody>
              <tr><td className="amber">Street Convention</td><td className="num"><span data-testid="bond-yield">{fmtNum(r.yield, 6)}</span></td></tr>
              <tr><td className="amber">Equiv <select className="sel-inp yas-mini" aria-label="Equivalent frequency" value={equivFreq} onChange={(e) => setEquivFreq(Number(e.target.value))}>{[1, 2, 4, 12].map((f) => <option key={f} value={f}>{f}</option>)}</select> /Yr</td><td className="num">{fmtNum(restateYield(r.yield, terms.freq, equivFreq), 6)}</td></tr>
              <tr><td className="amber" title="Simple interest on Act/360, for a bond in its last coupon period">Mmkt (Act/360)</td><td className="num">{Number.isFinite(mmkt) ? fmtNum(mmkt, 6) : ''}</td></tr>
              <tr><td className="amber" title="Needs a holiday calendar to move each payment to its business day; the app has none">True Yield</td><td className="num">--</td></tr>
              <tr><td className="amber">Current Yield</td><td className="num">{fmtNum(currentYield(terms.coupon, r.clean), 3)}</td></tr>
            </tbody></table>
          </div>
          <div>
            <div className="yas-strip">Invoice</div>
            <table className="tbl yas-tbl"><tbody>
              <tr><td className="amber">Face</td><td className="num">{fmtNum(inv.face, 0)}</td></tr>
              <tr><td className="amber">Principal</td><td className="num">{fmtNum(inv.principal, 2)}</td></tr>
              <tr><td className="amber">Accrued ({inv.days} Days)</td><td className="num">{fmtNum(inv.accrued, 2)}</td></tr>
              <tr><td className="amber">Total{sec?.ccy ? ` (${sec.ccy})` : ''}</td><td className="num white">{fmtNum(inv.total, 2)}</td></tr>
            </tbody></table>
          </div>
        </div>
        <div className="yas-tax">
          <span className="amber">After Tax (Inc</span>
          <input className="inp yas-mini" aria-label="Income tax %" value={incTax} onChange={(e) => setIncTax(e.target.value)} />
          <span className="amber">% CG</span>
          <input className="inp yas-mini" aria-label="Capital gains tax %" value={cgTax} onChange={(e) => setCgTax(e.target.value)} />
          <span className="amber">%)</span>
          <span className="white" data-testid="bond-after-tax">{Number.isFinite(afterTax) ? fmtNum(afterTax, 6) : '--'}</span>
        </div>
      </div>
      <Section title="Zero curve for Z-Sprd">
        <div className="pad-s"><label className="fld" style={{ display: 'block', whiteSpace: 'normal' }}>Zero curve: years from settlement, continuous zero %<textarea className="inp" aria-label="Bond zero curve" rows={4} value={form.curve} onChange={(e) => set('curve', e.target.value)} placeholder={'1,3\n5,3\n10,3'} spellCheck={false} style={{ width: 'min(100%, 500px)', display: 'block' }} /></label></div>
        <p className="pad-s muted">ACT/365F cash-flow times; log-linear discount factors from settlement, no extrapolation. A constant continuous spread is added at every payment date. Treasury par yields must be bootstrapped into zero rates before use.</p>
        {spreadError ? <div className="pad-s amber" role="status">{spreadError}</div> : spread ? <>
          <KV items={[
            ['Z-spread bp', <span key="z" data-testid="bond-z-spread">{fmtNum(spread.spreadBp, 6)}</span>],
            ['Zero-spread clean price / 100', fmtNum(spread.zeroSpreadClean, 6)], ['Spread duration (years)', fmtNum(spread.spreadDuration, 6)],
            ['Z01 per 100 face', fmtNum(spread.z01, 6)], ['Z01 for face amount', fmtNum(spread.z01 * face / 100, 2)],
          ]} />
          <table className="tbl"><thead><tr><th>Z-spread shift bp</th><th className="num">Clean / 100</th><th className="num">P&L for face amount</th></tr></thead><tbody>{spread.scenarios.map((s) => <tr key={s.bp}><td>{s.bp}</td><td className="num">{fmtNum(s.clean, 6)}</td><td className="num">{fmtNum((s.clean - r.clean) * face / 100, 2)}</td></tr>)}</tbody></table>
        </> : <p className="pad-s muted">Enter a zero curve to solve Z-spread. This is an option-free spread, not an option-adjusted spread.</p>}
      </Section>
    </> : tab === 2 ? <>
      <div className="cols">
        <Section title="Price / yield"><XYChart height={210} series={[{ label: 'Clean price / 100', color: '#ffb547', points }]} xFormat={(v) => `${fmtNum(v, 2)}%`} yFormat={(v) => fmtNum(v, 2)} /></Section>
      </div>
      <div className="cols"><Section title="Parallel yield scenarios"><table className="tbl"><thead><tr><th>Shift bp</th><th className="num">Clean / 100</th><th className="num">Price change</th><th className="num">P&L</th></tr></thead>
        <tbody>{scenarios.map((s) => <tr key={s.bp}><td>{s.bp > 0 ? '+' : ''}{s.bp}</td><td className="num">{fmtNum(s.price, 6)}</td><td className="num">{fmtNum(s.change, 6)}</td><td className="num">{fmtNum(s.pnl, 2)}</td></tr>)}</tbody></table></Section>
</div>
    </> : tab === 3 ? <>
      <div className="cols"><Section title="Cash flows" right={`${cash.length} payments`}><div style={{ maxHeight: 300, overflow: 'auto' }}><table className="tbl"><thead><tr><th>Payment date</th><th className="num">Cash flow / 100</th><th className="num">PV / 100</th></tr></thead>
          <tbody>{cash.map((c) => <tr key={c.date.getTime()}><td>{fmtDay(c.date.getTime(), true)}</td><td className="num">{fmtNum(c.amount, 6)}</td><td className="num">{fmtNum(c.pv, 6)}</td></tr>)}</tbody></table></div></Section></div>

    </> : tab === 4 ? <>
      <div className="cols">
        <Section title="Price and yield"><KV items={[
          ['Clean price / 100', <span key="p" data-testid="bond-clean" className="white b">{fmtNum(r.clean, 6)}</span>],
          ['Price in 32nds (rounded to 1/64)', to32nds(r.clean)], ['Yield %', <span key="y" data-testid="bond-yield">{fmtNum(r.yield, 6)}</span>],
          ['Accrued interest / 100', <span key="a" data-testid="bond-accrued">{fmtNum(r.accrued, 6)}</span>],
          [`Accrued days of period (${r.basis})`, <span key="d" data-testid="bond-accrued-days">{`${r.accruedDays} of ${fmtNum(r.periodDays, Number.isInteger(r.periodDays) ? 0 : 1)}`}</span>],
          ['Periods to next coupon (DSC/E)', fmtNum(r.fraction, 6)], ['Dirty price / 100', fmtNum(r.dirty, 6)],
          ['Invoice amount', fmtNum(r.dirty / 100 * face, 2)], ['Settlement', `${fmtDay(settle.getTime(), true)}${form.lag === 'manual' ? ' (entered)' : ` (${lagLabel.replace(/ \(.*\)$/, '')} from ${fmtDay(trade.getTime(), true)})`}`],
          ['Previous / next coupon', `${fmtDay(r.prevCoupon.getTime(), true)} / ${fmtDay(r.nextCoupon.getTime(), true)}`],
        ]} /></Section>
        <Section title="Risk"><KV items={[
          ['Macaulay duration (years)', fmtNum(r.macaulay, 6)], ['Modified duration', fmtNum(r.modified, 6)], ['Convexity', fmtNum(r.convexity, 6)],
          ['DV01 per 100 face', fmtNum(r.dv01, 6)], ['DV01 for face amount', fmtNum(r.dv01 * face / 100, 2)], ['Remaining coupons', String(r.remaining)],
        ]} /></Section>
      </div>
    </> : <>
      <Section title="Call schedule: yield to call and to worst">
        <div className="pad-s"><label className="fld" style={{ display: 'block', whiteSpace: 'normal' }}>Calls: one a line, date and price per 100<textarea className="inp" aria-label="Call schedule" rows={4} value={form.calls} onChange={(e) => set('calls', e.target.value)} placeholder={'2028-06-15, 102\n2029-06-15, 101\n2030-06-15, 100'} spellCheck={false} style={{ width: 'min(100%, 500px)', display: 'block' }} /></label></div>
        {callError ? <div className="pad-s amber" role="status">{callError}</div> : work ? <>
          <KV items={[
            ['Yield to worst %', <span key="ytw" data-testid="bond-ytw">{fmtNum(work.toWorst?.yield, 6)}</span>],
            ['Workout date', <span key="wd" data-testid="bond-workout">{work.toWorst ? `${fmtDay(work.toWorst.date.getTime(), true)} (${work.toWorst.kind === 'call' ? `call at ${fmtNum(work.toWorst.price, 3)}` : 'maturity'})` : '--'}</span>],
            [`Price to worst / 100 at ${fmtNum(r.yield, 4)}%`, <span key="ptw" data-testid="bond-ptw">{fmtNum(work.priceToWorst?.cleanAtYield, 6)}</span>],
          ]} />
          <table className="tbl" data-testid="bond-calls"><thead><tr><th>Redemption</th><th>Date</th><th className="num">Price / 100</th><th className="num" title={`The yield at which this redemption gives the clean price ${fmtNum(r.clean, 6)}`}>Yield %</th><th className="num" title={`The clean price of this redemption at the yield ${fmtNum(r.yield, 6)}%`}>Clean / 100 at {fmtNum(r.yield, 4)}%</th></tr></thead>
            <tbody>{work.rows.map((w) => <tr key={w.date.getTime()} className={w === work.toWorst ? 'white b' : undefined}><td>{w.kind === 'call' ? 'Call' : 'Maturity'}{w === work.toWorst ? ' (worst)' : ''}</td><td>{fmtDay(w.date.getTime(), true)}</td><td className="num">{fmtNum(w.price, 3)}</td><td className="num">{fmtNum(w.yield, 6)}</td><td className="num">{fmtNum(w.cleanAtYield, 6)}</td></tr>)}</tbody></table>
          {skipped && <p className="pad-s muted">Left out: {skipped}.</p>}
        </> : <p className="pad-s muted">{skipped ? `No call between settlement and maturity (left out: ${skipped}).` : 'Type the call dates and prices to get the yield to each call and the yield to worst.'}</p>}
        <p className="pad-s muted">Each call is treated as a redemption on its date at its price: the coupons on the bond&apos;s schedule before it, then the price and the coupon accrued since the last coupon date, discounted at the yield as for maturity. The yield to worst is the lowest of the yields to each call and to maturity, from the clean price above; the price to worst is the lowest clean price at the yield above. The option itself has no value here: this is not an option-adjusted spread. Price, accrued and the risk measures above are to maturity.</p>
      </Section>
    </>}
    <p className="pad-s muted">Regular fixed-rate bullet, nominal yield compounded at coupon frequency. {basisLabel}: accrued interest is coupon/frequency × accrued days / period days and the first cash flow is discounted DSC/E periods, both on that day count. Settlement lags count weekdays only, with no holiday calendar. Dates are unadjusted. Confirm contractual settlement, day count and coupon schedule; calls count only as typed in the call schedule, and stubs, sinking funds, defaults and taxes are outside this model.</p>
  </div>;
}

/** A FedInvest Treasury's coupon, maturity, and Sell price with its day, or nothing for any other security. */
function fedPriced(sec?: SecurityDef): { coupon: number; maturity: string; price: number; date: string } | undefined {
  if (!sec?.bond || !fedinvestOwns(sec.id)) return undefined;
  const day = fedinvest.get().latest;
  const cusip = sec.alias?.[0];
  const row = cusip ? day?.rows.get(cusip) : undefined;
  if (!day || !row || !Number.isFinite(row.sell)) return undefined;
  return { coupon: sec.bond.coupon, maturity: sec.bond.maturity, price: row.sell, date: day.date };
}
