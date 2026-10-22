import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Sparkline } from '../components/Sparkline';
import { Chg } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtEarnDate, fmtIso, fmtNum } from '../core/format';
import { financials, hasRealStatements, nextEarnings, priorStatementPeriod, reportCcy, type FinPeriod } from '../data/fundamentals';
import { analystsAvailable, analystSymbol, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { execute } from '../terminal/exec';
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
  /** Both figures are there but the ratio means nothing (growth from a loss): "NM". */
  nm?: (p: FinPeriod, prev?: FinPeriod) => boolean;
};

/** Year on year (or quarter on quarter) change, from a positive base only. */
const growth = (a: number, b: number | undefined) => (b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b > 0 ? (a / b - 1) * 100 : NaN);
const margin = (a: number, rev: number) => (Number.isFinite(a) && rev > 0 ? (a / rev) * 100 : NaN);
/** Growth from a loss or zero: both figures known, no meaningful percentage. */
const growthNm = (a: number, b: number | undefined) => b !== undefined && Number.isFinite(a) && Number.isFinite(b) && b <= 0;

/**
 * FA's first page, as the terminal's Key Stats: the headline figures with their growth and margins under them. The
 * market value lines are left out: they need the share count and price at each period end, which the statements do
 * not give.
 */
const KEY: Row[] = [
  { label: 'Revenue', get: (p) => p.rev, bold: true },
  { label: 'Growth %, YoY', get: (p, q) => growth(p.rev, q?.rev), nm: (p, q) => growthNm(p.rev, q?.rev), indent: true, ratio: true },
  { label: 'Gross Profit', get: (p) => p.gp, bold: true },
  { label: 'Margin %', get: (p) => margin(p.gp, p.rev), indent: true, ratio: true },
  { label: 'EBITDA', get: (p) => p.ebitda, bold: true },
  { label: 'Margin %', get: (p) => margin(p.ebitda, p.rev), indent: true, ratio: true },
  { label: 'Net Income', get: (p) => p.ni, bold: true },
  { label: 'Margin %', get: (p) => margin(p.ni, p.rev), indent: true, ratio: true },
  { label: 'Diluted EPS', get: (p) => p.eps, dec: 2, bold: true },
  { label: 'Growth %, YoY', get: (p, q) => growth(p.eps, q?.eps), nm: (p, q) => growthNm(p.eps, q?.eps), indent: true, ratio: true },
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
  { label: 'Return on Common Equity', get: (p) => (p.equity > 0 ? (p.ni / p.equity) * 100 : NaN), nm: (p) => Number.isFinite(p.ni) && p.equity <= 0, pct: true },
  { label: 'Return on Assets', get: (p) => (p.ni / p.totAssets) * 100, pct: true },
  { label: 'Effective Tax Rate', get: (p) => (p.pretax > 0 ? (p.tax / p.pretax) * 100 : NaN), nm: (p) => Number.isFinite(p.tax) && p.pretax <= 0, pct: true },
  { label: 'Current Ratio', get: (p) => p.curAssets / p.curLiab, dec: 2 },
  { label: 'Total Debt / Total Equity', get: (p) => (p.equity > 0 ? (p.debt / p.equity) * 100 : NaN), nm: (p) => Number.isFinite(p.debt) && p.equity <= 0, pct: true },
  { label: 'Net Debt / EBITDA', get: (p) => (p.debt - p.cash) / p.ebitda, dec: 2 },
  { label: 'EBIT / Interest Expense', get: (p) => (p.interest > 0 ? p.opInc / p.interest : NaN), nm: (p) => Number.isFinite(p.opInc) && p.interest === 0, dec: 1 },
  { label: 'Capex / Revenue', get: (p) => (p.capex / p.rev) * 100, pct: true },
  { label: 'Dividend Payout Ratio', get: (p) => (p.eps > 0 ? (p.dps / p.eps) * 100 : NaN), nm: (p) => p.dps > 0 && p.eps <= 0, pct: true },
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

/** A period's heading as the terminal writes it: "2025 Y" for a fiscal year, "Q3 2025" for a quarter. */
function periodHeading(c: FinPeriod, quarterly: boolean): string {
  if (c.label === 'LTM') return 'Current/LTM';
  if (quarterly) return c.label;
  const y = /(\d{4})/.exec(c.label)?.[1];
  return y ? `${y} Y` : c.label;
}

/** Which statement rows an analysts' annual estimate fills, in the statements' units (millions, EPS per share). */
const EST_ROWS: Record<string, (e: Estimate) => number> = {
  Revenue: (e) => e.revenueAvg / 1e6,
  'Net Income': (e) => e.netIncomeAvg / 1e6,
  'Diluted EPS': (e) => e.epsAvg,
};

export function FA({ sec, route }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const words = route.args?.toUpperCase().split(/\s+/).filter(Boolean) ?? [];
  const [tab, setTab] = useState(words.map((w) => PAGE_WORDS[w]).find(Boolean) ?? 1);
  const [quarterly, setQuarterly] = useState(false);
  const [periods, setPeriods] = useState(5);
  const [offset, setOffset] = useState(0);
  const { real, status: fundStatus } = useFundamentals(s);
  const status = fundStatus === 'ok' && !hasRealStatements(s) ? 'error' : fundStatus;
  const f = financials(s);
  const all = quarterly ? f.quarterly : [...f.annual, ...(Number.isFinite(f.ltm.end) ? [f.ltm] : [])];
  // The periods shown: the latest `periods`, moved back by the paging arrows.
  const maxOffset = Math.max(0, all.length - periods);
  const off = Math.min(offset, maxOffset);
  const cols = all.slice(Math.max(0, all.length - periods - off), all.length - off);
  const supplementSources = [...new Set(cols.flatMap((p) => p.supplements ?? []))];
  const ccy = reportCcy(s);
  // The analysts' consensus for the coming fiscal years, beside the reported ones (annual view, statements' currency).
  const est = useAnalysts(analystsAvailable() && analystSymbol(s) ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const lastEnd = f.annual.length ? f.annual[f.annual.length - 1].end : NaN;
  const estimates = !quarterly && off === 0 && est?.state === 'ok'
    ? (est.data ?? []).filter((e) => Date.parse(`${e.date}T00:00:00Z`) > lastEnd + 40 * 86_400_000 && (!e.currency || e.currency === ccy)).slice(0, 2)
    : [];
  const next = nextEarnings(s);
  // Dividends come in the unit the shares trade in (Shell: pence) while the statements are in the reporting
  // currency (dollars): the row says its unit, and no payout ratio divides one by the other.
  const divUnit = s.ccy !== ccy ? (s.ccy === 'GBp' ? 'pence' : s.ccy) : '';
  const rows = TABS[tab - 1].rows.map((r) =>
    divUnit && r.label === 'Dividends per Share' ? { ...r, label: `Dividends per Share (${divUnit})` } : divUnit && r.label === 'Dividend Payout Ratio' ? { ...r, get: () => NaN, nm: undefined } : r,
  );
  // Growth lines compare a year with the one before and a quarter with the same quarter a year earlier; the LTM
  // column overlaps the latest year, so it has no growth of its own.
  const prevOf = (i: number) => (!quarterly && cols[i].label === 'LTM' ? undefined : priorStatementPeriod(all, cols[i], 'year'));
  const value = (r: Row, i: number) => r.get(cols[i], prevOf(i));
  const estValue = (r: Row, e: Estimate) => (EST_ROWS[r.label] && !r.indent ? EST_ROWS[r.label](e) : NaN);
  const csv = () => [
    ['Item', ...cols.map((c) => periodHeading(c, quarterly)), ...estimates.map((e) => `${e.date.slice(0, 4)} Y Est`)],
    ...rows.map((r) => [r.label, ...cols.map((_, i) => value(r, i).toFixed(r.dec ?? 1)), ...estimates.map((e) => estValue(r, e).toFixed(r.dec ?? 1))]),
  ];
  const months = quarterly ? '3 Months Ending' : '12 Months Ending';
  // A missing figure is left empty (the note says why); "NM" where both figures are there but a ratio means nothing.
  const fmtCell = (r: Row, v: number, i?: number) =>
    !Number.isFinite(v) ? (i != null && r.nm?.(cols[i], prevOf(i)) ? 'NM' : '') : r.ratio ? fmtNum(v, 1) : r.pct ? `${fmtNum(v, 1)}%` : fmtNum(v, r.dec ?? (Math.abs(v) >= 100 ? 0 : 1));
  return (
    <div>
      <FnHeader
        code="FINANCIALS"
        title="Financial Analysis"
        sec={s}
        tabs={TABS.map((t) => ({ n: t.n, label: t.label }))}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 96, label: 'Graph', title: 'Graph these figures (GF)', onClick: () => execute(panel, `${s.id} FUNDCHART`) },
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_${TABS[tab - 1].file}.csv`, csv),
        ]}
        controls={<div className="chart-tools fa-tools">
          <label className="fld">
            Periods
            <select className="sel-inp" aria-label="Periods" value={periods} onChange={(e) => { setPeriods(Number(e.target.value)); setOffset(0); }}>
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <select className="sel-inp" aria-label="Periodicity" value={quarterly ? 'Q' : 'A'} onChange={(e) => { setQuarterly(e.target.value === 'Q'); setOffset(0); }}>
            <option value="A">Annuals</option>
            <option value="Q">Quarterlies</option>
          </select>
          <label className="fld">
            Cur
            <select className="sel-inp" aria-label="Currency" value={ccy} disabled>
              <option>{ccy}</option>
            </select>
          </label>
          <span className="muted fa-src">
            {status === 'ok' && real?.statementsFrom === 'SEC EDGAR' ? <><span className="badge live">REAL</span> SEC EDGAR</> : sourceLabel(status, 'statements generated from the company profile; real data needs the desktop app')}
            {real?.statementsFrom !== 'SEC EDGAR' && supplementSources.some((x) => x.startsWith('SEC')) ? ' + SEC EDGAR supplements' : ''}
          </span>
        </div>}
      />
      <QuoteStrip sec={s} />
      <div className="tbl-wrap">
        <table className="tbl zebra fa-tbl">
          <thead>
            <tr>
              <th>In Millions of {ccy} except Per Share</th>
              {cols.map((c) => (
                <th key={c.label} className="num" title={c.supplements?.join('; ')}>
                  {periodHeading(c, quarterly)}
                  {c.supplements?.length ? ' *' : ''}
                </th>
              ))}
              {estimates.map((e) => (
                <th key={e.date} className="num fa-est" title={`Analysts' consensus${est?.source ? ` (${est.source})` : ''}: EPS on their basis, usually adjusted`}>
                  {e.date.slice(0, 4)} Y Est
                </th>
              ))}
              <th className="num">{quarterly ? 'QoQ' : 'YoY'}</th>
              <th className="hide-m">Trend</th>
            </tr>
            <tr className="fa-ending">
              <th>{months}</th>
              {cols.map((c) => (
                <th key={c.label} className="num">
                  {fmtDay(c.end, true)}
                </th>
              ))}
              {estimates.map((e) => (
                <th key={e.date} className="num">
                  {fmtIso(e.date, true)}
                </th>
              ))}
              <th />
              <th className="hide-m" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const vals = cols.map((_, i) => value(r, i));
              const latestIdx = quarterly || cols[cols.length - 1]?.label !== 'LTM' ? vals.length - 1 : vals.length - 2;
              const last = vals[latestIdx];
              const latestPeriod = cols[latestIdx];
              const previousPeriod = latestPeriod ? priorStatementPeriod(all, latestPeriod, quarterly ? 'quarter' : 'year') : undefined;
              const prev = previousPeriod ? r.get(previousPeriod) : NaN;
              // Growth of magnitude; for cost lines (negative values) a rise is shown as a negative.
              // From a loss to a profit, or back, a percentage means nothing: shown as NM.
              const cost = prev < 0 && last < 0;
              const flipped = prev * last < 0;
              const g = r.pct ? last - prev : prev !== 0 && !flipped ? ((Math.abs(last) - Math.abs(prev)) / Math.abs(prev)) * 100 * (cost ? -1 : 1) : NaN;
              const sub = /^[+-] /.test(r.label);
              return (
                <tr key={`${ri}:${r.label}`}>
                  <td className={r.bold ? 'amber b' : r.ratio ? 'muted' : sub ? 'white' : 'amber'} style={r.indent ? { paddingLeft: 22 } : undefined}>
                    {!r.ratio && (
                      <button type="button" className="fa-graph" title={`Graph ${r.label.replace(/^[+-] /, '')} (GF)`} aria-label={`Graph ${r.label.replace(/^[+-] /, '')}`} onClick={() => execute(panel, `${s.id} FUNDCHART`)}>
                        <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 9V1M1 9h8M2.5 7l2-2.5 1.6 1.4L8.5 3" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>
                      </button>
                    )}
                    {r.label}
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className={`num ${r.bold ? 'white' : r.ratio ? 'muted' : ''}`}>
                      {fmtCell(r, v, i)}
                    </td>
                  ))}
                  {estimates.map((e) => {
                    const v = estValue(r, e);
                    return (
                      <td key={e.date} className="num fa-est">
                        {Number.isFinite(v) ? fmtCell(r, v) : ''}
                      </td>
                    );
                  })}
                  <td className="num">
                    {r.ratio ? '' : Number.isFinite(g) ? r.pct ? <Chg v={g} dec={1} /> : <Chg v={g} pct dec={1} /> : Number.isFinite(last) && Number.isFinite(prev) ? <span className="muted" title="Not meaningful: from a loss to a profit, or back">NM</span> : ''}
                  </td>
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
      <div className="fa-bottom">
        <button type="button" disabled={off >= maxOffset} title="Earliest periods" onClick={() => setOffset(maxOffset)}>&lt;&lt;</button>
        <button type="button" disabled={off >= maxOffset} title="One period earlier" onClick={() => setOffset(off + 1)}>&lt;</button>
        <button type="button" disabled={off === 0} title="One period later" onClick={() => setOffset(Math.max(0, off - 1))}>&gt;</button>
        <button type="button" disabled={off === 0} title="Latest periods" onClick={() => setOffset(0)}>&gt;&gt;</button>
        <span className="fa-next">
          Earnings: {next ? fmtEarnDate(next, false) : '--'} |{' '}
          <button type="button" className="link" onClick={() => execute(panel, `${s.id} EVENTS`)}>EVTS »</button>
          <button type="button" className="link" onClick={() => execute(panel, `${s.id} EARNINGS`)}>Earnings | EE »</button>
        </span>
      </div>
      <div className="note">
        {status === 'ok'
          ? `Figures from ${real?.statementsFrom === 'SEC EDGAR' ? 'SEC EDGAR' : 'Yahoo Finance, supplemented from compatible SEC EDGAR observations where available'}; LTM ${f.ltm?.basis === 'annual' ? 'is the latest complete fiscal year, dated above' : f.ltm?.basis === 'trailing' ? "is the source's trailing twelve months" : 'sums four consecutive reported quarters'}${f.ltm?.epsComputed ? ', with EPS as net income over diluted shares (a quarter has no EPS in the source)' : ''}. Missing values have no supported observation; they are not zero.${estimates.length ? ` Est columns: the analysts' consensus${est?.source ? ` from ${est.source}` : ''} (revenue, net income and EPS on the analysts' basis).` : ''}`
          : status === 'sim' ? "Statements are simulated from each company's scale and sector profile; they are not reported figures." : ''}
      </div>
      {supplementSources.length ? <details className="note"><summary>* Supplemental observations (hover a period heading for its sources)</summary>{supplementSources.map((source) => <div key={source}>{source}</div>)}</details> : null}
    </div>
  );
}
