import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { KV, Section } from '../components/cells';
import { fmtMln, fmtNum, fmtPct } from '../core/format';
import { engine } from '../data/market';
import { betaTo } from '../data/analytics';
import { financials, keyStats, reportCcy } from '../data/fundamentals';
import { riskFree } from '../data/options';
import type { FnProps } from '../terminal/types';
import { sourceLabel } from '../components/Source';
import { useFundamentals } from '../data/live/yfund';

const BENCH: Record<string, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };

/** The 10-year government yield the app has from an official source, per currency. */
const TEN_YEAR: Record<string, { id: string; name: string }> = {
  USD: { id: 'USGG10YR Index', name: 'US 10-year Treasury' },
  EUR: { id: 'GDBR10 Index', name: 'German 10-year Bund' },
  GBP: { id: 'GUKG10 Index', name: 'UK 10-year gilt' },
  JPY: { id: 'GJGB10 Index', name: 'Japan 10-year JGB' },
  CAD: { id: 'GCAN10YR Index', name: 'Canada 10-year' },
  AUD: { id: 'GACGB10 Index', name: 'Australia 10-year' },
};

export function WACC({ sec }: FnProps) {
  const s = sec!;
  const { status } = useFundamentals(s);
  const ks = keyStats(s);
  const f = financials(s);
  const beta = betaTo(s.id, BENCH[s.region], 504);
  const adjBeta = 0.67 * beta.beta + 0.33;
  const [erp, setErp] = useState(5.5);
  const [growth, setGrowth] = useState(2.5);
  const ccy = reportCcy(s);
  // The risk-free rate in the currency of the cash flows: that currency's 10-year government yield.
  const rfLine = TEN_YEAR[ccy];
  const rf = rfLine ? (engine.quote(rfLine.id)?.last ?? NaN) : engine.realOnly ? NaN : riskFree(s) * 100 + 0.6;
  // Market value in the reporting currency, so equity and debt are in the same units (Shell: pence against dollars).
  const tradeCcy = s.ccy === 'GBp' ? 'GBP' : s.ccy;
  const fx = ccy === tradeCcy ? 1 : engine.usdValue(tradeCcy) / engine.usdValue(ccy);
  const ke = rf + adjBeta * erp;
  const ltm = f.ltm;
  // The company's effective rate: LTM interest expense over total debt. Without one, the risk-free rate, labelled as assumed.
  const effective = ltm.debt > 0 && Number.isFinite(ltm.interest) ? (Math.abs(ltm.interest) / ltm.debt) * 100 : NaN;
  const kdKnown = effective > 0;
  const kdPre = kdKnown ? effective : rf;
  // The effective tax rate from the statements; with no pretax profit, the US federal 21%, labelled as assumed.
  const taxKnown = ltm.pretax > 0 && Number.isFinite(ltm.tax);
  const taxRate = taxKnown ? ltm.tax / ltm.pretax : 0.21;
  const kd = kdPre * (1 - taxRate);
  const E = ks.mcap * fx;
  const D = ltm.debt;
  const wE = E / (E + D);
  const wD = D / (E + D);
  const wacc = wE * ke + wD * kd;
  const fcf = ltm.fcf;
  const tv = (fcf * (1 + growth / 100)) / ((wacc - growth) / 100);
  const implied = (tv - (ltm.debt - ltm.cash)) / ltm.shares;
  return (
    <div>
      <FnHeader code="WACC" title="Weighted Average Cost of Capital" sec={s} sub={<>CAPM cost of equity, after-tax cost of debt · {sourceLabel(status, 'balance sheet generated; real data needs the desktop app')}</>} />
      <QuoteStrip sec={s} />
      <div className="cols">
        <Section title="Cost of equity">
          <KV
            items={[
              [rfLine ? `Risk-free rate (${rfLine.name})` : 'Risk-free rate', Number.isFinite(rf) ? `${fmtNum(rf, 3)}%` : `-- (no official 10-year ${ccy} yield in this app)`],
              ['Raw beta (2Y daily)', fmtNum(beta.beta, 3)],
              ['Adjusted beta', fmtNum(adjBeta, 3)],
              [
                'Equity risk premium',
                <input key="erp" type="number" step="0.25" className="inp" style={{ width: 80, textAlign: 'right' }} value={erp} onChange={(e) => setErp(Number(e.target.value) || 0)} aria-label="Equity risk premium" />,
              ],
              ['Cost of equity', <span key="ke" className="white b">{fmtNum(ke, 2)}%</span>],
            ]}
          />
        </Section>
        <Section title="Cost of debt">
          <KV
            items={[
              ['Pre-tax cost of debt', `${fmtNum(kdPre, 2)}% ${kdKnown ? '(LTM interest / debt)' : '(assumed: risk-free)'}`],
              [taxKnown ? 'Effective tax rate' : 'Tax rate (assumed)', fmtPct(taxRate * 100, 1, false)],
              ['After-tax cost of debt', <span key="kd" className="white b">{fmtNum(kd, 2)}%</span>],
              ['Total debt', `${fmtMln(D)} ${ccy}`],
            ]}
          />
        </Section>
        <Section title="WACC">
          <KV
            items={[
              ['Market value of equity', `${fmtMln(E)} ${ccy}`],
              ['Equity weight', fmtPct(wE * 100, 1, false)],
              ['Debt weight', fmtPct(wD * 100, 1, false)],
              ['WACC', <span key="w" className="amber b" style={{ fontSize: 'var(--fs-xl)' }}>{fmtNum(wacc, 2)}%</span>],
            ]}
          />
        </Section>
      </div>
      <Section title="Perpetuity check (Gordon growth on LTM free cash flow)">
        <KV
          items={[
            ['LTM free cash flow', `${fmtMln(fcf)} ${ccy}`],
            [
              'Terminal growth',
              <input key="g" type="number" step="0.25" className="inp" style={{ width: 80, textAlign: 'right' }} value={growth} onChange={(e) => setGrowth(Number(e.target.value) || 0)} aria-label="Terminal growth" />,
            ],
            ['Enterprise value', !(fcf > 0) ? 'n.m. (free cash flow is negative)' : wacc > growth ? `${fmtMln(tv)} ${ccy}` : 'Growth must be below WACC'],
            ['Implied value per share', fcf > 0 && wacc > growth ? `${fmtNum(implied, 2)} ${ccy}` : '--'],
            ['Current price', `${fmtNum(ks.price * fx, 2)} ${ccy}${fx !== 1 ? ` (converted from ${tradeCcy})` : ''}`],
          ]}
        />
      </Section>
    </div>
  );
}
