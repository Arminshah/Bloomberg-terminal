import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Sparkline } from '../components/Sparkline';
import { Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { financials, hasRealStatements, reportCcy, type FinPeriod } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import type { FnProps } from '../terminal/types';

type Row = {
  label: string;
  get: (p: FinPeriod, prev?: FinPeriod) => number;
  dec?: number;
  bold?: boolean;
  pct?: boolean;
  indent?: boolean;
  /** A growth or margin line: shown in percent, with no trend arrow of its own. */
  ratio?: boolean;
};

/** Year on year (or quarter on quarter) change, from a positive base only. */
const growth = (a: number, b: number | undefined) => (b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? (a / b - 1) * 100 : NaN);
const margin = (a: number, rev: number) => (Number.isFinite(a) && rev > 0 ? (a / rev) * 100 : NaN);

/**
 * FA's first page, as the terminal's Key Stats: the headline figures with their growth and margins under them. The
 * market value lines are left out: they need the share count and price at each period end, which the statements do
 * not give.
 */
const KEY: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true },
  { label: 'Growth %, YoY', get: (p, q) => growth(p.rev, q?.rev), indent: true, ratio: true },
  { label: 'Gross Profit', get: (p) => p.gp, bold: true },
  { label: 'Margin %', get: (p) => margin(p.gp, p.rev), indent: true, ratio: true },
  { label: 'EBITDA', get: (p) => p.ebitda, bold: true },
  { label: 'Margin %', get: (p) => margin(p.ebitda, p.rev), indent: true, ratio: true },
  { label: 'Net Income', get: (p) => p.ni, bold: true },
  { label: 'Margin %', get: (p) => margin(p.ni, p.rev), indent: true, ratio: true },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true },
  { label: 'Growth %, YoY', get: (p, q) => growth(p.eps, q?.eps), indent: true, ratio: true },
  { label: 'Cash from Operations', get: (p) => p.cfo },
  { label: 'Capital Expenditures', get: (p) => -p.capex },
  { label: 'Free Cash Flow', get: (p) => p.fcf, bold: true },
];

const IS: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true },
  { label: '- Cost of Revenue', get: (p) => -p.cogs, indent: true },
  { label: 'Gross Profit', get: (p) => p.gp, bold: true },
  { label: '- Selling, General & Admin', get: (p) => -p.sga, indent: true },
  { label: '- Research & Development', get: (p) => -p.rnd, indent: true },
  { label: 'Operating Income (Loss)', get: (p) => p.opInc, bold: true },
  { label: '- Interest Expense', get: (p) => -p.interest, indent: true },
  { label: 'Pretax Income (Loss)', get: (p) => p.pretax },
  { label: '- Income Tax Expense', get: (p) => -p.tax, indent: true },
  { label: 'Net Income', get: (p) => p.ni, bold: true },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true },
  { label: 'Diluted Weighted Avg Shares', get: (p) => p.shares },
  { label: 'Dividends per Share', get: (p) => p.dps, dec: 2 },
  { label: 'EBITDA', get: (p) => p.ebitda },
  { label: '+ Depreciation & Amortization', get: (p) => p.da, indent: true },
];

const BS: Row[] = [
  { label: '+ Cash & Equivalents', get: (p) => p.cash, indent: true },
  { label: '+ Accounts Receivable', get: (p) => p.recv, indent: true },
  { label: '+ Inventories', get: (p) => p.inv, indent: true },
  { label: 'Total Current Assets', get: (p) => p.curAssets, bold: true },
  { label: '+ Net Property, Plant & Equip', get: (p) => p.ppe, indent: true },
  { label: '+ Goodwill & Intangibles', get: (p) => p.intang, indent: true },
  { label: 'Total Assets', get: (p) => p.totAssets, bold: true },
  { label: 'Total Current Liabilities', get: (p) => p.curLiab },
  { label: 'Total Debt', get: (p) => p.debt },
  { label: 'Total Liabilities', get: (p) => p.totLiab, bold: true },
  { label: 'Total Equity', get: (p) => p.equity, bold: true },
  { label: 'Book Value per Share', get: (p) => p.equity / p.shares, dec: 2 },
];

const CF: Row[] = [
  { label: 'Net Income', get: (p) => p.ni },
  { label: '+ Depreciation & Amortization', get: (p) => p.da, indent: true },
  { label: 'Cash from Operating Activities', get: (p) => p.cfo, bold: true },
  { label: '- Capital Expenditures', get: (p) => -p.capex, indent: true },
  { label: 'Free Cash Flow', get: (p) => p.fcf, bold: true },
  { label: '- Dividends Paid', get: (p) => -p.divPaid, indent: true },
  { label: '- Repurchase of Equity', get: (p) => -p.buyback, indent: true },
  { label: 'Free Cash Flow per Share', get: (p) => p.fcf / p.shares, dec: 2 },
];

