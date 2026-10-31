import { useMemo, useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, KV, LivePx } from '../components/cells';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { sourceLabel } from '../components/Source';
import { fmtDay, fmtEarnDate, fmtMln, fmtNum, fmtStamp } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { ratingSummary } from '../data/anr';
import { blendedForwardEps, surpriseTally, type SurpriseTally } from '../data/earnings-summary';
import { surpriseStats } from '../data/ern';
import { financials, majorPrice, priceInCurrency, reportCcy } from '../data/fundamentals';
import { analystsAvailable, analystSymbol, estimateInCurrency, listedOutsideUs, useAnalysts, type AnalystPart, type Estimate, type RatingTally, type TargetConsensus } from '../data/live/analysts';
import { consensusData, earningsAuditState, epsBasisLabel, trailingComparableEps, type EstimateTrend } from '../data/live/consensus';
import { EarningsEvidence } from '../components/EarningsExpectations';
import { sameEpsDefinition, type EpsBasis } from '../data/live/earnings-evidence';
import { securityNews, useSecuritiesNews, type NewsReach } from '../data/live/secnews';
import { sourceCode } from '../data/sourcecode';
import type { SecurityDef } from '../data/types';
import { desktopData } from '../data/live/yahoo';
import { engine, useTick } from '../data/market';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';
import { Box, peText } from './DESEquity';
import { useErnReports } from './EE';
import { fiscalAdjEps } from './EEO';
import { READINGS } from './EEG';
import { quarterLines, yearLines, type TrendLine } from './EM';

/**
 * EE, Earnings & Estimates: one page that sums up a company's earnings and leads to the screens with the detail, laid
 * out as the terminal's page in a July 2024 screenshot (docs/bloomberg-parity.md, "Screenshots from three public
 * guides"): the report dates and the price's moves (ERN), the multiples on the consensus (EEO), the analysts (ANR),
 * the last quarter against its estimate and the next quarter's estimate, the trend of EPS (EM) and how the consensus
 * moved (EEG). Every figure is the one those screens show, from the same sources; nothing is generated. The provider's
 * own research box has no counterpart.
 */

const tallyText = (t: SurpriseTally) => (t.count ? `Beat ${t.above} of ${t.count}` : '--');
const tallyTitle = (t: SurpriseTally, what: string) => (t.count ? `${what} of the last ${t.count} reports with an estimate: ${t.above} above, ${t.met} at and ${t.below} below it` : 'No report with both an estimate and a comparable figure');

/** EPS's basis as the row names it ("EPS, Adj"): the analysts' stated methodology. */
const basisShort = (b: EpsBasis | undefined) => (b === 'adjusted' ? 'Adj' : b === 'gaap' ? 'GAAP' : 'Provider basis');
/** Money in millions as the table writes it, with three decimals ("308.454B", "15.938B"). */
const money = (m: number) => (Number.isFinite(m) ? fmtMln(m, 3) : '--');
const eps3 = (v: number) => (Number.isFinite(v) ? fmtNum(v, 3) : '--');
/** The consensus's move over four weeks: today's against the one 30 days before, in percent of its size then. */
export function fourWeekChange(t: Pick<EstimateTrend, 'eps'> | undefined): number {
  if (!t || !Number.isFinite(t.eps.now) || !Number.isFinite(t.eps.d30) || t.eps.d30 === 0) return NaN;
  return ((t.eps.now - t.eps.d30) / Math.abs(t.eps.d30)) * 100;
}
const chgCell = (v: number) => (Number.isFinite(v) ? <Chg v={v} pct /> : '--');
const growthPct = (v: number, base: number) => (Number.isFinite(v) && base > 0 && v >= 0 ? (v / base - 1) * 100 : NaN);
/** "Yr/26" for a fiscal year ending in 2026, as the terminal heads the column. */
const yrLabel = (end: string | number | undefined) => {
  const y = typeof end === 'number' ? new Date(end).getUTCFullYear() : Number(String(end ?? '').slice(0, 4));
  return Number.isFinite(y) && y > 0 ? `Yr/${String(y).slice(2)}` : 'Yr';
};

/** One row of 4) Company Financials: its number, the measure and its cells in the columns of the tab shown. */
type Row = { n: number; label: string; title?: string; cells: ReactNode[] };

const PEERS_TITLE = 'No source gives the peers’ estimates, so their growth cannot be compared';

