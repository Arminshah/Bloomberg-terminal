import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { KV, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtMln, fmtNum, fmtPct } from '../core/format';
import { engine, useTick } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { lineOf, staleSince } from '../data/world-bonds';
import { closeAt, defaultBeta } from '../data/analytics';
import { financials, keyStats, latestDebtPeriod, reportCcy, type FinPeriod } from '../data/fundamentals';
import { riskFree } from '../data/options';
import type { FnProps } from '../terminal/types';
import { sourceLabel } from '../components/Source';
import { useFundamentals } from '../data/live/yfund';
import { adjustedBeta, defaultBenchmark, lookbackStart, pairedReturns, periodCloses } from '../finance/beta';
import { regress } from '../finance/stats';
import { UNRATED_AF, capitalStructure, costOfDebtFallback, costOfEquity, costOfPreferred, economicValueAdded, waccOf } from '../finance/wacc';
import { useMenu, usePanelId } from '../terminal/panel';

export const BENCH: Record<string, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };

/** The 10-year government yield the app has from an official source, per currency. */
export const TEN_YEAR: Record<string, { id: string; name: string }> = {
  USD: { id: 'USGG10YR Index', name: 'US 10-year Treasury' },
  EUR: { id: 'GDBR10 Index', name: 'German 10-year Bund' },
  GBP: { id: 'GUKG10 Index', name: 'UK 10-year gilt' },
  JPY: { id: 'GJGB10 Index', name: 'Japan 10-year JGB' },
  CAD: { id: 'GCAN10YR Index', name: 'Canada 10-year' },
  AUD: { id: 'GACGB10 Index', name: 'Australia 10-year' },
};

/** The short government rate for short-term debt: the 1-year where the app has it, otherwise the shortest it has. */
export const SHORT_RATE: Record<string, { id: string; name: string }> = {
  USD: { id: 'USGG12M Index', name: 'US 1-year Treasury' },
  EUR: { id: 'GDBR2 Index', name: 'German 2-year (the shortest the app has)' },
  JPY: { id: 'GJGB2 Index', name: 'Japan 2-year (the shortest the app has)' },
  CAD: { id: 'GCAN2YR Index', name: 'Canada 2-year (the shortest the app has)' },
  AUD: { id: 'GACGB2 Index', name: 'Australia 2-year (the shortest the app has)' },
};

type HistField = 'WACC' | 'EVA' | 'ROIC' | 'EVA Spread';
const HIST_FIELDS: HistField[] = ['WACC', 'EVA', 'ROIC', 'EVA Spread'];
const HIST_COLORS: Record<HistField, string> = { WACC: '#ffd23f', EVA: '#45d3e6', ROIC: '#2fd36b', 'EVA Spread': '#ff9e1b' };
const PIE_COLORS = { mcap: '#1f43e0', st: '#e0261f', lt: '#f0a020', pref: '#2fb050' };

/** Raw beta from two years of weekly returns ending at `to`, as BETA computes it; NaN without 52 weeks in common. */
function betaAt(id: string, bench: string, to: number): number {
  const b = engine.daily(bench);
  const y = engine.daily(id);
  if (!b.length || !y.length) return NaN;
  const from = lookbackStart(to, 24);
  const r = pairedReturns(periodCloses(b, 'W', from, to), periodCloses(y, 'W', from, to));
  return r.x.length >= 52 ? regress(r.x, r.y).beta : NaN;
}

const pctOr = (v: number, dec = 1) => (Number.isFinite(v) ? `${fmtNum(v, dec)}%` : '--');

/**
 * WACC, as the 2022 screen in the reference pack lays it out (Babson's "WACC Components", p.4): Period, Cost of Capital
 * at current market value (3) Equity, 4) Debt Cost (A-T), 5) Preferred Equity, WACC) with Weight, Cost and W x C, the
 * Capital Structure as a pie and its lines, 6) History of WACC, EVA, ROIC or EVA Spread, and Economic Value Added
 * (7) Net Operating Profit, 8) Cash Operating Taxes, NOPAT, 9) Total Investment Capital, Capital Charge, EVA, ROIC,
 * EVA Spread). The formulas are the help page's (`src/finance/wacc.ts`).
 */
