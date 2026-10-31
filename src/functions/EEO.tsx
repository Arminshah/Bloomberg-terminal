import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { EarningsEvidence } from '../components/EarningsExpectations';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtIso, fmtNum, fmtPct, fmtDay } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine, useTick } from '../data/market';
import { marketCap } from '../data/analytics';
import { financials, majorPrice, reportCcy, type FinPeriod } from '../data/fundamentals';
import { analystsAvailable, analystSymbol, estimateInCurrency, listedOutsideUs, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { earningsAuditState, earningsEvidenceExport, trailingComparableEps, useConsensus, type Consensus } from '../data/live/consensus';
import { desktopData } from '../data/live/yahoo';
import { useFundamentals } from '../data/live/yfund';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * EEO, the consensus overview: the last reported fiscal year against the analysts' consensus for the next ones,
 * line by line with the number of estimates, and the multiples those figures give at today's price. Actuals come
 * from the statements (EPS Adj+ from the quarters' comparable EPS, the analysts' basis); estimates from the
 * analyst sources the app has (FMP with its key, Yahoo Finance, Alpha Vantage, Nasdaq). Nothing is generated.
 */

type Line = {
  n: number;
  label: string;
  /** The reported value (statements' units: millions, except per share and percentages). */
  act: (p: FinPeriod, adjEps: number) => number;
  est?: (e: Estimate) => number;
  count?: (e: Estimate) => number;
  kind: 'eps' | 'money' | 'pct';
};

const LINES: Line[] = [
  { n: 11, label: 'EPS, Adjusted / provider est.', act: (_p, adj) => adj, est: (e) => e.epsAvg, count: (e) => e.analystsEps, kind: 'eps' },
  { n: 12, label: 'EPS, GAAP', act: (p) => p.eps, kind: 'eps' },
  { n: 13, label: 'Revenue', act: (p) => p.rev, est: (e) => e.revenueAvg / 1e6, count: (e) => e.analystsRevenue, kind: 'money' },
  { n: 14, label: 'Gross Margin %', act: (p) => (p.rev > 0 ? (p.gp / p.rev) * 100 : NaN), kind: 'pct' },
  { n: 15, label: 'Operating Profit', act: (p) => p.opInc, est: (e) => (e.ebitAvg ?? NaN) / 1e6, count: (e) => e.analystsRevenue, kind: 'money' },
  { n: 16, label: 'EBITDA', act: (p) => p.ebitda, est: (e) => (e.ebitdaAvg ?? NaN) / 1e6, count: (e) => e.analystsRevenue, kind: 'money' },
  { n: 17, label: 'Pre-Tax Profit', act: (p) => p.pretax, kind: 'money' },
  { n: 18, label: 'Net Income, filed / provider est.', act: (p) => p.ni, est: (e) => e.netIncomeAvg / 1e6, count: (e) => e.analystsEps, kind: 'money' },
];

const fmtLine = (kind: Line['kind'], v: number) => (!Number.isFinite(v) ? '' : kind === 'eps' ? fmtNum(v, 3) : kind === 'pct' ? fmtNum(v, 3) : fmtBig(v * 1e6, 3));

/** The fiscal year's comparable (adjusted) EPS: its four reported quarters added up, when all four are known. */
export function fiscalAdjEps(c: Consensus | null | undefined, yearEnd: number): number {
  if (!c || !Number.isFinite(yearEnd)) return NaN;
  const result = trailingComparableEps(c.past, new Date(yearEnd).toISOString().slice(0, 10));
  return result.basis === 'adjusted' ? result.value : NaN;
}

export function EEO({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const { status } = useFundamentals(s);
  const consensus = useConsensus(desktopData() ? s : undefined);
  const est = useAnalysts(analystsAvailable() && analystSymbol(s) ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const f = financials(s);
  const ccy = reportCcy(s);
  const last = f.annual[f.annual.length - 1];
  const prior = f.annual[f.annual.length - 2];
  const today = engine.today * DAY_MS;
  const outside = listedOutsideUs(analystSymbol(s));
  const years = (est?.state === 'ok' ? est.data ?? [] : [])
    .map((e) => estimateInCurrency(e, ccy, outside))
    .filter((e): e is Estimate => !!e && (!last || Date.parse(`${e.date}T00:00:00Z`) > last.end + 40 * DAY_MS))
    .slice(0, 4);
  const adjAct = last ? fiscalAdjEps(consensus, last.end) : NaN;
  const adjPrior = prior ? fiscalAdjEps(consensus, prior.end) : NaN;
  const yearLabel = (iso: string) => `FY ${iso.slice(0, 4)}`;
  // Headline Growth: each column against the one before it (the first estimate against the actual year).
  const series = (l: Line) => [last ? l.act(last, adjAct) : NaN, ...years.map((e) => (l.est ? l.est(e) : NaN))];
  const priorAct = (l: Line) => (prior ? l.act(prior, adjPrior) : NaN);
  const growth = (l: Line, i: number) => {
    // Annual estimate feeds do not identify their EPS/net-income accounting methodology.
    if ((l.n === 11 || l.n === 18) && i > 0) return NaN;
    const v = series(l);
    const base = i === 0 ? priorAct(l) : v[i - 1];
    if (l.kind === 'pct') return v[i] - base;
    return base > 0 && Number.isFinite(v[i]) ? (v[i] / base - 1) * 100 : NaN;
  };
  // Multiples at today's price, in the statements' currency.
  const q = engine.quote(s.id);
  const tradeCcy = s.ccy === 'GBp' ? 'GBP' : s.ccy;
  const fx = ccy === tradeCcy ? 1 : engine.usdValue(tradeCcy) / engine.usdValue(ccy);
  const price = majorPrice(s, q?.last ?? NaN) * fx;
  const ltm = f.ltm;
  // Market value from today's shares outstanding (the quote's count), not a statement period's weighted diluted count.
  const mcap = (marketCap(s.id) / 1e6) * fx;
  // Enterprise value only with both debt and cash known: a missing balance is not a reported zero.
  const evBasis = Number.isFinite(ltm.debt) && Number.isFinite(ltm.cash);
  const ev = enterpriseValue(mcap, ltm.debt, ltm.cash);
  const trailing = trailingComparableEps(consensus?.past ?? []);
  const ltmAdj = trailing.basis === 'adjusted' && trailing.ccy === ccy ? trailing.value : NaN;
  // The next four quarters' EPS as the year-weighted blend of the next two fiscal years.
  const fy1 = years[0];
  const fy2 = years[1];
  const w = fy1 ? Math.min(1, Math.max(0, (Date.parse(`${fy1.date}T00:00:00Z`) - today) / (365 * DAY_MS))) : NaN;
  const blend = (get: (e: Estimate) => number) => (fy1 && fy2 ? w * get(fy1) + (1 - w) * get(fy2) : NaN);
  const ratio = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : NaN);
  // A multiple on a loss or negative book is not meaningful: "NM", not a blank.
  const nm = (a: number, b: number) => Number.isFinite(a) && a > 0 && Number.isFinite(b) && b <= 0;
  const multiples: { label: string; act: number; next: number; fy: number[]; pct?: boolean; nmAct?: boolean }[] = [
    { label: 'Price/EPS Adjusted', act: ratio(price, ltmAdj), nmAct: nm(price, ltmAdj), next: NaN, fy: years.map(() => NaN) },
    { label: 'Price/EPS, provider estimate', act: NaN, next: ratio(price, blend((e) => e.epsAvg)), fy: years.map((e) => ratio(price, e.epsAvg)) },
    { label: 'Price/EPS GAAP', act: ['quarters', 'trailing'].includes(ltm.basis ?? '') && !ltm.epsComputed && (!s.id.endsWith(' US Equity') || s.country === 'US') ? ratio(price, ltm.eps) : NaN, nmAct: ['quarters', 'trailing'].includes(ltm.basis ?? '') && !ltm.epsComputed && nm(price, ltm.eps), next: NaN, fy: years.map(() => NaN) },
    { label: 'Price/Book', act: ratio(mcap, ltm.equity), nmAct: nm(mcap, ltm.equity), next: NaN, fy: years.map(() => NaN) },
    { label: 'Price/Cash Flow', act: ratio(mcap, ltm.cfo), nmAct: nm(mcap, ltm.cfo), next: NaN, fy: years.map(() => NaN) },
    { label: 'EV/Revenue', act: ratio(ev, ltm.rev), nmAct: nm(ev, ltm.rev), next: ratio(ev, blend((e) => e.revenueAvg / 1e6)), fy: years.map((e) => ratio(ev, e.revenueAvg / 1e6)) },
    { label: 'EV/EBITDA', act: ratio(ev, ltm.ebitda), nmAct: nm(ev, ltm.ebitda), next: ratio(ev, blend((e) => (e.ebitdaAvg ?? NaN) / 1e6)), fy: years.map((e) => ratio(ev, (e.ebitdaAvg ?? NaN) / 1e6)) },
    { label: 'EV/EBIT', act: ratio(ev, ltm.opInc), nmAct: nm(ev, ltm.opInc), next: ratio(ev, blend((e) => (e.ebitAvg ?? NaN) / 1e6)), fy: years.map((e) => ratio(ev, (e.ebitAvg ?? NaN) / 1e6)) },
    { label: 'Dividend Yield', act: Number.isFinite(ltm.dps) && price > 0 ? (ltm.dps / price) * 100 : NaN, next: NaN, fy: years.map(() => NaN), pct: true },
  ];
  const csv = () => [
    ['Line', last ? `${yearLabel(new Date(last.end).toISOString())} Act` : 'Act', ...years.flatMap((e) => [`${yearLabel(e.date)} Est`, '#'])],
    ...LINES.map((l) => [l.label, last ? l.act(last, adjAct) : '', ...years.flatMap((e) => [l.est ? l.est(e) : '', l.count ? l.count(e) : ''])]),
    ...earningsEvidenceExport(consensus, s.id),
  ];
  const lastLabel = last ? `FY ${new Date(last.end).getUTCFullYear()} Act` : 'Act';
  return (
    <div data-audit-state={JSON.stringify(earningsAuditState(consensus, s.id, Date.now(), f.quarterly, ccy))}>
      <FnHeader
        code="ESTIMATES"
        title="Consensus Overview"
        sec={s}
        tabs={[
          { n: 1, label: 'Headline' },
          { n: 2, label: 'Headline Growth' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={[{ n: 96, label: 'Earnings', title: 'Earnings & Estimates (EE)', onClick: () => execute(panel, `${s.id} EARNINGSSUMMARY`) }, ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_EEO.csv`, csv)]}
        controls={
          <div className="chart-tools">
            <span className="cyan">{s.name}</span>
            <label className="fld">
              Periodicity
              <select className="sel-inp" aria-label="Periodicity" value="A" disabled>
                <option value="A">Annuals</option>
              </select>
            </label>
            <label className="fld">
              Source
              <select className="sel-inp" aria-label="Source" value="std" disabled>
                <option value="std">{est?.source ?? 'Standard'}</option>
              </select>
            </label>
            <label className="fld">
              Cur
              <select className="sel-inp" aria-label="Currency" value={ccy} disabled>
                <option>{ccy}</option>
              </select>
            </label>
          </div>
        }
      />
      <EarningsEvidence c={consensus} security={s.id} />
      {!last ? (
        <div className="empty">{status === 'loading' ? 'Loading the statements…' : 'No reported fiscal year from the source for this security.'}</div>
      ) : (
        <>
          <table className="tbl zebra eeo-tbl">
            <thead>
              <tr>
                <th />
                <th className="num">{lastLabel}</th>
                {years.map((e) => (
                  <th key={e.date} className="num" colSpan={2}>
                    {yearLabel(e.date)} Est
                  </th>
                ))}
              </tr>
              <tr className="fa-ending">
                <th>12 Months Ending</th>
                <th className="num">{fmtDay(last.end, true)}</th>
                {years.map((e) => [
                  <th key={`${e.date}:d`} className="num">{fmtIso(e.date, true)}</th>,
                  <th key={`${e.date}:n`} className="num eeo-n">#</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {LINES.map((l) => (
                <tr key={l.n}>
                  <td className="amber">
                    <span className="row-no">{l.n})</span> {l.label}
                  </td>
                  {tab === 1 ? (
                    <>
                      <td className="num white">{fmtLine(l.kind, l.act(last, adjAct))}</td>
                      {years.map((e) => {
                        const v = l.est ? l.est(e) : NaN;
                        const c = l.count && Number.isFinite(v) ? l.count(e) : NaN;
                        return [
                          <td key={`${e.date}:v`} className="num">{fmtLine(l.kind, v)}</td>,
                          <td key={`${e.date}:n`} className="num muted eeo-n">{Number.isFinite(c) ? fmtNum(c, 0) : ''}</td>,
                        ];
                      })}
                    </>
                  ) : (
                    <>
                      <td className="num white">{l.kind === 'pct' ? fmtNum(growth(l, 0), 2) : fmtPct(growth(l, 0), 2)}</td>
                      {years.map((e, i) => [
                        <td key={`${e.date}:v`} className="num">{l.est ? (l.kind === 'pct' ? fmtNum(growth(l, i + 1), 2) : fmtPct(growth(l, i + 1), 2)) : ''}</td>,
                        <td key={`${e.date}:n`} className="eeo-n" />,
                      ])}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mov-title">Current Multiples</div>
          <table className="tbl zebra eeo-tbl">
            <thead>
              <tr>
                <th />
                <th className="num">Last 4 Qtrs Act</th>
                <th className="num" title="The next two fiscal years' consensus, weighted by the time left in the current one">Next 4 Qtrs Est</th>
                {years.map((e) => (
                  <th key={e.date} className="num">
                    {yearLabel(e.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {multiples.map((m) => (
                <tr key={m.label}>
                  <td className="amber">{m.label}</td>
                  <td className="num white" title={m.nmAct ? 'Not meaningful: the earnings, cash flow or book value is negative or zero' : undefined}>
                    {Number.isFinite(m.act) ? fmtNum(m.act, 2) : m.nmAct ? <span className="muted">NM</span> : ''}
                  </td>
                  <td className="num">{Number.isFinite(m.next) ? fmtNum(m.next, 2) : ''}</td>
                  {m.fy.map((v, i) => (
                    <td key={years[i].date} className="num">
                      {Number.isFinite(v) ? fmtNum(v, 2) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            In millions of {ccy} except per share. Act: the last reported fiscal year from the statements; adjusted EPS requires four consecutive quarters with one stated definition. Est: the
            analysts&apos; consensus{est?.source ? ` from ${est.source}` : ''} with the number of estimates (#); a line the source does not estimate is left blank
            {est?.state && est.state !== 'ok' && est.state !== 'loading' ? ` (${est.message ?? 'estimates unavailable'})` : ''}. Multiples at today&apos;s price and today&apos;s shares
            outstanding; enterprise value adds the latest debt and takes off the latest cash
            {evBasis ? '' : `, and is not given here because the statements leave ${!Number.isFinite(ltm.debt) && !Number.isFinite(ltm.cash) ? 'debt and cash' : !Number.isFinite(ltm.debt) ? 'debt' : 'cash'} blank`}. Next 4 Qtrs Est blends the next two
            fiscal years by the time left in the current one. Annual EPS estimates retain their provider basis; their methodology is not stated, so growth across an actual/estimate accounting basis is unavailable. GAAP and adjusted multiples are labelled separately. Historical split or ADR normalization is not inferred.
          </div>
        </>
      )}
    </div>
  );
}

/** Market value plus debt less cash; unknown (NaN) unless all three are known, as a missing balance is not a zero. */
export function enterpriseValue(mcap: number, debt: number, cash: number): number {
  return Number.isFinite(mcap) && Number.isFinite(debt) && Number.isFinite(cash) ? mcap + debt - cash : NaN;
}
