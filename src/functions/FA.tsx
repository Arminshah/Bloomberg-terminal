import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Sparkline } from '../components/Sparkline';
import { Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtNum } from '../core/format';
import { financials, hasRealStatements, reportCcy, type FinPeriod } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import type { FnProps } from '../terminal/types';

type Row = { label: string; get: (p: FinPeriod) => number; dec?: number; bold?: boolean; pct?: boolean; indent?: boolean };

const IS: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true },
  { label: 'Cost of revenue', get: (p) => -p.cogs, indent: true },
  { label: 'Gross profit', get: (p) => p.gp, bold: true },
  { label: 'Selling, general & admin', get: (p) => -p.sga, indent: true },
  { label: 'Research & development', get: (p) => -p.rnd, indent: true },
  { label: 'Operating income', get: (p) => p.opInc, bold: true },
  { label: 'Interest expense', get: (p) => -p.interest, indent: true },
  { label: 'Pretax income', get: (p) => p.pretax },
  { label: 'Income tax', get: (p) => -p.tax, indent: true },
  { label: 'Net income', get: (p) => p.ni, bold: true },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true },
  { label: 'Diluted shares', get: (p) => p.shares },
  { label: 'Dividend per share', get: (p) => p.dps, dec: 2 },
  { label: 'EBITDA', get: (p) => p.ebitda },
  { label: 'Depreciation & amortization', get: (p) => p.da, indent: true },
];

const BS: Row[] = [
  { label: 'Cash & equivalents', get: (p) => p.cash },
  { label: 'Receivables', get: (p) => p.recv },
  { label: 'Inventories', get: (p) => p.inv },
  { label: 'Total current assets', get: (p) => p.curAssets, bold: true },
  { label: 'Net PP&E', get: (p) => p.ppe },
  { label: 'Goodwill & intangibles', get: (p) => p.intang },
  { label: 'Total assets', get: (p) => p.totAssets, bold: true },
  { label: 'Total current liabilities', get: (p) => p.curLiab },
  { label: 'Total debt', get: (p) => p.debt },
  { label: 'Total liabilities', get: (p) => p.totLiab, bold: true },
  { label: 'Total equity', get: (p) => p.equity, bold: true },
  { label: 'Book value per share', get: (p) => p.equity / p.shares, dec: 2 },
];

const CF: Row[] = [
  { label: 'Net income', get: (p) => p.ni },
  { label: 'Depreciation & amortization', get: (p) => p.da, indent: true },
  { label: 'Cash from operations', get: (p) => p.cfo, bold: true },
  { label: 'Capital expenditures', get: (p) => -p.capex, indent: true },
  { label: 'Free cash flow', get: (p) => p.fcf, bold: true },
  { label: 'Dividends paid', get: (p) => -p.divPaid, indent: true },
  { label: 'Share repurchases', get: (p) => -p.buyback, indent: true },
  { label: 'FCF per share', get: (p) => p.fcf / p.shares, dec: 2 },
];

const RATIOS: Row[] = [
  { label: 'Gross margin', get: (p) => (p.gp / p.rev) * 100, pct: true },
  { label: 'Operating margin', get: (p) => (p.opInc / p.rev) * 100, pct: true },
  { label: 'EBITDA margin', get: (p) => (p.ebitda / p.rev) * 100, pct: true },
  { label: 'Net margin', get: (p) => (p.ni / p.rev) * 100, pct: true },
  { label: 'Return on equity', get: (p) => (p.equity > 0 ? (p.ni / p.equity) * 100 : NaN), pct: true },
  { label: 'Return on assets', get: (p) => (p.ni / p.totAssets) * 100, pct: true },
  { label: 'Effective tax rate', get: (p) => (p.pretax > 0 ? (p.tax / p.pretax) * 100 : NaN), pct: true },
  { label: 'Current ratio', get: (p) => p.curAssets / p.curLiab, dec: 2 },
  { label: 'Debt / equity', get: (p) => (p.equity > 0 ? (p.debt / p.equity) * 100 : NaN), pct: true },
  { label: 'Net debt / EBITDA', get: (p) => (p.debt - p.cash) / p.ebitda, dec: 2 },
  { label: 'Interest coverage', get: (p) => (p.interest > 0 ? p.opInc / p.interest : NaN), dec: 1 },
  { label: 'Capex / revenue', get: (p) => (p.capex / p.rev) * 100, pct: true },
  { label: 'Payout ratio', get: (p) => (p.eps > 0 ? (p.dps / p.eps) * 100 : NaN), pct: true },
];

