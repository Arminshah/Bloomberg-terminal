import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { Chg, KV, LivePx } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { sourceLabel } from '../components/Source';
import { fmtDay, fmtEarnDate, fmtMln, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { ratingSummary } from '../data/anr';
import { blendedForwardEps, surpriseTally, type SurpriseTally } from '../data/earnings-summary';
import { surpriseStats } from '../data/ern';
import { keyStats, priceInCurrency } from '../data/fundamentals';
import { analystsAvailable, analystSymbol, listedOutsideUs, useAnalysts, type AnalystPart, type RatingTally, type TargetConsensus } from '../data/live/analysts';
import { consensusData } from '../data/live/consensus';
import { desktopData } from '../data/live/yahoo';
import { engine, useTick } from '../data/market';
import { execute } from '../terminal/exec';
import { useMenu, usePanelId } from '../terminal/panel';
import type { FnProps, MenuItem } from '../terminal/types';
import { Box, peText } from './DESEquity';
import { useErnReports } from './EE';
import { READINGS, trendSeries, trendsFor } from './EEG';
import { quarterLines, trendBars } from './EM';

/**
 * EE, Earnings & Estimates: one page that sums up a company's earnings and leads to the screens with the detail, laid
 * out as the terminal's page in a July 2024 screenshot (docs/bloomberg-parity.md, "Screenshots from three public
 * guides"): the report dates and the price's moves (ERN), the multiples on the consensus (EEO), the analysts (ANR),
 * the last quarter against its estimate and the next quarter's estimate, the trend of EPS (EM) and how the consensus
 * moved (EEG). Every figure is the one those screens show, from the same sources; nothing is generated. The provider's
 * own research box has no counterpart.
 */

const tallyText = (t: SurpriseTally) => (t.count ? `Above ${t.above}/${t.count}` : '--');
const tallyTitle = (t: SurpriseTally, what: string) => (t.count ? `${what} of the last ${t.count} reports with an estimate: ${t.above} above, ${t.met} at and ${t.below} below it` : 'No report with both an estimate and a comparable figure');

export function EESummary({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  const [tab, setTab] = useState<'last' | 'next'>('last');
  const { status, real, consensus, reports, quarterRows, next } = useErnReports(s, 'eps');
  const desktop = desktopData();
  const trends = consensusData.use((st) => st.by[s.id]?.yahoo?.trends) ?? [];
  const symbol = analystsAvailable() ? analystSymbol(s) : null;
  const parts = useAnalysts(symbol ? s : undefined, ['consensus', 'ratings']);
  const q = engine.quote(s.id);
  const { pe, epsLtm } = keyStats(s);

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

  // 2) Consensus: the trailing P/E, the P/E on the blended next twelve months, and next year's growth (Yahoo's trend).
  const cur = trends.find((t) => t.period === '0y');
  const nxt = trends.find((t) => t.period === '+1y');
  const ccy = cur?.ccy ?? nxt?.ccy;
  const today = new Date(engine.today * DAY_MS).toISOString().slice(0, 10);
  const bfEps = blendedForwardEps(cur && { end: cur.end, eps: cur.eps.now }, nxt && { end: nxt.end, eps: nxt.eps.now }, today);
  const px = q && (ccy || !listedOutsideUs(analystSymbol(s))) ? priceInCurrency(s, q.last, ccy) : NaN;
  const bfPe = bfEps > 0 ? px / bfEps : NaN;
  // Next year's growth is on the year before it: Yahoo's year-ago figure, else this year's consensus.
  const growthBase = nxt && Number.isFinite(nxt.yearAgoEps) ? nxt.yearAgoEps : cur?.eps.now ?? NaN;

  // 3) Analysts: the tally of ratings and the average target, as ANALYSTS reads them.
  const ratingsPart = parts.ratings as AnalystPart<RatingTally | null> | undefined;
  const targetPart = parts.consensus as AnalystPart<TargetConsensus | null> | undefined;
  const rs = ratingsPart?.state === 'ok' && ratingsPart.data ? ratingSummary(ratingsPart.data) : null;
  const target = targetPart?.state === 'ok' && targetPart.data ? targetPart.data.mean : NaN;
  const analystText = (v: string) => (!symbol ? (desktop ? 'Not covered' : '--') : v);

  // 4) The last report against its estimate, and the next quarter's estimate (as EARNINGS and EARNINGSTREND).
  const last = quarterRows[0];
  const epsTally = surpriseTally(recent.map((r) => r.surp));
  const revTally = surpriseTally(recent.map((r) => r.revSurp));
  const lines = consensus ? quarterLines(consensus, real?.quarterly ?? []) : [];
  const ahead = lines.find((l) => !l.reported);
  const pastLines = lines.filter((l) => l.reported).slice(-8);
  const trendLines = [...pastLines, ...lines.filter((l) => !l.reported)];
  const quarterTrends = trendsFor(trends, 1);

  const items: MenuItem[] = useMemo(() => {
    const go = (fn: string) => () => execute(panel, `${s.id} ${fn}`);
    return [
      { n: 1, label: 'Earnings History', run: go('EARNINGS') },
      { n: 2, label: 'Consensus Overview', run: go('ESTIMATES') },
      { n: 3, label: 'Analyst Coverage', run: go('ANALYSTS') },
      { n: 4, label: 'Reported and Expected', run: go('EARNINGS') },
      { n: 5, label: 'Earnings Trend', run: go('EARNINGSTREND') },
      { n: 7, label: 'Earnings Estimate Graph', run: go('ESTIMATEGRAPH') },
    ];
  }, [panel, s.id]);
  useMenu('ee-boxes', items);

  const noAnalysts = desktop ? 'No source gives this company’s estimates.' : "The analysts' figures are read by the desktop app; the browser demo has none, and none are generated.";
  return (
    <div>
      <FnHeader code="EARNINGSSUMMARY" title="Earnings & Estimates" sec={s} sub={<>Quarterly · {sourceLabel(status, "demo figures; the analysts' figures need the desktop app")}</>} />
      <QuoteStrip sec={s} />
      <div className="des-grid">
        <div className="des-col">
          <Box n={1} title="Earnings History" fn="EARNINGS" sec={s}>
            <KV
              items={[
                ['Next Announcement', nextText],
                ['Prior Announcement', prior ? fmtEarnDate(prior, false) : '--'],
                [
                  <span key="m" title="The average size of the share price's close-to-close move around each of the last eight reports, either way, as EARNINGS shows">
                    Avg Abs 1D Move
                  </span>,
                  stats.moves ? `${fmtNum(stats.avgAbsMove, 2)}%` : '--',
                ],
              ]}
            />
          </Box>
        </div>
        <div className="des-col">
          <Box n={2} title="Consensus Overview" fn="ESTIMATES" sec={s}>
            <KV
              items={[
                ['T12M P/E', peText(pe, epsLtm)],
                [
                  <span key="bf" title="The price over the next twelve months' EPS: the current fiscal year's consensus for the part of it still to run, the next year's for the rest (Yahoo Finance)">
                    BF 12M P/E
                  </span>,
                  Number.isFinite(bfPe) ? fmtNum(bfPe, 2) : Number.isFinite(bfEps) && bfEps <= 0 ? <span key="nm" title="Not meaningful: the blended EPS is a loss">NM</span> : '--',
                ],
                [
                  <span key="g" title="The next fiscal year's consensus EPS against the current year's, as Yahoo Finance gives it">
                    Est EPS Growth (next FY)
                  </span>,
                  !nxt || !Number.isFinite(nxt.growth) ? '--' : nxt.eps.now > 0 && growthBase > 0 ? <Chg key="g" v={nxt.growth * 100} pct /> : <span key="nm" title="Not meaningful: growth to or from a loss">NM</span>,
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
        title="Reported and Expected"
        fn="EARNINGS"
        sec={s}
        right={
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className={`chip-btn${tab === 'next' ? ' on' : ''}`} aria-pressed={tab === 'next'} onClick={() => setTab('next')}>
              Next{ahead ? ` (${ahead.label})` : ''}
            </button>
            <button type="button" className={`chip-btn${tab === 'last' ? ' on' : ''}`} aria-pressed={tab === 'last'} onClick={() => setTab('last')}>
              Last{last ? ` (${last.per})` : ''}
            </button>
          </span>
        }
      >
        {tab === 'last' ? (
          <table className="tbl" data-testid="ee-last">
            <thead>
              <tr>
                <th>Measure</th>
                <th className="num">Actual</th>
                <th className="num">Estimate</th>
                <th className="num">Surprise</th>
                <th className="num" title="Of the last eight reports with an estimate">Past Surprises</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="amber" title="EPS on the analysts' basis (usually adjusted)">EPS Adj+</td>
                <td className="num">{last && Number.isFinite(last.comp) ? fmtNum(last.comp, 3) : '--'}</td>
                <td className="num">{last && Number.isFinite(last.est) ? fmtNum(last.est, 3) : '--'}</td>
                <td className="num">{last?.disagree ? <span className="amber" title={last.disagree}>Sources disagree</span> : last && Number.isFinite(last.surp) ? <Chg v={last.surp} pct /> : '--'}</td>
                <td className="num" title={tallyTitle(epsTally, 'EPS')}>{tallyText(epsTally)}</td>
              </tr>
              <tr>
                <td className="amber" title="Diluted EPS in the company's statements">EPS GAAP</td>
                <td className="num">{last && Number.isFinite(last.reported) ? fmtNum(last.reported, 3) : '--'}</td>
                <td className="num">--</td>
                <td className="num">--</td>
                <td className="num">--</td>
              </tr>
              <tr>
                <td className="amber">Revenue</td>
                <td className="num">{last && Number.isFinite(last.revRep) ? fmtMln(last.revRep) : '--'}</td>
                <td className="num">{last && Number.isFinite(last.revEst) ? fmtMln(last.revEst) : '--'}</td>
                <td className="num">{last && Number.isFinite(last.revSurp) ? <Chg v={last.revSurp} pct /> : '--'}</td>
                <td className="num" title={tallyTitle(revTally, 'Revenue')}>{tallyText(revTally)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <table className="tbl" data-testid="ee-next">
            <thead>
              <tr>
                <th>Measure</th>
                <th className="num">Estimate</th>
                <th className="num">Analysts</th>
                <th className="num">Change on the Year</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="amber">EPS Adj+</td>
                <td className="num">{nc && Number.isFinite(nc.eps.est) ? fmtNum(nc.eps.est, 3) : '--'}</td>
                <td className="num">{nc && Number.isFinite(nc.eps.analysts) ? nc.eps.analysts : '--'}</td>
                <td className="num">{ahead && Number.isFinite(ahead.yoy) ? <Chg v={ahead.yoy} pct /> : ahead?.nm ? <span title="Not meaningful: to or from a loss">NM</span> : '--'}</td>
              </tr>
              <tr>
                <td className="amber">Revenue</td>
                <td className="num">{nc && Number.isFinite(nc.rev.est) ? fmtMln(nc.rev.est / 1e6) : '--'}</td>
                <td className="num">{nc && Number.isFinite(nc.rev.analysts) ? nc.rev.analysts : '--'}</td>
                <td className="num">{ahead && Number.isFinite(ahead.revYoy) ? <Chg v={ahead.revYoy} pct /> : '--'}</td>
              </tr>
            </tbody>
          </table>
        )}
        {!consensus && <div className="empty">{noAnalysts}</div>}
      </Box>
      <div className="des-grid">
        <div className="des-col">
          <Box n={5} title="Earnings Trend" fn="EARNINGSTREND" sec={s}>
            {trendLines.length ? (
              <XYChart series={trendBars(trendLines)} xTicks={trendLines.map((l, i) => ({ v: i, label: l.label }))} yFormat={(v) => fmtNum(v, 2)} refLines={[{ y: 0, color: '#555' }]} height={170} legend />
            ) : (
              <div className="empty">{consensus?.loading ? 'Loading the earnings and the consensus…' : noAnalysts}</div>
            )}
          </Box>
        </div>
        <div className="des-col">
          <Box n={7} title="Earnings Estimate Graph" fn="ESTIMATEGRAPH" sec={s}>
            {quarterTrends.length ? (
              <XYChart series={trendSeries(quarterTrends)} xTicks={READINGS.map((r) => ({ v: r.day, label: r.day ? `${-r.day}d ago` : 'Now' }))} yFormat={(v) => fmtNum(v, 2)} height={170} legend />
            ) : (
              <div className="empty">{desktop ? 'Yahoo Finance gives no consensus history for these quarters.' : noAnalysts}</div>
            )}
          </Box>
        </div>
      </div>
      <div className="note">
        The figures are the other screens&apos;, from the same sources: the dates, the price&apos;s moves and the surprises as EARNINGS shows them (EPS on the analysts&apos; basis against their estimate; revenue in millions), the consensus from Yahoo Finance, the
        ratings and target as ANALYSTS reads them. BF 12M P/E blends the current and next fiscal years&apos; consensus over the next twelve months. Not here: the move the options market implies around the next report, how peers&apos; reports compared,
        and the provider&apos;s own research.
      </div>
    </div>
  );
}
