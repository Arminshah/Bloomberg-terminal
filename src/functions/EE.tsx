import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, Section, KV } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtEarnDate, fmtIso, fmtMln, fmtNum, fmtPct } from '../core/format';
import { earningsHistory, earningsReaction, financials, isUpcomingReport, lastReportDate, priceInCurrency, reportCcy, reportSessionDay, type EarningsEvent, type EarningsReaction } from '../data/fundamentals';
import { fiscalAdjEps } from './EEO';
import { engine, useHistoryVersion } from '../data/market';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { useFundamentals } from '../data/live/yfund';
import { sourceLabel } from '../components/Source';
import { analystsAvailable, analystSymbol, listedOutsideUs, useAnalysts, type AnalystPart, type Estimate } from '../data/live/analysts';
import { EstimatesTable, estimateUnit } from './ANR';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import { finnhubAvailable, finnhubSymbol, useFinnhub, type FinnhubPart, type NextReport } from '../data/live/finnhub';
import { exportActions } from '../components/ExportActions';
import { canonicalQuarter, datedHistory, earningsAuditState, earningsEvidenceExport, epsBasisLabel, epsDisagreement, expectationNote, fiscalLabel, trailingComparableEps, useConsensus, verifiedEpsSurprise } from '../data/live/consensus';
import { matchQuarter, surpriseStats } from '../data/ern';
import { desktopData } from '../data/live/yahoo';
import { EarningsEvidence, ExpectationsTable, LatestReport } from '../components/EarningsExpectations';
import { fmtDay } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { peText } from './DESEquity';

/** What each reaction compares, in the column beside it. */
const BASIS: Record<EarningsReaction['basis'], string> = {
  'before-open': 'before the open: report day vs prior close',
  'after-close': 'after the close: next session vs report day',
  unknown: 'time not known: report day vs prior close',
  'no-session': 'no session that day: next session vs prior close',
};

/**
 * Earnings: report dates and the reported figures (diluted EPS and revenue as the statements give them), with
 * the share price's close-to-close reaction to each past report from the daily history. For US-listed stocks in
 * the desktop app, also the last four quarters' EPS against the analysts' estimate and the next report's
 * estimates from Finnhub, and annual estimates from Financial Modeling Prep. Nothing is generated.
 */
export type Measure = 'eps' | 'rev';