const TABS = [
  { n: 1, label: 'Income Statement', rows: IS },
  { n: 2, label: 'Balance Sheet', rows: BS },
  { n: 3, label: 'Cash Flow', rows: CF },
  { n: 4, label: 'Ratios', rows: RATIOS },
];

export function FA({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const [quarterly, setQuarterly] = useState(false);
  const { status: fundStatus } = useFundamentals(s);
  const status = fundStatus === 'ok' && !hasRealStatements(s) ? 'error' : fundStatus;
  const f = financials(s);
  const cols = quarterly ? f.quarterly : [...f.annual, f.ltm];
  const ccy = reportCcy(s);
  // Dividends come in the unit the shares trade in (Shell: pence) while the statements are in the reporting
  // currency (dollars): the row says its unit, and no payout ratio divides one by the other.
  const divUnit = s.ccy !== ccy ? (s.ccy === 'GBp' ? 'pence' : s.ccy) : '';
  const rows = TABS[tab - 1].rows.map((r) =>
    divUnit && r.label === 'Dividend per share' ? { ...r, label: `Dividend per share (${divUnit})` } : divUnit && r.label === 'Payout ratio' ? { ...r, get: () => NaN } : r,
  );
  const csv = () => [['Item', ...cols.map((c) => c.label)], ...rows.map((r) => [r.label, ...cols.map((c) => r.get(c).toFixed(r.dec ?? 1))])];
  return (
    <div>
      <FnHeader
        code="FINANCIALS"
        title="Financial Analysis"
        sec={s}
        sub={<>{ccy} millions except per share · {sourceLabel(status, 'statements generated from the company profile; real data needs the desktop app')}</>}
        tabs={TABS.map((t) => ({ n: t.n, label: t.label }))}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 11, label: 'Annual', on: !quarterly, onClick: () => setQuarterly(false) },
          { n: 12, label: 'Quarterly', on: quarterly, onClick: () => setQuarterly(true) },
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${TABS[tab - 1].label.replace(/\s/g, '')}.csv`, csv),
        ]}
      />
      <QuoteStrip sec={s} />
      <div className="tbl-wrap">
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>In millions of {ccy}</th>
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {c.label}
                </th>
              ))}
              <th className="num">{quarterly ? 'QoQ' : 'YoY'}</th>
              <th className="hide-m">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vals = cols.map((c) => r.get(c));
              const last = vals[quarterly ? vals.length - 1 : vals.length - 2];
              const prev = vals[quarterly ? vals.length - 2 : vals.length - 3];
              // Growth of magnitude; for cost lines (negative values) a rise is shown as a negative.
              // From a loss to a profit, or back, a percentage means nothing: shown as --.
              const cost = prev < 0 && last < 0;
              const flipped = prev * last < 0;
              const g = r.pct ? last - prev : prev !== 0 && !flipped ? ((Math.abs(last) - Math.abs(prev)) / Math.abs(prev)) * 100 * (cost ? -1 : 1) : NaN;
              return (
                <tr key={r.label}>
                  <td className={r.bold ? 'amber b' : 'amber'} style={r.indent ? { paddingLeft: 18 } : undefined}>
                    {r.label}
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num ${r.bold ? 'white' : ''}`}>
                      {r.pct ? `${fmtNum(v, 1)}%` : fmtNum(v, r.dec ?? (Math.abs(v) >= 100 ? 0 : 1))}
                    </td>
                  ))}
                  <td className="num">{r.pct ? <Chg v={g} dec={1} /> : <Chg v={g} pct dec={1} />}</td>
                  <td className="hide-m">
                    {/* A missing period is left out of the trend rather than drawn as zero. */}
                    <Sparkline values={vals.filter((v) => Number.isFinite(v))} width={70} height={14} color="var(--amber)" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cols.length === 0 ? <div className="empty">{status === 'loading' ? 'Loading statements…' : 'No statements from the source for this security.'}</div> : null}
      <div className="note">
        {status === 'ok'
          ? `Reported figures from the company filings as published by Yahoo Finance; LTM ${f.ltm?.basis === 'trailing' ? "is the source's trailing twelve months" : 'sums the last four reported quarters'}${f.ltm?.epsComputed ? ', with EPS as net income over diluted shares (a quarter has no EPS in the source)' : ''}.`
          : status === 'sim' ? "Statements are simulated from each company's scale and sector profile; they are not reported figures." : ''}
      </div>
    </div>
  );
}