export function WACC({ sec }: FnProps) {
  useTick(5);
  const s = sec!;
  const panel = usePanelId();
  const { real, status } = useFundamentals(s);
  const ks = keyStats(s);
  const f = financials(s);
  const beta = defaultBeta(s.id);
  const betaFromHistory = Number.isFinite(beta.raw);
  const rawBeta = betaFromHistory ? beta.raw : ks.beta;
  const adjBeta = adjustedBeta(rawBeta);
  const [erp, setErp] = useState(5.5);
  const [af, setAf] = useState(UNRATED_AF);
  const [growth, setGrowth] = useState(2.5);
  const [period, setPeriod] = useState('MR');
  const [detail, setDetail] = useState<'equity' | 'debt' | 'preferred' | 'eva' | null>(null);
  const [hist, setHist] = useState<HistField>('WACC');
  const ccy = reportCcy(s);
  const rfLine = TEN_YEAR[ccy];
  const shortLine = SHORT_RATE[ccy];
  // A rate line whose latest close is more than ten days old has not caught up with its source (the Treasury's current
  // year still loading leaves 31 December's close as the latest): it is not used until it has.
  const today = engine.today * DAY_MS;
  const rateNow = (id: string) => {
    const l = lineOf(engine.daily(id));
    return engine.realOnly && (!l.t.length || staleSince(l, today) !== null) ? NaN : (engine.quote(id)?.last ?? NaN);
  };
  const rfWaiting = !!rfLine && engine.realOnly && !Number.isFinite(rateNow(rfLine.id));
  const rf = rfLine ? rateNow(rfLine.id) : engine.realOnly ? NaN : riskFree(s) * 100 + 0.6;
  const kstNow = shortLine ? rateNow(shortLine.id) : NaN;
  const tradeCcy = s.ccy === 'GBp' ? 'GBP' : s.ccy;
  const fx = ccy === tradeCcy ? 1 : engine.usdValue(tradeCcy) / engine.usdValue(ccy);
  const ke = costOfEquity(rf, adjBeta, erp);
  const ltm = f.ltm;
  const fy = period === 'MR' ? undefined : f.annual.find((p) => p.label === period);
  // MR: the latest balance sheet and the trailing twelve months; a fiscal year: that year's statements.
  const balance = fy ?? latestDebtPeriod([...f.quarterly, ...f.annual, ltm, ...(real?.balance ? [real.balance] : [])]);
  const income: FinPeriod = fy ?? ltm;
  const debt = balance?.debt ?? NaN;
  const split = balance && Number.isFinite(balance.debtST ?? NaN) && Number.isFinite(balance.debtLT ?? NaN);
  // Without the source's split all debt counts as long-term, and the screen says so.
  const stDebt = split ? balance!.debtST! : 0;
  const ltDebt = split ? balance!.debtLT! : debt;
  const taxKnown = income.pretax > 0 && Number.isFinite(income.tax);
  const taxRate = taxKnown ? income.tax / income.pretax : 0.21;
  const kstUsed = Number.isFinite(kstNow) ? kstNow : rf;
  const kd = costOfDebtFallback(stDebt, ltDebt, kstUsed, rf, af, taxRate);
  // The company's own effective rate, shown beside the help page's method: interest expense over total debt.
  const effective = debt > 0 && Number.isFinite(income.interest) ? (Math.abs(income.interest) / debt) * 100 : NaN;
  const preferred = balance?.preferred ?? NaN;
  const prefDiv = income.niTotal - income.ni;
  const kp = costOfPreferred(prefDiv, preferred);
  const E = ks.mcap * fx;
  const { cap, wacc } = waccOf(capitalStructure(E, stDebt, ltDebt, preferred), ke, kd.after, kp);
  const minority = Number.isFinite(balance?.minority ?? NaN) ? balance!.minority! : 0;
  const tic = debt + (balance?.equity ?? NaN) + minority + (Number.isFinite(preferred) ? preferred : 0);
  const nop = income.opInc;
  const eva = economicValueAdded(nop, nop * taxRate, tic, wacc);
  const noDebt = !(debt > 0);

  // History: each fiscal year at its year-end market value, rates and beta, with that year's statements.
  const benchId = defaultBenchmark(s, (x) => !!engine.get(x));
  const history = f.annual
    .filter((p) => Number.isFinite(p.end))
    .map((p) => {
      const px = closeAt(engine.daily(s.id), p.end);
      const mcap = px * (Number.isFinite(p.shares) ? p.shares : ks.shares) * fx;
      const rfY = rfLine ? closeAt(engine.daily(rfLine.id), p.end) : NaN;
      const kstY = shortLine ? closeAt(engine.daily(shortLine.id), p.end) : NaN;
      const bY = betaAt(s.id, benchId, p.end);
      const keY = costOfEquity(rfY, adjustedBeta(bY), erp);
      const splitY = Number.isFinite(p.debtST ?? NaN) && Number.isFinite(p.debtLT ?? NaN);
      const taxY = p.pretax > 0 && Number.isFinite(p.tax) ? p.tax / p.pretax : 0.21;
      const kdY = costOfDebtFallback(splitY ? p.debtST! : 0, splitY ? p.debtLT! : p.debt, Number.isFinite(kstY) ? kstY : rfY, rfY, af, taxY);
      const kpY = costOfPreferred(p.niTotal - p.ni, p.preferred ?? NaN);
      const w = waccOf(capitalStructure(mcap, splitY ? p.debtST! : 0, splitY ? p.debtLT! : p.debt, p.preferred ?? NaN), keY, kdY.after, kpY).wacc;
      const ticY = p.debt + p.equity + (Number.isFinite(p.minority ?? NaN) ? p.minority! : 0) + (Number.isFinite(p.preferred ?? NaN) ? p.preferred! : 0);
      const e = economicValueAdded(p.opInc, p.opInc * taxY, ticY, w);
      return { end: p.end, label: p.label, WACC: w, EVA: e.eva, ROIC: e.roic, 'EVA Spread': e.spread };
    });
  const histPoints = history.filter((h) => Number.isFinite(h[hist])).map((h) => ({ x: h.end, y: h[hist] }));

  useMenu('wacc', [
    { n: 3, label: 'Equity', run: () => setDetail((d) => (d === 'equity' ? null : 'equity')) },
    { n: 4, label: 'Debt Cost (A-T)', run: () => setDetail((d) => (d === 'debt' ? null : 'debt')) },
    { n: 5, label: 'Preferred Equity', run: () => setDetail((d) => (d === 'preferred' ? null : 'preferred')) },
    { n: 6, label: 'History', run: () => setHist((h) => HIST_FIELDS[(HIST_FIELDS.indexOf(h) + 1) % HIST_FIELDS.length]) },
    { n: 7, label: 'Net Operating Profit', run: () => setDetail('eva') },
    { n: 8, label: 'Cash Operating Taxes', run: () => setDetail('eva') },
    { n: 9, label: 'Total Investment Capital', run: () => setDetail('eva') },
  ]);

  const rows = () => [
    ['Weighted Average Cost of Capital', s.id, period === 'MR' ? 'MR' : period],
    ['Component', 'Weight %', 'Cost %', 'W x C %'],
    ['Equity', cap.we * 100, ke, cap.we * ke],
    ['Debt Cost (A-T)', cap.wd * 100, kd.after, cap.wd * kd.after],
    ['Preferred Equity', cap.wp * 100, kp, cap.wp > 0 ? cap.wp * kp : 0],
    ['WACC', 100, wacc, wacc],
    [`Capital structure (millions of ${ccy})`, 'Value', 'Weight %'],
    ['Market Cap', cap.mcap, cap.we * 100], ['ST Debt', cap.stDebt, cap.wst * 100], ['LT Debt', cap.ltDebt, cap.wlt * 100], ['Pref. Eqty', cap.preferred, cap.wp * 100], ['Total', cap.total, 100],
    [`Economic value added (millions of ${ccy})`, ''],
    ['Net Operating Profit', eva.nop], ['Cash Operating Taxes', eva.cashTaxes], ['NOPAT', eva.nopat], ['Total Investment Capital', eva.tic], ['Capital Charge', eva.charge], ['Economic Value Added', eva.eva], ['ROIC %', eva.roic], ['EVA Spread %', eva.spread],
    ['Inputs', ''], ['Risk-free %', rf], ['Raw beta', rawBeta], ['Adjusted beta', adjBeta], ['Equity risk premium %', erp], ['Short rate %', kstUsed], ['Adjustment factor', af], ['Effective tax rate', taxRate],
  ];
  const report = exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}-wacc.csv`, rows);
  const pie = pieSlices([
    [cap.mcap, PIE_COLORS.mcap],
    [cap.stDebt, PIE_COLORS.st],
    [cap.ltDebt, PIE_COLORS.lt],
    [cap.preferred, PIE_COLORS.pref],
  ]);
  const periodLabel = period === 'MR' ? (balance ? `${balance.label} (balance ${fmtDay(balance.end)})` : '--') : period;
  return (
    <div className="wacc">
      <FnHeader
        code="WACC"
        title="Weighted Average Cost of Capital"
        sec={s}
        actions={[{ n: 1, label: 'Create Report', title: 'Save the WACC, its components, the capital structure and EVA as a CSV file', onClick: () => (report.find((a) => a.label === 'Export') ?? report[0]).onClick() }]}
        sub={<>{status === 'ok' && real?.statementsFrom === 'SEC EDGAR' ? <><span className="badge live">REAL</span> SEC EDGAR statements</> : sourceLabel(status, 'balance sheet generated; real data needs the desktop app')}</>}
      />
      <div className="wacc-period">
        <span className="amber">Period</span>
        <select className="sel-inp" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="MR">MR</option>
          {[...f.annual].reverse().map((p) => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
        <span className="white" data-testid="wacc-period">{periodLabel}</span>
      </div>
      <div className="wacc-grid">
        <section className="wacc-box" aria-label="Cost of Capital">
          <div className="wacc-name">{s.name}</div>
          <div className="wacc-box-h">Cost of Capital - Current Market Value</div>
          <table className="tbl wacc-tbl" data-testid="wacc-cost">
            <thead>
              <tr>
                <th />
                <th className="num">Weight</th>
                <th className="num">Cost</th>
                <th className="num">W x C</th>
              </tr>
            </thead>
            <tbody>
              <tr className="click" onClick={() => setDetail(detail === 'equity' ? null : 'equity')}>
                <td className="amber"><b className="rowno">3)</b> Equity</td>
                <td className="num amber">{pctOr(cap.we * 100)}</td>
                <td className="num amber">{pctOr(ke)}</td>
                <td className="num amber">{pctOr(cap.we * ke)}</td>
              </tr>
              <tr className="click" onClick={() => setDetail(detail === 'debt' ? null : 'debt')}>
                <td className="amber"><b className="rowno">4)</b> Debt Cost (A-T)</td>
                <td className="num amber">{pctOr(cap.wd * 100)}</td>
                <td className="num amber">{cap.wd > 0 ? pctOr(kd.after) : pctOr(0)}</td>
                <td className="num amber">{pctOr(cap.wd > 0 ? cap.wd * kd.after : 0)}</td>
              </tr>
              <tr className="click" onClick={() => setDetail(detail === 'preferred' ? null : 'preferred')}>
                <td className="amber"><b className="rowno">5)</b> Preferred Equity</td>
                <td className="num amber">{pctOr(cap.wp * 100)}</td>
                <td className="num amber">{cap.wp > 0 ? pctOr(kp) : pctOr(0)}</td>
                <td className="num amber">{pctOr(cap.wp > 0 ? cap.wp * kp : 0)}</td>
              </tr>
              <tr className="wacc-total">
                <td>WACC</td>
                <td />
                <td />
                <td className="num" data-testid="wacc-value">{pctOr(wacc)}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="wacc-box" aria-label="Capital Structure">
          <div className="wacc-box-h">Capital Structure (Millions of {ccy})</div>
          <div className="wacc-cap">
            <svg viewBox="-1 -1 2 2" className="wacc-pie" aria-hidden="true">
              {pie.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
            </svg>
            <table className="tbl wacc-tbl" data-testid="wacc-capital">
              <tbody>
                {([['Market Cap', cap.mcap, cap.we, PIE_COLORS.mcap], ['ST Debt', cap.stDebt, cap.wst, PIE_COLORS.st], ['LT Debt', cap.ltDebt, cap.wlt, PIE_COLORS.lt], ['Pref. Eqty', cap.preferred, cap.wp, PIE_COLORS.pref]] as const).map(([label, v, w, c]) => (
                  <tr key={label}>
                    <td><i className="wacc-key" style={{ background: c }} />{label}</td>
                    <td className="num amber">{Number.isFinite(cap.total) ? fmtNum(v, 1) : '--'}</td>
                    <td className="num amber">{pctOr(w * 100)}</td>
                  </tr>
                ))}
                <tr className="wacc-total">
                  <td>Total</td>
                  <td className="num">{Number.isFinite(cap.total) ? fmtNum(cap.total, 1) : '--'}</td>
                  <td className="num">{Number.isFinite(cap.total) ? '100.0%' : '--'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="wacc-box" aria-label="History">
          <div className="wacc-box-h"><b className="rowno">6)</b> History</div>
          <div className="wacc-hist-keys" role="radiogroup" aria-label="History field">
            {HIST_FIELDS.map((h) => (
              <label key={h} className="chk">
                <input type="radio" name={`wacc-hist-${panel}`} checked={hist === h} onChange={() => setHist(h)} />
                <span style={{ color: HIST_COLORS[h] }}>{h}</span>
              </label>
            ))}
          </div>
          {histPoints.length > 1 ? (
            <XYChart height={170} series={[{ label: hist, color: HIST_COLORS[hist], points: histPoints, markers: true }]} xTicks={history.filter((h) => Number.isFinite(h[hist])).map((h) => ({ v: h.end, label: h.label }))} yFormat={(v) => (hist === 'EVA' ? fmtMln(v) : `${fmtNum(v, 1)}%`)} />
          ) : (
            <div className="empty">{history.length ? `Not enough fiscal years with ${hist} figures: each year needs its statements${hist === 'ROIC' ? '' : ', and its year-end price, rates and two years of weekly prices before it'}.` : 'No fiscal years from the source yet.'}</div>
          )}
        </section>
        <section className="wacc-box" aria-label="Economic Value Added">
          <div className="wacc-box-h">Economic Value Added (Millions of {ccy})</div>
          <table className="tbl wacc-tbl" data-testid="wacc-eva">
            <tbody>
              <tr className="click" onClick={() => setDetail('eva')}><td className="amber"><b className="rowno">7)</b> Net Operating Profit</td><td className="num amber">{fmtNum(eva.nop, 2)}</td></tr>
              <tr className="click" onClick={() => setDetail('eva')}><td className="amber"><b className="rowno">8)</b> Cash Operating Taxes</td><td className="num amber">{fmtNum(eva.cashTaxes, 2)}</td></tr>
              <tr><td className="amber">NOPAT</td><td className="num amber">{fmtNum(eva.nopat, 2)}</td></tr>
              <tr className="wacc-gap click" onClick={() => setDetail('eva')}><td className="amber"><b className="rowno">9)</b> Total Investment Capital</td><td className="num amber">{fmtNum(eva.tic, 2)}</td></tr>
              <tr><td className="amber">Capital Charge</td><td className="num amber">{fmtNum(eva.charge, 2)}</td></tr>
              <tr className="wacc-gap"><td className="amber">Economic Value Added</td><td className="num amber">{fmtNum(eva.eva, 2)}</td></tr>
              <tr className="wacc-gap"><td className="amber">ROIC</td><td className="num amber">{pctOr(eva.roic, 2)}</td></tr>
              <tr><td className="amber">EVA Spread</td><td className="num amber">{pctOr(eva.spread, 2)}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
      {detail === 'equity' ? (
        <Section title="3) Cost of Equity">
          <KV
            items={[
              [rfLine ? `Risk-free rate (${rfLine.name})` : 'Risk-free rate', Number.isFinite(rf) ? `${fmtNum(rf, 3)}%` : rfWaiting ? `-- (waiting for the ${rfLine!.name}'s latest close)` : `-- (no official 10-year ${ccy} yield in this app)`],
              [betaFromHistory ? `Raw beta (2Y weekly vs ${beta.bench.replace(/ Index$/, '')}, as BETA)` : `Provider beta (${real?.statsFrom ?? 'Yahoo'} historical basis)`, fmtNum(rawBeta, 3)],
              ['Adjusted beta (0.67 × raw + 0.33)', fmtNum(adjBeta, 3)],
              ['Equity risk premium', <input key="erp" type="number" step="0.25" className="inp" style={{ width: 80, textAlign: 'right' }} value={erp} onChange={(e) => setErp(Number(e.target.value) || 0)} aria-label="Equity risk premium" />],
              ['Cost of equity (risk-free + adjusted beta × premium)', <span key="ke" className="white b">{fmtNum(ke, 2)}%</span>],
            ]}
          />
        </Section>
      ) : null}
      {detail === 'debt' ? (
        <Section title="4) Cost of Debt">
          <KV
            items={[
              [split ? `Short-term debt (as of ${fmtDay(balance!.end)})` : 'Short-term debt', split ? `${fmtMln(stDebt)} ${ccy}` : '-- (the source gives no split: all debt counted as long-term)'],
              [balance ? `Long-term debt (as of ${fmtDay(balance.end)})` : 'Long-term debt', `${fmtMln(ltDebt)} ${ccy}`],
              [shortLine ? `Short rate (${shortLine.name})` : 'Short rate', Number.isFinite(kstNow) ? `${fmtNum(kstNow, 3)}%` : `${fmtNum(rf, 3)}% (no short ${ccy} rate in this app: the 10-year)`],
              [rfLine ? `Long rate (${rfLine.name})` : 'Long rate', Number.isFinite(rf) ? `${fmtNum(rf, 3)}%` : '--'],
              ['Adjustment factor (1.38 for an unrated issuer)', <input key="af" type="number" step="0.01" className="inp" style={{ width: 80, textAlign: 'right' }} value={af} onChange={(e) => setAf(Number(e.target.value) || 0)} aria-label="Adjustment factor" />],
              ['Pre-tax cost of debt', `${fmtNum(kd.pre, 2)}%`],
              [taxKnown ? 'Effective tax rate (tax / pretax income)' : 'Tax rate (assumed: no pretax profit)', fmtPct(taxRate * 100, 1, false)],
              ['After-tax cost of debt', <span key="kd" className="white b">{fmtNum(kd.after, 2)}%</span>],
              ['The company\'s own rate (interest expense / debt), for comparison', Number.isFinite(effective) ? `${fmtNum(effective, 2)}% pre-tax` : '--'],
            ]}
          />
        </Section>
      ) : null}
      {detail === 'preferred' ? (
        <Section title="5) Cost of Preferred Equity">
          <KV
            items={[
              ['Preferred equity', Number.isFinite(preferred) ? `${fmtMln(preferred)} ${ccy}` : '--'],
              ['Preferred dividends (net income less net income to common)', Number.isFinite(prefDiv) ? `${fmtMln(prefDiv)} ${ccy}` : '--'],
              ['Cost of preferred', Number.isFinite(kp) ? `${fmtNum(kp, 2)}%` : '-- (left out of WACC: no positive preferred dividends or equity)'],
            ]}
          />
        </Section>
      ) : null}
      {detail === 'eva' ? (
        <Section title="7) to 9) Economic Value Added inputs">
          <KV
            items={[
              ['Net operating profit', `operating income, ${income === ltm ? 'trailing twelve months' : income.label}`],
              ['Cash operating taxes', `net operating profit × the effective tax rate (${fmtPct(taxRate * 100, 1, false)})`],
              ['Total investment capital', `total debt + shareholders' equity${minority ? ' + minority interest' : ''}${Number.isFinite(preferred) && preferred > 0 ? ' + preferred' : ''}, ${balance ? fmtDay(balance.end) : ''}`],
              ['Capital charge', `total investment capital × WACC (${pctOr(wacc, 2)})`],
            ]}
          />
        </Section>
      ) : null}
      <Section title={`Perpetuity check (Gordon growth on free cash flow)`}>
        <Perpetuity s={s} f={f} wacc={wacc} debt={debt} cash={balance?.cash ?? NaN} growth={growth} setGrowth={setGrowth} ccy={ccy} fx={fx} tradeCcy={tradeCcy} />
      </Section>
      <div className="note">
        {'Rough approximation for WACC: the app has no fair market curve for the issuer, so the cost of debt is the government short and long rates weighted by short- and long-term debt, times the adjustment factor and one minus the effective tax rate. '}
        {!betaFromHistory ? 'The app has under 52 weeks of matched prices for its own beta, so the provider\'s is used. ' : ''}
        {noDebt ? 'No debt on the latest balance sheet. ' : ''}
        Market cap is the current market value. Net operating profit is operating income and cash operating taxes are that times the effective tax rate; total investment capital is debt plus book equity. The provider adjusts all three by industry, which the app cannot, so EVA and ROIC are approximations. The equity risk premium and the adjustment factor are inputs; the 21% tax rate is used only without a pretax profit.
        {Number.isFinite(ltm.end) ? ` Trailing twelve months end ${fmtDay(ltm.end)}.` : ''}
        {balance?.supplements?.length ? ` Balance supplements: ${balance.supplements.join('; ')}.` : ''}
      </div>
    </div>
  );
}