const RATIOS: Row[] = [
  { label: 'Gross Margin', get: (p) => (p.gp / p.rev) * 100, pct: true },
  { label: 'Operating Margin', get: (p) => (p.opInc / p.rev) * 100, pct: true },
  { label: 'EBITDA Margin', get: (p) => (p.ebitda / p.rev) * 100, pct: true },
  { label: 'Net Margin', get: (p) => (p.ni / p.rev) * 100, pct: true },
  { label: 'Return on Common Equity', get: (p) => (p.equity > 0 ? (p.ni / p.equity) * 100 : NaN), pct: true },
  { label: 'Return on Assets', get: (p) => (p.ni / p.totAssets) * 100, pct: true },
  { label: 'Effective Tax Rate', get: (p) => (p.pretax > 0 ? (p.tax / p.pretax) * 100 : NaN), pct: true },
  { label: 'Current Ratio', get: (p) => p.curAssets / p.curLiab, dec: 2 },
  { label: 'Total Debt / Total Equity', get: (p) => (p.equity > 0 ? (p.debt / p.equity) * 100 : NaN), pct: true },
  { label: 'Net Debt / EBITDA', get: (p) => (p.debt - p.cash) / p.ebitda, dec: 2 },
  { label: 'EBIT / Interest Expense', get: (p) => (p.interest > 0 ? p.opInc / p.interest : NaN), dec: 1 },
  { label: 'Capex / Revenue', get: (p) => (p.capex / p.rev) * 100, pct: true },
  { label: 'Dividend Payout Ratio', get: (p) => (p.eps > 0 ? (p.dps / p.eps) * 100 : NaN), pct: true },
];

/** FA's pages under the terminal's names. */
const TABS = [
  { n: 1, label: 'Key Stats', file: 'KeyStats', rows: KEY },
  { n: 2, label: 'I/S', file: 'IncomeStatement', rows: IS },
  { n: 3, label: 'B/S', file: 'BalanceSheet', rows: BS },
  { n: 4, label: 'C/F', file: 'CashFlow', rows: CF },
  { n: 5, label: 'Ratios', file: 'Ratios', rows: RATIOS },
];

/** Words FA takes after the security to open a page: FA AAPL IS, FA AAPL BS. */
const PAGE_WORDS: Record<string, number> = { KEY: 1, KS: 1, IS: 2, BS: 3, CF: 4, RATIOS: 5, R: 5 };

export function FA({ sec, route }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  const [tab, setTab] = useState(words.map((w) => PAGE_WORDS[w]).find(Boolean) ?? 1);
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
    divUnit && r.label === 'Dividends per Share' ? { ...r, label: `Dividends per Share (${divUnit})` } : divUnit && r.label === 'Dividend Payout Ratio' ? { ...r, get: () => NaN } : r,
  );
  // Growth lines compare a year with the one before and a quarter with the same quarter a year earlier; the LTM
  // column overlaps the latest year, so it has no growth of its own.
  const prevOf = (i: number) => (quarterly ? cols[i - 4] : i === cols.length - 1 ? undefined : cols[i - 1]);
  const value = (r: Row, i: number) => r.get(cols[i], prevOf(i));
  const csv = () => [['Item', ...cols.map((c) => c.label)], ...rows.map((r) => [r.label, ...cols.map((_, i) => value(r, i).toFixed(r.dec ?? 1))])];
  const months = quarterly ? '3 Months Ending' : '12 Months Ending';
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
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${TABS[tab - 1].file}.csv`, csv),
        ]}
      />
      <QuoteStrip sec={s} />
      <div className="tbl-wrap">
        <table className="tbl zebra">
          <thead>
            <tr>
              <th>In Millions of {ccy} except Per Share</th>
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {c.label === 'LTM' ? 'Current/LTM' : c.label}
                </th>
              ))}
              <th className="num">{quarterly ? 'QoQ' : 'YoY'}</th>
              <th className="hide-m">Trend</th>
            </tr>
            <tr className="fa-ending">
              <th>{months}</th>
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {fmtDay(c.end)}
                </th>
              ))}
              <th />
              <th className="hide-m" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const vals = cols.map((_, i) => value(r, i));
              const last = vals[quarterly ? vals.length - 1 : vals.length - 2];
              const prev = vals[quarterly ? vals.length - 2 : vals.length - 3];
              // Growth of magnitude; for cost lines (negative values) a rise is shown as a negative.
              // From a loss to a profit, or back, a percentage means nothing: shown as --.
              const cost = prev < 0 && last < 0;
              const flipped = prev * last < 0;
              const g = r.pct ? last - prev : prev !== 0 && !flipped ? ((Math.abs(last) - Math.abs(prev)) / Math.abs(prev)) * 100 * (cost ? -1 : 1) : NaN;
              return (
                <tr key={`${ri}:${r.label}`}>
                  <td className={r.bold ? 'amber b' : r.ratio ? 'muted' : 'amber'} style={r.indent ? { paddingLeft: 18 } : undefined}>
                    {r.label}
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num ${r.bold ? 'white' : r.ratio ? 'muted' : ''}`}>
                      {r.ratio ? (Number.isFinite(v) ? fmtNum(v, 1) : '--') : r.pct ? `${fmtNum(v, 1)}%` : fmtNum(v, r.dec ?? (Math.abs(v) >= 100 ? 0 : 1))}
                    </td>
                  ))}
                  <td className="num">{r.ratio ? '' : r.pct ? <Chg v={g} dec={1} /> : <Chg v={g} pct dec={1} />}</td>
                  <td className="hide-m">
                    {/* A missing period is left out of the trend rather than drawn as zero. */}
                    {r.ratio ? null : <Sparkline values={vals.filter((v) => Number.isFinite(v))} width={70} height={14} color="var(--amber)" />}
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