/** EE's research box has no counterpart in the app: box 6 shows the company's newest story, headline and summary. */
const BOX_REACH: NewsReach = { massive: false, marketaux: false };

function NewsBox({ sec }: { sec: SecurityDef }) {
  const v = useSecuritiesNews([engine.realOnly ? sec : null], BOX_REACH);
  const { stories, states } = useMemo(() => (engine.realOnly ? securityNews(sec, BOX_REACH) : { stories: [], states: [] }), [sec, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = stories[0];
  if (!st) {
    const waiting = states.some(([, f]) => !f || f.state === 'loading');
    return <div className="empty">{!engine.realOnly ? 'Company news is read by the desktop app; the demo has none for this box.' : waiting ? 'Loading the company’s news…' : 'No recent story about the company.'}</div>;
  }
  return (
    <div className="ee-news" data-testid="ee-news">
      <a className="ee-news-hl" href={st.url} target="_blank" rel="noreferrer noopener">{st.title}</a>
      {st.summary ? <p className="ee-news-sum">{st.summary}</p> : null}
      <div className="ee-news-src muted">{fmtStamp(st.time, engine.now())} · {sourceCode(st.publisher)}</div>
    </div>
  );
}

export function EESummary({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  // The terminal's page opens on annual figures (TE04 06:27); the app's quarterly view is the other periodicity.
  const [annual, setAnnual] = useState(true);
  const [tab, setTab] = useState(21);
  const [sel, setSel] = useState(11);
  const { status, real, consensus, reports, quarterRows, next } = useErnReports(s, 'eps');
  const desktop = desktopData();
  const trends = consensusData.use((st) => st.by[s.id]?.yahoo?.trends) ?? [];
  const ltg = consensusData.use((st) => st.by[s.id]?.yahoo?.ltg) ?? NaN;
  const symbol = analystsAvailable() ? analystSymbol(s) : null;
  const parts = useAnalysts(symbol ? s : undefined, ['consensus', 'ratings', 'estimates']);
  const q = engine.quote(s.id);
  const trailing = trailingComparableEps(consensus?.past ?? []);
  const epsLtm = trailing.value;
  const pe = q && trailing.ccy && epsLtm > 0 ? priceInCurrency(s, q.last, trailing.ccy) / epsLtm : NaN;

  // 1) Earnings history: the next and last reports, and the price's average move over the last eight (as EARNINGS).
  const nc = consensus?.next;
  const nextText = nc?.date
    ? `${nc.timing && nc.timing !== '--' ? `${nc.timing} ` : ''}${nc.dateEstimated ? '(E)' : '(C)'} ${fmtDay(nc.date)}`
    : next && !next.dateUnknown
      ? `${next.timing && next.timing !== '--' ? `${next.timing} ` : ''}${next.approx ? '(E)' : '(C)'} ${fmtEarnDate(next, false)}`
      : '--';
  // The newest dated report, as the first line of EARNINGS' table: from the statements or the analysts' sources.
  const prior = reports.find((x) => !x.h.dateUnknown)?.h;
  const recent = quarterRows.slice(0, 8);
  const stats = surpriseStats(recent.map((r) => r.surp), recent.map((r) => r.px));

  // 2) Consensus: the trailing P/E, the P/E on the blended next twelve months, and the long-term growth.
  const cur = trends.find((t) => t.period === '0y');
  const nxt = trends.find((t) => t.period === '+1y');
  const ccy = cur?.ccy ?? nxt?.ccy;
  const today = new Date(engine.today * DAY_MS).toISOString().slice(0, 10);
  const bfEps = blendedForwardEps(cur && { end: cur.end, eps: cur.eps.now }, nxt && { end: nxt.end, eps: nxt.eps.now }, today);
  const px = q && (ccy || !listedOutsideUs(analystSymbol(s))) ? priceInCurrency(s, q.last, ccy) : NaN;
  const bfPe = cur && nxt && sameEpsDefinition(cur, nxt) && bfEps > 0 ? px / bfEps : NaN;
  // Next year's growth is on the year before it: Yahoo's year-ago figure, else this year's consensus.
  const growthBase = nxt && Number.isFinite(nxt.yearAgoEps) ? nxt.yearAgoEps : cur?.eps.now ?? NaN;

  // 3) Analysts: the tally of ratings and the average target, as ANALYSTS reads them.
  const ratingsPart = parts.ratings as AnalystPart<RatingTally | null> | undefined;
  const targetPart = parts.consensus as AnalystPart<TargetConsensus | null> | undefined;
  const rs = ratingsPart?.state === 'ok' && ratingsPart.data ? ratingSummary(ratingsPart.data) : null;
  const target = targetPart?.state === 'ok' && targetPart.data ? targetPart.data.mean : NaN;
  const analystText = (v: string) => (!symbol ? (desktop ? 'Not covered' : '--') : v);

  // 4) Company Financials. Annual: the fiscal year under way against the analysts' consensus (Yahoo's for EPS, with
  // its stated basis; the annual feeds' for the money lines, as EEO), and the last reported year from the statements.
  // Quarterly: the quarter to come and the last one against its estimate, as EARNINGS and EARNINGSTREND give them.
  const last = quarterRows[0];
  const epsTally = surpriseTally(recent.map((r) => r.surp));
  const revTally = surpriseTally(recent.map((r) => r.revSurp));
  const lines = consensus ? quarterLines(consensus, real?.quarterly ?? []) : [];
  const ahead = lines.find((l) => !l.reported);
  const pastLines = lines.filter((l) => l.reported).slice(-8);
  const quarterTrend = [...pastLines, ...lines.filter((l) => !l.reported)];
  const yearTrend = consensus ? yearLines(consensus, trends) : [];
  const trendLines = annual ? yearTrend : quarterTrend;
  const f = financials(s);
  const stmtCcy = reportCcy(s);
  const lastFy = f.annual[f.annual.length - 1];
  const prevFy = f.annual[f.annual.length - 2];
  const estPart = parts.estimates as AnalystPart<Estimate[]> | undefined;
  const outside = listedOutsideUs(analystSymbol(s));
  const fyEst = (estPart?.state === 'ok' ? estPart.data ?? [] : [])
    .map((e) => estimateInCurrency(e, stmtCcy, outside))
    .filter((e): e is Estimate => !!e && (!lastFy || Date.parse(`${e.date}T00:00:00Z`) > lastFy.end + 40 * DAY_MS));
  // The estimate year that is Yahoo's current fiscal year when both are known, else the first after the last report.
  const near = (e: Estimate, end: string | undefined) => !end || Math.abs(Date.parse(`${e.date}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) < 40 * DAY_MS;
  const fy0 = fyEst.find((e) => near(e, cur?.end));
  const fy1 = fyEst.find((e) => e !== fy0 && near(e, nxt?.end) && (!fy0 || e.date > fy0.date));
  const adjLast = lastFy ? fiscalAdjEps(consensus, lastFy.end) : NaN;
  const adjPrev = prevFy ? fiscalAdjEps(consensus, prevFy.end) : NaN;
  const quarterTrendNow = trends.find((t) => t.period === '0q' && nc && t.end === nc.end);
  const curLabel = annual ? yrLabel(cur?.end ?? fy0?.date) : ahead?.label ?? nc?.label ?? 'Next';
  const priorLabel = annual ? yrLabel(lastFy?.end) : last?.per ?? 'Last';
  const nextLabel = yrLabel(nxt?.end ?? fy1?.date);
  const tabs = [
    { n: 21, label: `Current Period Overview (${curLabel})` },
    { n: 22, label: `Prior Period Analysis (${priorLabel})` },
    ...(annual ? [{ n: 23, label: `Next Period (${nextLabel})` }] : []),
  ];
  const shownTab = tabs.some((t) => t.n === tab) ? tab : 21;
  const estOf = (e: Estimate | undefined, get: (x: Estimate) => number | undefined) => (e ? (get(e) ?? NaN) : NaN);
  const yearRows = (e: Estimate | undefined, t: EstimateTrend | undefined, prevRev: number): Row[] => {
    const epsNow = t?.eps.now ?? estOf(e, (x) => x.epsAvg);
    const epsGrowth = t && Number.isFinite(t.growth) && t.eps.now > 0 && t.yearAgoEps > 0 ? t.growth * 100 : NaN;
    const rev = estOf(e, (x) => x.revenueAvg) / 1e6;
    return [
      { n: 11, label: `EPS, ${basisShort(t?.basis)}`, title: t ? 'Yahoo Finance’s consensus, on its stated methodology' : 'The annual feed’s consensus; its methodology is not stated', cells: [eps3(epsNow), chgCell(fourWeekChange(t)), t && Number.isFinite(t.growth) && !Number.isFinite(epsGrowth) ? <span title="Not meaningful: to or from a loss">NM</span> : chgCell(epsGrowth), <span title={PEERS_TITLE}>--</span>, <span className="amber" title={tallyTitle(epsTally, 'EPS')}>{tallyText(epsTally)}</span>, t && Number.isFinite(t.analysts) ? t.analysts : e ? e.analystsEps : '--'] },
      { n: 12, label: 'EPS, GAAP', title: 'No source gives a consensus on reported (GAAP) EPS', cells: ['--', '--', '--', <span title={PEERS_TITLE}>--</span>, '--', '--'] },
      { n: 13, label: 'Revenue', cells: [money(rev), '--', chgCell(growthPct(rev, prevRev)), <span title={PEERS_TITLE}>--</span>, <span className="amber" title={tallyTitle(revTally, 'Revenue')}>{tallyText(revTally)}</span>, e ? e.analystsRevenue : '--'] },
      { n: 14, label: 'Net Income', title: 'The annual feed’s consensus; its methodology is not stated, so no growth on the filed figure', cells: [money(estOf(e, (x) => x.netIncomeAvg) / 1e6), '--', '--', <span title={PEERS_TITLE}>--</span>, '--', e ? e.analystsEps : '--'] },
      { n: 15, label: 'Operating Profit', cells: [money(estOf(e, (x) => x.ebitAvg) / 1e6), '--', '--', <span title={PEERS_TITLE}>--</span>, '--', '--'] },
      { n: 16, label: 'EBITDA', cells: [money(estOf(e, (x) => x.ebitdaAvg) / 1e6), '--', '--', <span title={PEERS_TITLE}>--</span>, '--', '--'] },
    ];
  };
  const estHead = (label: string) => [`${label} Est`, '4Wk Chg', 'YoY Gr', 'Growth vs Peers', 'Past Surprise', 'Analysts'];
  let head: string[];
  let rows: Row[];
  let testId: string;
  if (shownTab === 21 && annual) {
    head = estHead(curLabel);
    rows = yearRows(fy0, cur, lastFy?.rev ?? NaN);
    testId = 'ee-current';
  } else if (shownTab === 23) {
    head = estHead(nextLabel);
    rows = yearRows(fy1, nxt, estOf(fy0, (x) => x.revenueAvg) / 1e6);
    // Next year's EPS growth is on the year before it, as Yahoo gives it (NM to or from a loss).
    rows[0].cells[2] = !nxt || !Number.isFinite(nxt.growth) ? '--' : nxt.eps.now > 0 && growthBase > 0 ? <Chg v={nxt.growth * 100} pct /> : <span title="Not meaningful: growth to or from a loss">NM</span>;
    rows[0].cells[4] = '--';
    rows[2].cells[4] = '--';
    testId = 'ee-following';
  } else if (shownTab === 21) {
    head = estHead(curLabel);
    rows = [
      { n: 11, label: `EPS, ${basisShort(nc?.eps.basis)}`, cells: [eps3(nc?.eps.est ?? NaN), chgCell(fourWeekChange(quarterTrendNow)), ahead && Number.isFinite(ahead.yoy) ? <Chg v={ahead.yoy} pct /> : ahead?.nm ? <span title="Not meaningful: to or from a loss">NM</span> : '--', <span title={PEERS_TITLE}>--</span>, <span className="amber" title={tallyTitle(epsTally, 'EPS')}>{tallyText(epsTally)}</span>, nc && Number.isFinite(nc.eps.analysts) ? nc.eps.analysts : '--'] },
      { n: 12, label: 'EPS, GAAP', title: 'No source gives a consensus on reported (GAAP) EPS', cells: ['--', '--', '--', <span title={PEERS_TITLE}>--</span>, '--', '--'] },
      { n: 13, label: 'Revenue', cells: [nc && Number.isFinite(nc.rev.est) ? money(nc.rev.est / 1e6) : '--', '--', ahead && Number.isFinite(ahead.revYoy) ? <Chg v={ahead.revYoy} pct /> : '--', <span title={PEERS_TITLE}>--</span>, <span className="amber" title={tallyTitle(revTally, 'Revenue')}>{tallyText(revTally)}</span>, nc && Number.isFinite(nc.rev.analysts) ? nc.rev.analysts : '--'] },
    ];
    testId = 'ee-next';
  } else if (annual) {
    head = [`${priorLabel} Actual`, 'YoY Gr', 'Past Surprise'];
    const act = (label: string, n: number, v: number, base: number, fmt: (x: number) => string, past: ReactNode = '--', title?: string): Row => ({ n, label, title, cells: [fmt(v), chgCell(growthPct(v, base)), past] });
    rows = [
      act(`EPS, ${basisShort(Number.isFinite(adjLast) ? 'adjusted' : undefined)}`, 11, adjLast, adjPrev, eps3, <span className="amber" title={tallyTitle(epsTally, 'EPS')}>{tallyText(epsTally)}</span>, 'The fiscal year’s four quarters of comparable EPS, added up'),
      act('EPS, GAAP', 12, lastFy?.eps ?? NaN, prevFy?.eps ?? NaN, eps3, '--', 'Diluted EPS in the company’s statements'),
      act('Revenue', 13, lastFy?.rev ?? NaN, prevFy?.rev ?? NaN, money, <span className="amber" title={tallyTitle(revTally, 'Revenue')}>{tallyText(revTally)}</span>),
      act('Net Income', 14, lastFy?.niTotal ?? NaN, prevFy?.niTotal ?? NaN, money),
      act('Operating Profit', 15, lastFy?.opInc ?? NaN, prevFy?.opInc ?? NaN, money),
      act('EBITDA', 16, lastFy?.ebitda ?? NaN, prevFy?.ebitda ?? NaN, money),
    ];
    testId = 'ee-prior';
  } else {
    head = [`${priorLabel} Actual`, 'Estimate', 'Surprise', 'Past Surprise'];
    rows = [
      { n: 11, label: `EPS, ${basisShort(last?.epsBasis === 'Adjusted' ? 'adjusted' : last?.epsBasis === 'GAAP' ? 'gaap' : undefined)}`, title: "EPS on the selected provider's stated methodology", cells: [last && Number.isFinite(last.comp) ? eps3(last.comp) : '--', last && Number.isFinite(last.est) ? eps3(last.est) : '--', last?.disagree ? <span className="amber" title={last.disagree}>Sources disagree</span> : last && Number.isFinite(last.surp) ? <Chg v={last.surp} pct /> : '--', <span className="amber" title={tallyTitle(epsTally, 'EPS')}>{tallyText(epsTally)}</span>] },
      { n: 12, label: 'EPS, GAAP', title: "Diluted EPS in the company's statements", cells: [last && Number.isFinite(last.reported) ? eps3(last.reported) : '--', '--', '--', '--'] },
      { n: 13, label: 'Revenue', cells: [last && Number.isFinite(last.revRep) ? money(last.revRep) : '--', last && Number.isFinite(last.revEst) ? money(last.revEst) : '--', last && Number.isFinite(last.revSurp) ? <Chg v={last.revSurp} pct /> : '--', <span className="amber" title={tallyTitle(revTally, 'Revenue')}>{tallyText(revTally)}</span>] },
    ];
    testId = 'ee-last';
  }
  const selected = rows.some((r) => r.n === sel) ? sel : 11;

  const items: MenuItem[] = useMemo(() => {
    const go = (fn: string) => () => execute(panel, `${s.id} ${fn}`);
    return [
      { n: 1, label: 'Earnings History', run: go('EARNINGS') },
      { n: 2, label: 'Consensus Overview', run: go('ESTIMATES') },
      { n: 3, label: 'Analyst Coverage', run: go('ANALYSTS') },
      { n: 4, label: 'Company Financials', run: go('FINANCIALS') },
      { n: 5, label: 'Earnings Trends', run: go('EARNINGSTREND') },
      { n: 6, label: 'Company News', run: go('COMPANYNEWS') },
      { n: 7, label: 'Earnings Estimates Graph', run: go('ESTIMATEGRAPH') },
      { n: 21, label: 'Current Period Overview', run: () => setTab(21) },
      { n: 22, label: 'Prior Period Analysis', run: () => setTab(22) },
      ...(annual ? [{ n: 23, label: 'Next Period', run: () => setTab(23) }] : []),
      ...[11, 12, 13, 14, 15, 16].map((n) => ({ n, label: `Measure ${n}`, run: () => setSel(n) })),
    ];
  }, [panel, s.id, annual]);
  useMenu('ee-boxes', items);

  // 7) The price over the consensus's last 90 days, the fiscal year's consensus at Yahoo's five readings on it.
  const graphTrend = annual ? cur : quarterTrendNow ?? trends.find((t) => t.period === '0q');
  const daily = engine.daily(s.id);
  const priceLine: { x: number; y: number }[] = [];
  for (let i = 0; i < daily.length; i++) if (daily.t[i] >= (engine.today - 90) * DAY_MS) priceLine.push({ x: Math.round(daily.t[i] / DAY_MS) - engine.today, y: majorPrice(s, daily.c[i]) });
  const estLine = graphTrend ? READINGS.filter((r) => Number.isFinite(graphTrend.eps[r.key])).map((r) => ({ x: r.day, y: graphTrend.eps[r.key] })) : [];

  const noAnalysts = desktop ? 'No source gives this company’s estimates.' : "The analysts' figures are read by the desktop app; the browser demo has none, and none are generated.";
  return (
    <div className="fixed-page" data-audit-state={JSON.stringify(earningsAuditState(consensus, s.id, Date.now(), real?.quarterly, reportCcy(s)))}>
      <FnHeader
        code="EARNINGSSUMMARY"
        title="Earnings & Estimates"
        sec={s}
        sub={sourceLabel(status, "demo figures; the analysts' figures need the desktop app")}
        inlineControls
        controls={
          <span className="ee-ctl">
            <label className="fld">
              Periodicity
              <select className="sel-inp" aria-label="Periodicity" value={annual ? 'A' : 'Q'} onChange={(e) => setAnnual(e.target.value === 'A')}>
                <option value="A">Annuals</option>
                <option value="Q">Quarterlies</option>
              </select>
            </label>
            <span className="amber">Source</span>
            <span className="white" title="The analysts' mean estimates from the app's sources, named in the line below">Mean Consensus</span>
            <span className="amber">Cur</span>
            <span className="white">{ccy ?? stmtCcy}</span>
          </span>
        }
      />
      <EarningsEvidence c={consensus} security={s.id} />
      <div className="des-grid">
        <div className="des-col">
          <Box n={1} title="Earnings History" fn="EARNINGS" sec={s}>
            <KV
              items={[
                ['Next Announcement', nc?.dateDisagree ? <span key="na" className="amber" title={nc.dateDisagree} data-testid="earnings-disagree">Sources disagree</span> : nextText],
                ['Prior Announcement', prior ? fmtEarnDate(prior, false) : '--'],
                [
                  <span key="m" title="The average size of the share price's close-to-close move around each of the last eight reports, either way, as EARNINGS shows; the move the options imply is not worked out by the app">
                    Avg/Implied 1 Day Move
                  </span>,
                  `${stats.moves ? `${fmtNum(stats.avgAbsMove, 2)}%` : '--'} / --`,
                ],
              ]}
            />
          </Box>
        </div>
        <div className="des-col">
          <Box n={2} title="Consensus Overview" fn="ESTIMATES" sec={s}>
            <KV
              items={[
                [<span key="t" title={`The price over the last four quarters' EPS, ${epsBasisLabel(trailing.basis)}`}>Trailing 12M P/E</span>, peText(pe, epsLtm)],
                [
                  <span key="bf" title="The price over the next twelve months' EPS: the current fiscal year's consensus for the part of it still to run, the next year's for the rest (Yahoo Finance)">
                    Forward 12M P/E
                  </span>,
                  Number.isFinite(bfPe) ? fmtNum(bfPe, 2) : Number.isFinite(bfEps) && bfEps <= 0 ? <span key="nm" title="Not meaningful: the blended EPS is a loss">NM</span> : '--',
                ],
                [
                  <span key="g" title="The analysts' long-term EPS growth a year, Yahoo Finance's next five years">
                    Est. LTG (EPS)
                  </span>,
                  Number.isFinite(ltg) ? `${fmtNum(ltg * 100, 2)}%` : '--',
                ],
              ]}
            />
          </Box>
        </div>
        <div className="des-col">
          <Box n={3} title="Analyst Coverage" fn="ANALYSTS" sec={s}>
            <KV
              items={[
                ['Buy/Hold/Sell', analystText(rs ? `${rs.buys}/${rs.holds}/${rs.sells}` : '--')],
                ['Current Price', <LivePx key="p" id={s.id} />],
                ['Target Price', analystText(Number.isFinite(target) ? fmtNum(target, 2) : '--')],
              ]}
            />
          </Box>
        </div>
      </div>
      <Box
        n={4}
        title="Company Financials"
        fn="FINANCIALS"
        sec={s}
        right={
          <span className="ee-tabs">
            {tabs.map((t) => (
              <button key={t.n} type="button" className={`ee-tab${t.n === shownTab ? ' on' : ''}`} aria-pressed={t.n === shownTab} onClick={() => setTab(t.n)}>
                <b>{t.n})</b> {t.label}
              </button>
            ))}
          </span>
        }
      >
        <table className="tbl ee-tbl" data-testid={testId}>
          <thead>
            <tr>
              <th>Measure</th>
              {head.map((h) => (
                <th key={h} className="num">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.n} className={r.n === selected ? 'sel' : undefined} onClick={() => setSel(r.n)}>
                <td title={r.title}>
                  <b className="ee-n">{r.n})</b> <span className="amber">{r.label}</span>
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="num">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!consensus && <div className="empty">{noAnalysts}</div>}
      </Box>
      <div className="des-grid">
        <div className="des-col">
          <Box n={5} title="Earnings Trends" fn="EARNINGSTREND" sec={s}>
            {trendLines.length ? (
              <XYChart series={eeTrendBars(trendLines)} xTicks={trendLines.map((l, i) => ({ v: i, label: l.label }))} yFormat={(v) => fmtNum(v, 2)} refLines={[{ y: 0, color: '#555' }]} height={170} legend />
            ) : (
              <div className="empty">{consensus?.loading ? 'Loading the earnings and the consensus…' : noAnalysts}</div>
            )}
          </Box>
        </div>
        <div className="des-col">
          <Box n={6} title="Company News" fn="COMPANYNEWS" sec={s}>
            <NewsBox sec={s} />
          </Box>
        </div>
        <div className="des-col">
          <Box n={7} title="Earnings Estimates Graph" fn="ESTIMATEGRAPH" sec={s}>
            {estLine.length ? (
              <XYChart
                series={[
                  { label: 'Price', color: '#e8e8e8', points: priceLine, width: 1.2 },
                  { label: `${curLabel} EPS Estimate`, color: '#e8323c', points: estLine, markers: true, axis: 'left' },
                ]}
                xTicks={READINGS.map((r) => ({ v: r.day, label: r.day ? `${-r.day}d ago` : 'Now' }))}
                yFormat={(v) => fmtNum(v, 2)}
                y2Format={(v) => fmtNum(v, 2)}
                height={170}
                legend
              />
            ) : (
              <div className="empty">{desktop ? 'Yahoo Finance gives no consensus history for this period.' : noAnalysts}</div>
            )}
          </Box>
        </div>
      </div>
      <div className="note">
        The figures are the other screens&apos;, from the same sources: the dates, the price&apos;s moves and the surprises as EARNINGS shows them (EPS on the analysts&apos; basis against their estimate), the consensus from Yahoo Finance and the annual feeds as
        EEO reads them, the ratings and target as ANALYSTS reads them, the last fiscal year from the statements. Forward 12M P/E blends the current and next fiscal years&apos; consensus over the next twelve months; 4Wk Chg is the consensus against the one 30
        days before. Not here: the move the options market implies around the next report, how peers&apos; estimates grow, a consensus on GAAP EPS, and the provider&apos;s own research (box 6 shows the company&apos;s newest story instead).
      </div>
    </div>
  );
}

/** Earnings Trends as EE draws it (TE04 06:27): the estimate's bar in blue beside the reported one in orange. */
export function eeTrendBars(lines: TrendLine[]): XYSeries[] {
  return [
    { label: 'Estimate EPS', color: '#1e7ff0', kind: 'bar', points: lines.flatMap((l, i) => (Number.isFinite(l.est) ? [{ x: i, y: l.est }] : [])) },
    { label: 'Actual EPS', color: '#f07818', kind: 'bar', points: lines.flatMap((l, i) => (l.reported && Number.isFinite(l.eps) ? [{ x: i, y: l.eps }] : [])) },
  ];
}