/** SVG pie slices for the capital structure, starting at twelve o'clock, clockwise. */
function pieSlices(parts: [number, string][]): { d: string; color: string }[] {
  const vals = parts.map(([v, c]) => [Number.isFinite(v) && v > 0 ? v : 0, c] as const);
  const total = vals.reduce((a, [v]) => a + v, 0);
  if (!(total > 0)) return [];
  let a0 = -Math.PI / 2;
  const out: { d: string; color: string }[] = [];
  for (const [v, color] of vals) {
    if (!v) continue;
    const frac = v / total;
    if (frac >= 0.9999) {
      out.push({ d: 'M 0 -1 A 1 1 0 1 1 -0.0001 -1 Z', color });
      continue;
    }
    const a1 = a0 + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    out.push({ d: `M 0 0 L ${Math.cos(a0)} ${Math.sin(a0)} A 1 1 0 ${large} 1 ${Math.cos(a1)} ${Math.sin(a1)} Z`, color });
    a0 = a1;
  }
  return out;
}

/** The app's own Gordon-growth check on free cash flow, kept from the earlier WACC screen. */
function Perpetuity({ s, f, wacc, debt, cash, growth, setGrowth, ccy, fx, tradeCcy }: { s: NonNullable<FnProps['sec']>; f: ReturnType<typeof financials>; wacc: number; debt: number; cash: number; growth: number; setGrowth: (g: number) => void; ccy: string; fx: number; tradeCcy: string }) {
  const ks = keyStats(s);
  const ltm = f.ltm;
  const lastYearFcf = [...f.annual].reverse().find((p) => Number.isFinite(p.fcf));
  const fcfBasis = Number.isFinite(ltm.fcf) ? 'LTM' : lastYearFcf ? `FY ${new Date(lastYearFcf.end).getUTCFullYear()}` : 'LTM';
  const fcf = Number.isFinite(ltm.fcf) ? ltm.fcf : lastYearFcf?.fcf ?? NaN;
  const tv = (fcf * (1 + growth / 100)) / ((wacc - growth) / 100);
  const implied = (tv - (debt - cash)) / ks.shares;
  return (
    <KV
      items={[
        [`${fcfBasis} free cash flow`, Number.isFinite(fcf) ? `${fmtMln(fcf)} ${ccy}` : 'Not reported (no cash flow statement from the source)'],
        ['Terminal growth', <input key="g" type="number" step="0.25" className="inp" style={{ width: 80, textAlign: 'right' }} value={growth} onChange={(e) => setGrowth(Number(e.target.value) || 0)} aria-label="Terminal growth" />],
        ['Enterprise value', !Number.isFinite(fcf) ? 'Not available: no free cash flow' : !(fcf > 0) ? 'NM (free cash flow is not positive)' : !Number.isFinite(wacc) ? 'Not available: WACC inputs missing' : wacc > growth ? `${fmtMln(tv)} ${ccy}` : 'Growth must be below WACC'],
        ['Implied value per share', fcf > 0 && wacc > growth && Number.isFinite(implied) ? `${fmtNum(implied, 2)} ${ccy}` : 'NM'],
        ['Current price', `${fmtNum(ks.price * fx, 2)} ${ccy}${fx !== 1 ? ` (converted from ${tradeCcy})` : ''}`],
      ]}
    />
  );
}