/** Pearson correlation of paired values; NaN under three pairs. */
function correlation(xs: number[], ys: number[]): number {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return NaN;
  const mx = pairs.reduce((a, [x]) => a + x, 0) / pairs.length;
  const my = pairs.reduce((a, [, y]) => a + y, 0) / pairs.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** One line of ERN's table: a past report, or a coming one with its estimate. */
interface ErnRow {
  key: string;
  ann: string;
  per: string;
  perEnd: string;
  confirmed: boolean;
  reported: number;
  comp: number;
  est: number;
  surp: number;
  /** Set when two sources call the quarter a beat and a miss: their comparisons, for the tooltip. */
  disagree?: string;
  epsBasis?: string;
  peBasis?: string;
  /** Revenue reported and expected (millions), and the surprise, shown beside EPS whatever the measure. */
  revRep: number;
  revEst: number;
  revSurp: number;
  px: number;
  pxTitle?: string;
  pe: number;
  future: boolean;
  from?: string;
}

/**
 * The reports EARNINGS lists, newest first, each matched with the analysts' quarter and the share price's reaction, and
 * one table line per quarter for a measure. Shared with EARNINGSSUMMARY, so both pages show the same figures.
 */
export function useErnReports(s: SecurityDef, measure: Measure) {
  const { status, real } = useFundamentals(s);
  // The analysts' expectations against the reports (Yahoo research, Finnhub), desktop app only.
  const consensus = useConsensus(desktopData() ? s : undefined);
  useHistoryVersion();
  // Report dates and sessions the statements leave out come from the expectation sources (Alpha Vantage, the SEC's 8-Ks).
  const hist = datedHistory(earningsHistory(s), consensus);
  const daily = engine.daily(s.id);
  const q = engine.quote(s.id);
  // Today's bar is final once the market has closed; while it trades (or the line is simulated) it is still forming.
  const lastFinal = q?.src === 'CLOSE' || q?.src === 'EOD' ? engine.today : engine.today - 1;
  // A report's day where the shares trade: the exchange's time zone from the quote, else New York for US stocks.
  const tz = q?.tz ?? (s.country === 'US' ? 'America/New_York' : undefined);
  const reaction = (h: EarningsEvent) => (h.dateUnknown || (h.actual == null && h.revAct == null) ? null : earningsReaction(daily, reportSessionDay(h.date, tz), h.timing, lastFinal));
  // A quarter can come twice, once from the statements without a report date and once dated: the dated one stays.
  const done = hist.filter((h) => (h.actual != null || h.revAct != null) && !(h.dateUnknown && hist.some((o) => o !== h && o.period === h.period && !o.dateUnknown)));
  // The next report: a date still to come, and not the report just made (the sources keep it a day or two).
  const lastReported = lastReportDate(hist);
  const next = hist.find((h) => h.actual == null && h.revAct == null && isUpcomingReport(h.date, lastReported, engine.today * DAY_MS));
  // Each past report with its consensus quarter, newest first: the analysts' quarters (with the statements' diluted
  // EPS where a statement quarter matches), then older reports the statements alone give. One line per quarter.
  const used = new Set<EarningsEvent>();
  const statementEps = (end: string) => {
    const t = Date.parse(`${end}T00:00:00Z`);
    const p = (real?.quarterly ?? []).find((x) => Number.isFinite(x.end) && Math.abs(x.end - t) <= 20 * DAY_MS);
    return p && Number.isFinite(p.eps) ? p.eps : null;
  };
  const fromConsensus = (consensus?.past ?? [])
    .filter((cq) => cq.date != null)
    .map((cq) => {
      const h = done.find((x) => !used.has(x) && !x.dateUnknown && Math.abs(x.date - cq.date!) <= 7 * DAY_MS);
      if (h) used.add(h);
      const ev: EarningsEvent = h ?? {
        period: cq.label,
        date: cq.date!,
        actual: statementEps(cq.end),
        timing: cq.timing === 'Bef-mkt' || cq.timing === 'Aft-mkt' ? cq.timing : '--',
        revAct: Number.isFinite(cq.rev.actual) ? cq.rev.actual / 1e6 : null,
      };
      const r = earningsReaction(daily, reportSessionDay(ev.date, tz), ev.timing, lastFinal);
      return { h: ev, r, cq };
    });
  const seen = new Set<string>();
  const reports = [...fromConsensus, ...[...done].reverse().filter((h) => !used.has(h)).map((h) => ({ h, r: reaction(h), cq: consensus && !h.dateUnknown ? matchQuarter(h.date, consensus.past) : undefined }))]
    .sort((a, b) => b.h.date - a.h.date)
    .filter((x) => {
      // The same report under two names (Q2 27 from the statements, Q2 2027 from the analysts) or twice from the statements.
      const k = x.cq ? `${x.cq.end}` : `${x.h.period}:${x.h.date}`;
      const day = `d:${Math.round(x.h.date / DAY_MS)}`;
      if (seen.has(k) || (!x.h.dateUnknown && seen.has(day))) return false;
      seen.add(k);
      if (!x.h.dateUnknown) seen.add(day);
      return true;
    });
  // The P/E on a report day: the close against the four quarters' EPS to that report (comparable when all four
  // are known, else reported).
  const peAt = (i: number) => {
    // Historical daily prices and EPS can be revised onto different split/ADR bases.
    // No dated normalization factor accompanies these inputs, so a historical multiple cannot be certified.
    void i;
    return NaN;
  };
  const quarterRows: ErnRow[] = reports.map(({ h, r, cq }, i) => {
    const e = measure === 'eps' ? cq?.eps : cq?.rev;
    // The statements' diluted EPS; for a quarter the filings do not tag (most fourth quarters), as an earnings history gives it.
    const gaapFrom = measure === 'eps' && h.actual == null && cq?.gaapEps ? cq.gaapEps.from : undefined;
    const reported = measure === 'eps' ? h.actual ?? cq?.gaapEps?.v ?? NaN : h.revAct ?? NaN;
    const comp = measure === 'eps' ? e?.actual ?? NaN : NaN;
    const estimate = measure === 'eps' ? e?.est ?? NaN : Number.isFinite(e?.est ?? NaN) ? e!.est / 1e6 : NaN;
    const base = measure === 'eps' ? comp : reported;
    // Two sources calling the quarter a beat and a miss: no surprise is shown, nor counted in the averages.
    const disagree = measure === 'eps' && cq ? epsDisagreement(cq) : undefined;
    // Revenue, always: reported on the estimate's basis where a source gives both, else the statements'.
    const revRep = cq && Number.isFinite(cq.rev.actual) ? cq.rev.actual / 1e6 : h.revAct ?? NaN;
    const revEst = cq && Number.isFinite(cq.rev.est) ? cq.rev.est / 1e6 : NaN;
    return {
      key: `${h.period}:${h.date}`,
      ann: h.dateUnknown ? '--' : fmtEarnDate(h, false),
      per: cq && canonicalQuarter(cq.label) ? cq.label : h.period.replace(/^Q([1-4]) (\d{2})$/, 'Q$1 20$2'),
      perEnd: cq?.end ? fmtIso(cq.end) : '',
      confirmed: true,
      reported,
      comp,
      est: estimate,
      surp: disagree ? NaN : measure === 'eps' ? e ? verifiedEpsSurprise(e) : NaN : Number.isFinite(base) && Number.isFinite(estimate) && estimate !== 0 ? ((base - estimate) / Math.abs(estimate)) * 100 : NaN,
      epsBasis: e ? epsBasisLabel(e.basis) : undefined,
      ...(disagree ? { disagree } : {}),
      revRep,
      revEst,
      revSurp: Number.isFinite(revRep) && Number.isFinite(revEst) && revEst !== 0 ? ((revRep - revEst) / Math.abs(revEst)) * 100 : NaN,
      px: r?.pct ?? NaN,
      pxTitle: r && Number.isFinite(r.pct) ? `${BASIS[r.basis]}: close of ${fmtDay(r.to * DAY_MS)} against close of ${fmtDay(r.from * DAY_MS)}` : r ? BASIS[r.basis] : h.dateUnknown ? 'Report date not given' : undefined,
      pe: peAt(i),
      future: false,
      from: [e && expectationNote(e), gaapFrom && `reported: ${gaapFrom}`, 'Historical P/E unavailable: dated price/EPS share adjustments are not verified.'].filter(Boolean).join('; '),
    };
  });
  return { status, real, consensus, reports, quarterRows, next, daily };
}

/**
 * Earnings history (ERN): the snapshot of surprises and price reactions beside a chart of the comparable figure
 * against the estimate, then each report with its reported and comparable figure, the estimate, the surprise,
 * the price reaction and the P/E, coming periods' estimates on top. For US-listed stocks in the desktop app the
 * analysts' figures come from Yahoo Finance, Finnhub, FMP or Alpha Vantage; nothing is generated.
 */
export function EE({ sec }: FnProps) {
  const s = sec!;
  const [annual, setAnnual] = useState(false);
  const [measure, setMeasure] = useState<Measure>('eps');
  const { status, real, consensus, reports, quarterRows, next } = useErnReports(s, measure);
  const q = engine.quote(s.id);
  const ccy = reportCcy(s);
  const panel = usePanelId();
  const fmp = analystsAvailable() && !!analystSymbol(s);
  const est = useAnalysts(fmp ? s : undefined, ['estimates']).estimates as AnalystPart<Estimate[]> | undefined;
  const fh = finnhubAvailable() && !!finnhubSymbol(s);
  const fparts = useFinnhub(fh ? s : undefined, ['calendar']);
  const cal = fparts.calendar as FinnhubPart<NextReport | null> | undefined;
  const nextFh = cal?.data ?? null;
  const nextConsensus = consensus?.next;
  const trailing = trailingComparableEps(consensus?.past ?? []);
  const epsLtm = trailing.value;
  const pe = q && trailing.ccy && epsLtm > 0 ? priceInCurrency(s, q.last, trailing.ccy) / epsLtm : NaN;
  const f = financials(s);
  // Fiscal years: the year's reported EPS or revenue, its four quarters' comparable EPS, and the Q4 report's reaction.
  const yearRows: ErnRow[] = [...f.annual].reverse().map((y) => {
    const q4 = reports.find((x) => x.cq && Math.abs(Date.parse(`${x.cq.end}T00:00:00Z`) - y.end) <= 10 * DAY_MS) ?? reports.find((x) => x.h.date > y.end && x.h.date - y.end < 100 * DAY_MS);
    const comp = measure === 'eps' ? fiscalAdjEps(consensus, y.end) : NaN;
    const reported = measure === 'eps' ? y.eps : y.rev;
    return {
      key: `FY:${y.end}`,
      ann: q4 ? fmtEarnDate(q4.h, false) : '',
      per: `FY ${new Date(y.end).getUTCFullYear().toString().slice(2)}`,
      perEnd: fmtDay(y.end),
      confirmed: true,
      reported,
      comp,
      est: NaN,
      surp: NaN,
      revRep: Number.isFinite(y.rev) ? y.rev : NaN,
      revEst: NaN,
      revSurp: NaN,
      px: q4?.r?.pct ?? NaN,
      pe: NaN,
      future: false,
    };
  });
  // Coming periods' estimates, nearest last (just above the reported ones).
  const coming: ErnRow[] = [];
  if (annual) {
    const today = new Date().toISOString().slice(0, 10);
    for (const e of (est?.state === 'ok' ? est.data ?? [] : []).filter((x) => x.date >= today).slice(0, 4).reverse()) {
      const v = measure === 'eps' ? e.epsAvg : e.revenueAvg / 1e6;
      if (!Number.isFinite(v)) continue;
      coming.push({ key: `est:${e.date}`, ann: '', per: `FY ${e.date.slice(2, 4)}`, perEnd: fmtIso(e.date), confirmed: false, reported: NaN, comp: NaN, est: v, surp: NaN, revRep: NaN, revEst: Number.isFinite(e.revenueAvg) ? e.revenueAvg / 1e6 : NaN, revSurp: NaN, px: NaN, pe: measure === 'eps' && q && e.epsAvg > 0 && (e.epsCurrency ?? e.currency ?? est?.currency ?? !listedOutsideUs(analystSymbol(s))) ? priceInCurrency(s, q.last, e.epsCurrency ?? e.currency ?? est?.currency) / e.epsAvg : NaN, future: true, from: est?.source });
    }
  } else {
    for (const v of [consensus?.following, consensus?.next].filter((x): x is NonNullable<typeof x> => !!x)) {
      const e = measure === 'eps' ? v.eps : v.rev;
      const value = measure === 'eps' ? e.est : e.est / 1e6;
      const label = /^\d{4}-\d{2}-\d{2}$/.test(v.label) && v.end ? fiscalLabel(v.end, s.eq?.fye) ?? fmtIso(v.label) : v.label;
      coming.push({ key: `next:${v.label}`, ann: v.date ? `${v.dateEstimated ? '~' : ''}${fmtDay(v.date)}` : '', per: label, perEnd: v.end ? fmtIso(v.end) : '', confirmed: !!v.date && !v.dateEstimated, reported: NaN, comp: NaN, est: value, surp: NaN, revRep: NaN, revEst: Number.isFinite(v.rev.est) ? v.rev.est / 1e6 : NaN, revSurp: NaN, px: NaN, pe: NaN, future: true, from: e.estFrom });
    }
  }
  const pastRows = annual ? yearRows : quarterRows;
  const rows = [...coming, ...pastRows];
  const recent = quarterRows.slice(0, 8);
  const stats = surpriseStats(recent.map((x) => x.surp), recent.map((x) => x.px));
  const corr = correlation(recent.map((x) => x.surp), recent.map((x) => x.px));
  const absAvg = (xs: number[]) => {
    const v = xs.filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + Math.abs(b), 0) / v.length : NaN;
  };
  // The newest dated report, as the table's first line: from the statements or the analysts' sources.
  const prior = reports.find((x) => !x.h.dateUnknown)?.h;
  // Five-year growth of reported EPS, from the fiscal years the statements give (fewer years when that is all).
  const years = f.annual.filter((y) => Number.isFinite(y.eps));
  const first = years[Math.max(0, years.length - 6)];
  const lastY = years[years.length - 1];
  const span = first && lastY ? Math.round((lastY.end - first.end) / (365.25 * DAY_MS)) : 0;
  const growth5 = first && lastY && span > 0 && first.eps > 0 && lastY.eps > 0 ? ((lastY.eps / first.eps) ** (1 / span) - 1) * 100 : NaN;
  const nextEst = nextConsensus ? (measure === 'eps' ? nextConsensus.eps.est : nextConsensus.rev.est / 1e6) : nextFh ? (measure === 'eps' ? nextFh.epsEstimate : nextFh.revenueEstimate / 1e6) : NaN;
  const nextDate = nextConsensus?.date ? `${nextConsensus.dateEstimated ? '' : '(C) '}${fmtDay(nextConsensus.date)}` : nextFh ? fmtDay(Date.parse(`${nextFh.date}T00:00:00Z`)) : next ? fmtEarnDate(next) : '--';
  const dec = measure === 'eps' ? 3 : 1;
  const fmtV = (v: number) => (!Number.isFinite(v) ? '' : measure === 'eps' ? fmtNum(v, dec) : fmtMln(v));
  // The chart: comparable (or reported revenue) against the estimate, oldest first, coming periods' estimates after.
  const chartRows = [...rows].reverse();
  const csv = () => [
    ['Ann Date', 'Per', 'Per End', 'Reported', 'Comp', 'Estimate', '%Surp', 'Revenue Reported (M)', 'Revenue Estimate (M)', 'Revenue %Surp', '%Px Chg', 'P/E', 'EPS basis', 'Definition / source / freshness'],
    ...rows.map((r) => [r.ann, r.per, r.perEnd, r.reported, r.comp, r.est, r.surp, r.revRep, r.revEst, r.revSurp, r.px, r.pe, r.epsBasis, r.from]),
    ...earningsEvidenceExport(consensus, s.id),
  ];
  const sorted = { estimate: chartRows.map((r, i) => ({ x: i, y: r.est, label: r.per })), comp: chartRows.map((r, i) => ({ x: i, y: measure === 'eps' ? r.comp : r.reported, label: r.per })) };
  return (
    <div data-audit-state={JSON.stringify(earningsAuditState(consensus, s.id, Date.now(), real?.quarterly, ccy))}>
      <FnHeader
        code="EARNINGS"
        title="Earnings History"
        sec={s}
        actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_ERN.csv`, csv)}
        controls={
          <>
            <div className="chart-tools">
              <span className="cyan">{s.name}</span>
              <label className="fld">
                Periodicity
                <select className="sel-inp" aria-label="Periodicity" value={annual ? 'A' : 'Q'} onChange={(e) => setAnnual(e.target.value === 'A')}>
                  <option value="Q">Quarterly</option>
                  <option value="A">Annuals</option>
                </select>
              </label>
              <label className="fld">
                Source
                <select className="sel-inp" aria-label="Source" value="std" disabled>
                  <option value="std">Standard</option>
                </select>
              </label>
              <label className="fld">
                Cur
                <select className="sel-inp" aria-label="Currency" value={ccy} disabled>
                  <option>{ccy}</option>
                </select>
              </label>
              <span className="muted">{sourceLabel(status, 'demo figures; real data needs the desktop app')}</span>
            </div>
            <div className="chart-tools ern-links">
              <button type="button" className="link" onClick={() => execute(panel, `${s.id} ESTIMATES`)}>1) Consensus overview | EEO »</button>
              <button type="button" className="link" onClick={() => document.getElementById(`ern-quarters-${panel}`)?.scrollIntoView({ block: 'start' })}>2) Expected and reported, revenue included »</button>
            </div>
            <div className="chart-tools">
              <label className="fld">
                Measure
                <select className="sel-inp" aria-label="Measure" value={measure} onChange={(e) => setMeasure(e.target.value as Measure)}>
                  <option value="eps">EPS, provider comparison</option>
                  <option value="rev">Revenue</option>
                </select>
              </label>
              <label className="fld">
                Px Chg Window
                <select className="sel-inp" aria-label="Price change window" value="1" disabled>
                  <option value="1">One Day After</option>
                </select>
              </label>
              <label className="fld">
                Chart Type
                <select className="sel-inp" aria-label="Chart type" value="cve" disabled>
                  <option value="cve">{measure === 'eps' ? 'Comparable vs Estimate' : 'Reported vs Estimate'}</option>
                </select>
              </label>
            </div>
          </>
        }
      />
      <EarningsEvidence c={consensus} security={s.id} />
      <div className="ern-top">
        <div>
          <div className="mov-title">Earnings/Surprise Snapshot</div>
          <div className="ern-snap">
            <KV
              items={[
                ['Industry', s.eq?.industry || '--'],
                ['Next Announcement', nextConsensus?.dateDisagree ? <span key="na" className="amber" title={nextConsensus.dateDisagree} data-testid="earnings-disagree">Sources disagree</span> : nextDate],
                ['Prior Announcement', prior ? fmtEarnDate(prior, false) : '--'],
                [`${epsBasisLabel(trailing.basis)} T12M P/E`, peText(pe, epsLtm)],
                // Compound growth needs positive EPS at both ends: "NM" for a loss-maker.
                [`${span && span < 5 ? `${span} Year` : '5 Year'} Growth`, Number.isFinite(growth5) ? fmtPct(growth5, 2) : first && lastY && span > 0 ? 'NM' : 'Not enough years'],
              ]}
            />
            <KV
              items={[
                ['Exp. for Next Period', fmtV(nextEst) || '--'],
                [`Average Surprise (n=${stats.surprises}/${recent.length})`, stats.surprises ? fmtPct(stats.avgSurprise, 2) : consensus ? '--' : "Needs the analysts' estimates (desktop app)"],
                ['Average Abs. Surp', stats.surprises ? `${fmtNum(stats.avgAbsSurprise, 2)}%` : '--'],
                [`Surp/Px Chg Corr. (n=${recent.filter((r) => Number.isFinite(r.surp) && Number.isFinite(r.px)).length})`, fmtNum(corr, 2)],
                ['Average Abs. Px Chg', stats.moves ? `${fmtNum(stats.avgAbsMove, 2)}%` : '--'],
              ]}
            />
          </div>
        </div>
        <XYChart
          height={150}
          series={[
            { label: 'Estimate', color: '#e8e8e8', points: sorted.estimate },
            { label: measure === 'eps' ? 'Comparable' : 'Reported', color: '#ff9e1b', points: sorted.comp, markers: true },
          ]}
          xTicks={chartRows.map((r, i) => ({ v: i, label: r.per.replace(/^Q(\d) (\d{2})?(\d{2})$/, 'Q$1 $3') }))}
          yFormat={(v) => (measure === 'eps' ? fmtNum(v, 2) : fmtMln(v))}
        />
      </div>
      <table className="tbl zebra ern-tbl">
        <thead>
          <tr>
            <th>Ann Date</th>
            <th>Per</th>
            <th className="hide-m">Per End</th>
            <th className="hide-m">C</th>
            <th className="num">Reported</th>
            {measure === 'eps' && <th className="num" title="EPS on the analysts' basis (usually adjusted), as the source reporting the estimate gives it">Comp</th>}
            <th className="num" title="The analysts' average estimate before the report">Estimate</th>
            <th className="num">%Surp</th>
            {measure === 'eps' && (
              <>
                <th className="num" title="Revenue reported, millions: on the analysts' basis where a source compares it, else the statements'">Rev Reported</th>
                <th className="num" title="The analysts' average revenue estimate before the report, millions">Rev Est</th>
                <th className="num" title="Reported revenue against the estimate">Rev %Surp</th>
              </>
            )}
            <th className="num" title="Close-to-close change in the share price around the report, from the daily history">%Px Chg</th>
            <th className="num hide-m" title="The price on the report day over the four quarters' EPS to that report; for coming years, today's price over the estimate">P/E</th>
          </tr>
        </thead>
        <tbody>
          <tr className="ern-avg">
            <td colSpan={2} className="white">Average of Absolute Values</td>
            <td className="hide-m" />
            <td className="hide-m" />
            <td />
            {measure === 'eps' && <td />}
            <td />
            <td className="num white">{Number.isFinite(absAvg(pastRows.map((r) => r.surp))) ? `${fmtNum(absAvg(pastRows.map((r) => r.surp)), 2)}%` : ''}</td>
            {measure === 'eps' && (
              <>
                <td />
                <td />
                <td className="num white">{Number.isFinite(absAvg(pastRows.map((r) => r.revSurp))) ? `${fmtNum(absAvg(pastRows.map((r) => r.revSurp)), 2)}%` : ''}</td>
              </>
            )}
            <td className="num white">{Number.isFinite(absAvg(pastRows.map((r) => r.px))) ? `${fmtNum(absAvg(pastRows.map((r) => r.px)), 2)}%` : ''}</td>
            <td className="hide-m" />
          </tr>
          {rows.map((r) => (
            <tr key={r.key} className={r.future ? 'ern-future' : undefined} title={r.from}>
              <td>{r.ann}</td>
              <td className="amber">{r.per}</td>
              <td className="hide-m muted">{r.perEnd}</td>
              <td className="hide-m muted">{r.future && r.confirmed ? 'C' : ''}</td>
              <td className="num white">{r.future ? '' : fmtV(r.reported) || '--'}</td>
              {measure === 'eps' && <td className="num cyan" title={r.epsBasis}>{fmtV(r.comp)} <span className="muted">{r.epsBasis}</span></td>}
              <td className="num">{fmtV(r.est)}</td>
              <td className="num">{r.disagree ? <span className="amber" title={r.disagree}>disagree</span> : Number.isFinite(r.surp) ? <Chg v={r.surp} pct dec={2} /> : ''}</td>
              {measure === 'eps' && (
                <>
                  <td className="num white">{r.future ? '' : Number.isFinite(r.revRep) ? fmtMln(r.revRep) : '--'}</td>
                  <td className="num">{Number.isFinite(r.revEst) ? fmtMln(r.revEst) : ''}</td>
                  <td className="num">{Number.isFinite(r.revSurp) ? <Chg v={r.revSurp} pct dec={2} /> : ''}</td>
                </>
              )}
              <td className="num" title={r.pxTitle}>{Number.isFinite(r.px) ? <Chg v={r.px} pct dec={2} /> : ''}</td>
              <td className="num hide-m">{Number.isFinite(r.pe) ? fmtNum(r.pe, 2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <div className="empty">{status === 'loading' ? 'Loading the earnings history…' : 'No reports from the source for this security.'}</div> : null}
      <div className="note">
        Reported: {measure === 'eps' ? 'diluted EPS' : 'revenue (millions)'} from the company&apos;s statements. {measure === 'eps' ? "Comp: EPS on the analysts' basis (usually adjusted), from the source that compares it with the estimate; %Surp sets Comp against the estimate. Revenue (millions) is shown beside EPS: reported on the estimate's basis where a source gives both, else the statements'. " : "%Surp sets reported revenue against the analysts' estimate. "}
        %Px Chg: the share price&apos;s close-to-close change around each report (before the open: the report day against the previous close; after the close: the next session against the report day). C marks a confirmed date; ~ an expected one.
        Surprise averages exclude missing estimates, unresolved definitions and equivalent-metric conflicts. Historical P/E requires verified dated split and share normalization and remains blank without it. {annual ? " Annual view: the fiscal year's figures, its four quarters' comparable EPS added up, and the fourth-quarter report's price change; coming years show the analysts' consensus." : ''}
      </div>
      {consensus ? (
        <Section title="Expected and reported, by quarter" right={consensus.problems.length && !consensus.past.length ? consensus.problems.join(' ') : consensus.problems.length ? <span className="muted" title={consensus.problems.join(' ')}>some sources unavailable</span> : undefined}>
          <div id={`ern-quarters-${panel}`} />
          <LatestReport c={consensus} statements={real?.quarterly ?? []} />
          <ExpectationsTable c={consensus} />
          <div className="note">
            Expected: the analysts&apos; average estimate before the report. EPS on the analysts&apos; basis (usually adjusted), as Yahoo Finance or Finnhub reports it, which can differ from the diluted EPS in the statements. Quarter labels name fiscal quarters: Q1 2027 is the first quarter of the company&apos;s fiscal year 2027, which can end during calendar 2026. Yahoo drops a quarter&apos;s revenue estimate once it is reported: the app keeps the last one it read before the report; Finnhub (FINNHUB_API_KEY), FMP (FMP_API_KEY) and Alpha Vantage (ALPHA_VANTAGE_API_KEY) give earlier quarters&apos;. Without Yahoo, report dates come from Alpha Vantage or the company&apos;s 8-K filings, and the coming quarters&apos; EPS estimates from Nasdaq.
          </div>
        </Section>
      ) : null}
      {fmp ? (
        <Section
          title={`Analyst estimates, by fiscal year${est?.source ? ` (${est.source})` : ''}`}
          right={
            <button type="button" className="act" onClick={() => execute(panel, `${s.id} ANALYSTS`)}>
              ANALYSTS ›
            </button>
          }
        >
          <EstimatesTable part={est} rows={4} />
          <div className="note">Annual provider consensus ({estimateUnit(s, est)}); analysts&apos; estimates, not a forecast by this app.</div>
        </Section>
      ) : null}
    </div>
  );
}
