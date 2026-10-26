import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { fmtBig, fmtIso, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import type { FinPeriod } from '../data/fundamentals';
import { consensusData, growth, growthSeries, surprisePct, useConsensus, type Consensus, type EstimateTrend, type QuarterView } from '../data/live/consensus';
import { desktopData } from '../data/live/yahoo';
import { useFundamentals } from '../data/live/yfund';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { fiscalAdjEps } from './EEO';

/**
 * EM, earnings trends: the reported quarters and fiscal years with their growth, carried on into the analysts'
 * consensus for the ones to come. Reported EPS and the consensus before each report come from the earnings sources the
 * app reads (Yahoo Finance first; the source is named on each row), all on the analysts' basis; growth compares a
 * quarter with the same quarter a year before and the one before it on that basis. The coming quarters' and years'
 * growth is against the year-ago figure the source gives. Nothing is generated.
 */

export interface TrendLine {
  label: string;
  end: string;
  reported: boolean;
  /** Reported EPS (NaN for a period to come). */
  eps: number;
  /** The consensus: before the report for a reported period, today's for one to come. */
  est: number;
  surprise: number;
  /** Change on the year in percent; `nm` when this year's figure or the year before's is a loss. */
  yoy: number;
  nm?: boolean;
  /** Change on the quarter before (quarters only). */
  qoq: number;
  rev: number;
  revEst: number;
  revYoy: number;
  analysts: number;
  from?: string;
}

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
// As growth() on the reported quarters: no growth to or from a loss (or zero), which is not meaningful (NM).
const change = (v: number, base: number | undefined) => (ok(v) && ok(base) && v > 0 && base > 0 ? (v / base - 1) * 100 : NaN);
const lossBase = (v: number, base: number | undefined) => ok(v) && ok(base) && (v <= 0 || base <= 0);

/** The reported quarter a year before `q`: by its fiscal label ("Q3 2026" for "Q3 2027"), or else by its end. */
function yearAgo(past: QuarterView[], q: QuarterView): QuarterView | undefined {
  const m = /^Q([1-4]) (\d{4})$/.exec(q.label);
  if (m) {
    const hit = past.find((p) => p.label === `Q${m[1]} ${Number(m[2]) - 1}`);
    if (hit) return hit;
  }
  return q.end ? past.find((p) => Math.abs(Date.parse(q.end) - Date.parse(p.end) - 365 * DAY_MS) <= 25 * DAY_MS) : undefined;
}

/** The reported quarters (at most `max`, oldest first), then the next two to report. */
export function quarterLines(c: Consensus, statements: FinPeriod[], max = 12): TrendLine[] {
  const past = c.past.filter((q) => q.end && (ok(q.eps.actual) || ok(q.rev.actual))).slice(0, max).reverse();
  // Every reported EPS here is on the analysts' basis, whichever source gave it, so the quarters are compared with
  // each other and never with the statements' GAAP EPS. Revenue is the same on any basis: the statements fill in.
  const dated = c.past.filter((q) => q.end);
  const epsSeries = [{ from: 'reported EPS', points: dated.map((q) => ({ end: q.end, value: q.eps.actual })) }];
  const revSeries = [{ from: 'reported revenue', points: dated.map((q) => ({ end: q.end, value: q.rev.actual })) }, growthSeries(c, statements, {}).rev[1]];
  const out: TrendLine[] = past.map((q) => {
    const ge = growth(q.end, epsSeries);
    const gr = growth(q.end, revSeries);
    // growth() gives none to or from a loss; say so when the year before is known.
    const before = yearAgo(dated, q);
    return {
      label: q.label, end: q.end, reported: true, eps: q.eps.actual, est: q.eps.est, surprise: surprisePct(q.eps),
      yoy: ge.yoy, nm: !ok(ge.yoy) && !!before && lossBase(q.eps.actual, before.eps.actual), qoq: ge.qoq,
      rev: q.rev.actual, revEst: q.rev.est, revYoy: gr.yoy, analysts: q.eps.analysts, from: q.eps.actualFrom,
    };
  });
  for (const q of [c.next, c.following]) {
    if (!q || !ok(q.eps.est)) continue;
    // The year-ago figures the source gives, or else the same quarter's as reported a year before.
    const ago = yearAgo(dated, q);
    const agoEps = ok(q.yearAgoEps) ? q.yearAgoEps : ago?.eps.actual;
    const agoRev = ok(q.yearAgoRev) ? q.yearAgoRev : ago?.rev.actual;
    out.push({
      label: q.label, end: q.end, reported: false, eps: NaN, est: q.eps.est, surprise: NaN,
      yoy: change(q.eps.est, agoEps), nm: lossBase(q.eps.est, agoEps), qoq: NaN,
      rev: NaN, revEst: q.rev.est, revYoy: change(q.rev.est, agoRev), analysts: q.eps.analysts, from: q.eps.estFrom,
    });
  }
  return out;
}

/** The fiscal year a period end closes, named by the year it ends in (an end in a month's first week counts in the month before). */
export function fiscalYearOf(end: string): number {
  const t = Date.parse(`${end}T00:00:00Z`);
  return new Date(t - (Number(end.slice(8)) <= 7 ? 8 * DAY_MS : 0)).getUTCFullYear();
}

/**
 * The fiscal years whose four quarters are all reported (their EPS added up, the analysts' basis), at most `max`,
 * then the current and next fiscal years' consensus from Yahoo's trend.
 */
export function yearLines(c: Consensus, trends: EstimateTrend[], max = 4): TrendLine[] {
  const ends = c.past.filter((q) => /^Q4 \d{4}$/.test(q.label) && q.end).map((q) => q.end).slice(0, max).reverse();
  const out: TrendLine[] = [];
  for (const end of ends) {
    const eps = fiscalAdjEps(c, Date.parse(`${end}T00:00:00Z`));
    if (!ok(eps)) continue;
    const prior = out[out.length - 1];
    const base = prior && fiscalYearOf(end) - fiscalYearOf(prior.end) === 1 ? prior.eps : NaN;
    out.push({ label: `FY ${fiscalYearOf(end)}`, end, reported: true, eps, est: NaN, surprise: NaN, yoy: change(eps, base), nm: lossBase(eps, base), qoq: NaN, rev: NaN, revEst: NaN, revYoy: NaN, analysts: NaN, from: 'reported quarters added up' });
  }
  for (const t of trends.filter((x) => x.period.endsWith('y'))) {
    if (!ok(t.eps.now)) continue;
    out.push({
      label: `FY ${fiscalYearOf(t.end)}`, end: t.end, reported: false, eps: NaN, est: t.eps.now, surprise: NaN,
      yoy: change(t.eps.now, t.yearAgoEps), nm: lossBase(t.eps.now, t.yearAgoEps), qoq: NaN,
      rev: NaN, revEst: NaN, revYoy: NaN, analysts: t.analysts, from: 'Yahoo Finance',
    });
  }
  return out;
}

export function trendBars(lines: TrendLine[]): XYSeries[] {
  return [
    { label: 'Reported EPS', color: '#e8e8e8', kind: 'bar', points: lines.flatMap((l, i) => (l.reported && ok(l.eps) ? [{ x: i, y: l.eps }] : [])) },
    { label: 'Consensus EPS', color: '#45d3e6', kind: 'scatter', markers: true, points: lines.flatMap((l, i) => (ok(l.est) ? [{ x: i, y: l.est }] : [])) },
  ];
}

const pct = (v: number, nm?: boolean) => (ok(v) ? fmtPct(v, 1) : nm ? 'NM' : '');
const dir = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');

export function EM({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const desktop = desktopData();
  const { real } = useFundamentals(s);
  const c = useConsensus(desktop ? s : undefined);
  const trends = consensusData.use((st) => st.by[s.id]?.yahoo?.trends) ?? [];
  const lines = c ? (tab === 1 ? quarterLines(c, real?.quarterly ?? []) : yearLines(c, trends)) : [];
  const ccy = c?.past.find((q) => q.eps.ccy)?.eps.ccy ?? c?.next?.eps.ccy;
  const csv = () => [
    ['Period', 'Ends', 'Reported', 'EPS', 'Consensus', 'Surprise %', 'EPS YoY %', 'EPS QoQ %', 'Revenue', 'Revenue consensus', 'Revenue YoY %', 'Analysts', 'Source'],
    ...lines.map((l) => [l.label, l.end, l.reported ? 'yes' : 'no', l.eps, l.est, l.surprise, l.yoy, l.qoq, l.rev, l.revEst, l.revYoy, l.analysts, l.from ?? '']),
  ];
  const blank = !desktop
    ? 'Reported and expected earnings are read from the earnings sources in the desktop app. The browser demo has none, and none are generated.'
    : !s.eq
      ? 'Earnings trends are for stocks only.'
      : !lines.length
        ? c?.loading
          ? 'Loading the earnings and the consensus…'
          : c?.problems[0] ?? `No source gives this company's ${tab === 1 ? 'quarters' : 'fiscal years'}.`
        : null;
  return (
    <div>
      <FnHeader
        code="EARNINGSTREND"
        title="Earnings Trends"
        sec={s}
        sub={<><RealBadge /> Reported EPS and growth, then the analysts&apos; consensus{ccy ? ` · ${ccy}` : ''}</>}
        tabs={[
          { n: 1, label: 'Quarters' },
          { n: 2, label: 'Fiscal years' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 96, label: 'Earnings', title: 'Earnings against expectations (EE)', onClick: () => execute(panel, `${s.id} EARNINGS`) },
          { n: 97, label: 'Estimates graph', title: 'How the consensus moved (EEG)', onClick: () => execute(panel, `${s.id} ESTIMATEGRAPH`) },
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_EM.csv`, csv),
        ]}
      />
      {blank ? (
        <div className="empty">{blank}</div>
      ) : (
        <>
          <XYChart
            series={trendBars(lines)}
            xTicks={lines.map((l, i) => ({ v: i, label: l.label }))}
            yFormat={(v) => fmtNum(v, 2)}
            refLines={[{ y: 0, color: '#555' }, ...(lines.some((l) => !l.reported) ? [{ x: lines.findIndex((l) => !l.reported) - 0.5, color: '#777', label: 'Consensus' }] : [])]}
            height={240}
            legend
          />
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Ends</th>
                <th className="num">EPS</th>
                <th className="num">Consensus</th>
                <th className="num">Surprise</th>
                <th className="num">EPS YoY</th>
                {tab === 1 && <th className="num hide-m">EPS QoQ</th>}
                {tab === 1 && <th className="num">Revenue</th>}
                {tab === 1 && <th className="num hide-m">Rev. consensus</th>}
                {tab === 1 && <th className="num">Rev. YoY</th>}
                <th className="num">Analysts</th>
                <th className="hide-m">Source</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={`${l.label}-${l.end}`}>
                  <td className={l.reported ? 'amber' : 'cyan'}>{l.label}{l.reported ? '' : ' Est'}</td>
                  <td>{fmtIso(l.end)}</td>
                  <td className="num white">{ok(l.eps) ? fmtNum(l.eps, 2) : ''}</td>
                  <td className="num">{ok(l.est) ? fmtNum(l.est, 2) : ''}</td>
                  <td className={`num ${dir(l.surprise)}`}>{pct(l.surprise)}</td>
                  <td className={`num ${dir(l.yoy)}`}>{pct(l.yoy, l.nm)}</td>
                  {tab === 1 && <td className={`num hide-m ${dir(l.qoq)}`}>{pct(l.qoq)}</td>}
                  {tab === 1 && <td className="num">{ok(l.rev) ? fmtBig(l.rev, 2) : ''}</td>}
                  {tab === 1 && <td className="num hide-m">{ok(l.revEst) ? fmtBig(l.revEst, 2) : ''}</td>}
                  {tab === 1 && <td className={`num ${dir(l.revYoy)}`}>{pct(l.revYoy)}</td>}
                  <td className="num">{ok(l.analysts) ? l.analysts : ''}</td>
                  <td className="muted hide-m">{l.from ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="note">
            {tab === 1
              ? 'Reported quarters, then the next two. EPS is on the analysts\u2019 basis (adjusted), compared with the same quarter a year before and the quarter before; for a quarter to come, with the year-ago figure the source gives.'
              : 'A past fiscal year is its four reported quarters added up (the analysts’ basis); a year to come is Yahoo Finance’s consensus against its year-ago EPS.'}{' '}
            Growth to or from a loss is not meaningful (NM).
          </div>
        </>
      )}
    </div>
  );
}
