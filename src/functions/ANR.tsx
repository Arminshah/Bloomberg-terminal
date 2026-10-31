// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { exportActions } from '../components/ExportActions';
import { actionLabel, latestByFirm, position, ratingTone, useAnalystActions, type AnalystAction, type Position } from '../data/live/analyst-actions';
import { NotConnected } from '../components/NotConnected';
import { Chg, HBar, KV, LivePx, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtIso, fmtNum, fmtPct, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { analystsAvailable, analystSymbol, availabilityNote, retryAnalysts, useAnalysts, type AnalystPart, type Estimate, type RatingAction, type RatingTally, type TargetConsensus, type TargetSummary } from '../data/live/analysts';
import { TipRanksResearch } from '../components/TipRanksResearch';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { XYChart } from '../components/chart/XYChart';
import { palette, useColourScheme } from '../terminal/palette';
import { DAY_MS } from '../data/calendar';
import { reportCcy } from '../data/fundamentals';
import { periodChange } from '../data/analytics';
import { ratingSummary } from '../data/anr';
import { finnhubAvailable, finnhubSymbol, retryFinnhub, useFinnhub, type FinnhubPart, type RecommendationMonth } from '../data/live/finnhub';

/**
 * Analyst research for a US-listed stock from Financial Modeling Prep (the owner's key): the price target
 * consensus against the live price, how targets moved over the last month, quarter and year, the tally of
 * broker ratings, recent rating actions and annual estimates, with source-aware fallbacks.
 */
export function ANR({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  const symbol = analystSymbol(s);
  const parts = useAnalysts(s, ['consensus', 'ratings', 'summary', 'grades', 'estimates']);
  const actions = useAnalystActions(s);
  const fhOn = finnhubAvailable() && !!finnhubSymbol(s) && parts.ratings?.state === 'ok' && !!parts.ratings.data && parts.ratings.source === 'FMP';
  const fh = useFinnhub(fhOn ? s : undefined, ['recommendation']).recommendation as FinnhubPart<RecommendationMonth[]> | undefined;
  const bundledRecs = parts.ratings?.recommendations;
  const recs = bundledRecs?.length ? bundledRecs : fh?.data ?? [];
  const recSource = bundledRecs?.length ? parts.ratings?.source : 'Finnhub';
  const recAt = bundledRecs?.length ? parts.ratings?.at : fh?.at;
  const recStale = bundledRecs?.length ? parts.ratings?.stale : fh?.stale;
  if (!analystsAvailable()) {
    return (
      <div className="fixed-page">
        <FnHeader code="ANALYSTS" title="Analyst Recommendations" sec={s} sub="Price targets, ratings and estimates" />
        <NotConnected
          what="This screen shows analyst price targets, the tally of broker ratings, recent rating actions and estimates."
          why="The desktop app reads FMP, Finnhub, Yahoo Finance and TipRanks research; the browser has no connected research source."
          needs="the desktop app with the relevant provider keys set on PROVIDERS."
        />
      </div>
    );
  }
  const consensus = parts.consensus as AnalystPart<TargetConsensus | null> | undefined;
  const ratings = parts.ratings as AnalystPart<RatingTally | null> | undefined;
  const summary = parts.summary as AnalystPart<TargetSummary | null> | undefined;
  const grades = parts.grades as AnalystPart<RatingAction[]> | undefined;
  const estimates = parts.estimates as AnalystPart<Estimate[]> | undefined;
  const all = [consensus, ratings, summary, grades, estimates];
  const at = Math.max(0, ...all.map((p) => p?.at ?? 0));
  // The red bar as TE04 07:13: "Actions ▾" and "Export" without numbers; the research controls sit in Actions.
  const firmsCsv = () => [
    ['Firm', 'Analyst', 'Recommendation', 'Target price', 'Date'],
    ...latestByFirm(actions?.rows ?? []).map((f) => [f.firm, f.analyst, f.rating, Number.isFinite(f.target) ? f.target : '', f.date]),
  ];
  const header = (
    <FnHeader
      code="ANALYSTS"
      title="Analyst Recommendations"
      sec={s}
      actions={[
        {
          n: 9601,
          bare: true,
          label: 'Actions',
          onClick: () => {},
          menu: [
            { label: 'Retry analyst research', onClick: () => { retryAnalysts(); retryFinnhub(); } },
            { label: 'Open the provider screen', onClick: () => execute(panel, 'PROVIDERS') },
            { label: 'Earnings & Estimates', sep: true, onClick: () => execute(panel, `${s.id} EARNINGSSUMMARY`) },
            { label: 'News on Analyst Activity', onClick: () => execute(panel, `${s.id} COMPANYNEWS`) },
          ],
        },
        ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_ANR.csv`, firmsCsv).filter((a) => a.n === 99).map((a) => ({ ...a, n: 9602, bare: true, label: 'Export' })),
      ]}
      sub={
        <>
          Source-labelled research · FMP, Finnhub, Yahoo Finance and Nasdaq{at ? ` · last response ${fmtDay(at)} ${fmtTime(at, false)}` : ''}
          {all.some((p) => p?.stale) ? <span className="badge sim"> STALE</span> : null}
        </>
      }
    />
  );
  if (!symbol) {
    return (
      <div className="fixed-page">
        {header}
        <div className="empty">FMP, Finnhub and Nasdaq research here covers US-listed stocks; {s.ticker} is not one. TipRanks covers some other markets:</div>
        {s.cls === 'equity' ? <TipRanksResearch key={s.id} def={s} /> : null}
      </div>
    );
  }
  const q = engine.quote(s.id);
  const last = q?.last ?? NaN;
  const c = consensus?.data ?? null;
  const r = ratings?.data ?? null;
  const sum = summary?.data ?? null;
  const targetCurrency = consensus?.currency ?? (consensus?.source === 'Yahoo Finance' ? undefined : s.ccy);
  const comparableTarget = targetCurrency === s.ccy;
  const upside = (t: number) => (Number.isFinite(t) && last > 0 ? (t / last - 1) * 100 : NaN);
  const loading = (p: AnalystPart | undefined) => !p || p.state === 'loading';
  const vs = (t: number) => <span className={upside(t) >= 0 ? 'up' : 'dn'}>{fmtPct(upside(t), 1)}</span>;
  return (
    <div className="fixed-page">
      {header}
      <AnrSnapshot sec={s} c={comparableTarget ? c : null} r={r} recs={recs} />
      {actions?.rows?.length ? <FirmRatings rows={actions.rows} sec={s} /> : null}
      <div className="cols">
        <Section title="Price target" right={targetCurrency ?? 'currency not supplied'}>
          {loading(consensus) ? (
            <div className="empty">Loading price targets…</div>
          ) : !c ? (
            <div className="empty">No price-target coverage for {symbol}. See research source availability.</div>
          ) : (
            <>
              <KV
                items={[
                  ['Last price', <LivePx key="p" id={s.id} />],
                  [
                    'Consensus (average)',
                    <span key="m" className="white b">
                      {fmtNum(c.mean, 2)} {comparableTarget ? vs(c.mean) : null}
                    </span>,
                  ],
                  [
                    'Median',
                    <span key="md">
                      {fmtNum(c.median, 2)} {comparableTarget ? vs(c.median) : null}
                    </span>,
                  ],
                  [
                    'High',
                    <span key="h">
                      {fmtNum(c.high, 2)} {comparableTarget ? <span className="muted">{fmtPct(upside(c.high), 1)}</span> : null}
                    </span>,
                  ],
                  [
                    'Low',
                    <span key="l">
                      {fmtNum(c.low, 2)} {comparableTarget ? <span className="muted">{fmtPct(upside(c.low), 1)}</span> : null}
                    </span>,
                  ],
                ]}
              />
              <TargetRange c={c} last={comparableTarget ? last : NaN} />
            </>
          )}
          <ResearchSource part={consensus} />
        </Section>
        <Section title="Ratings" right={r?.consensus ? `consensus: ${r.consensus}` : undefined}>
          {loading(ratings) ? <div className="empty">Loading ratings…</div> : !r ? <div className="empty">No rating-count coverage for {symbol}. See research source availability.</div> : <Tally r={r} />}
          <ResearchSource part={ratings} />
        </Section>
      </div>
      {fhOn || recs.length ? (
        <Section title={`Recommendation snapshots (${recSource})`} right="provider periods; relative months stay relative">
          {!recs.length && (!fh || fh.state === 'loading') ? (
            <div className="empty">Loading recommendation history…</div>
          ) : !recs.length ? (
            <div className="note">Recommendation history is unavailable.{fh?.message ? <details><summary>Source details</summary>{fh.message}</details> : null}</div>
          ) : (
            <table className="tbl zebra">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Strong buy</th>
                  <th className="num">Buy</th>
                  <th className="num">Hold</th>
                  <th className="num">Sell</th>
                  <th className="num">Strong sell</th>
                  <th className="num">Buy share</th>
                </tr>
              </thead>
              <tbody>
                {recs.slice(0, 4).map((m, i) => {
                  const total = m.strongBuy + m.buy + m.hold + m.sell + m.strongSell;
                  return (
                    <tr key={m.period ?? i}>
                      <td className="amber">{recommendationPeriod(m.period)}</td>
                      <td className="num up">{m.strongBuy}</td>
                      <td className="num up">{m.buy}</td>
                      <td className="num">{m.hold}</td>
                      <td className="num dn">{m.sell}</td>
                      <td className="num dn">{m.strongSell}</td>
                      <td className="num white">{total > 0 ? `${fmtNum(((m.strongBuy + m.buy) / total) * 100, 0)}%` : '--'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {recAt ? <div className="note">Source: {recSource} · received {fmtDay(recAt)} {fmtTime(recAt, false)}{recStale ? ' · STALE' : ''}</div> : null}
        </Section>
      ) : null}
      {loading(summary) || sum ? <Section title="How price targets moved" right="average of the targets published in each period">
        {loading(summary) ? (
          <div className="empty">Loading…</div>
        ) : !sum ? (
            <div className="note">Target-history averages are unavailable. Today's target is not a substitute for historical averages.</div>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="num">Targets</th>
                  <th className="num">Average target</th>
                  <th className="num">vs last price</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Last month', sum.lastMonth],
                    ['Last quarter', sum.lastQuarter],
                    ['Last year', sum.lastYear],
                    ['All time', sum.allTime],
                  ] as const
                ).map(([label, p]) => (
                  <tr key={label}>
                    <td className="amber">{label}</td>
                    <td className="num">{Number.isFinite(p.count) ? p.count : '--'}</td>
                    <td className="num white">{p.count > 0 ? fmtNum(p.avg, 2) : '--'}</td>
                    <td className="num">{p.count > 0 ? vs(p.avg) : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sum.publishers.length > 0 && <div className="note">Targets gathered by FMP from: {sum.publishers.join(', ')}.</div>}
            <ResearchSource part={summary} />
          </>
        )}
      </Section> : null}
      {actions?.rows?.length ? (
        <Section title="Recent rating actions" right={`${actions.rows.length} actions · MarketBeat · received ${fmtDay(actions.at)}${actions.stale ? ' · STALE: the latest request failed' : ''}`}>
          <RatingActions rows={actions.rows} last={engine.quote(s.id)?.last ?? NaN} />
        </Section>
      ) : loading(grades) || grades?.data?.length ? <Section title="Recent rating actions">
        {loading(grades) ? (
          <div className="empty">Loading…</div>
        ) : !grades?.data?.length ? (
          <div className="note">No rating-action coverage. See research source availability.</div>
        ) : (
          <><table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Firm</th>
                <th>Action</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {grades.data.slice(0, 15).map((g, i) => (
                <tr key={`${g.date}${g.firm}${i}`}>
                  <td>{fmtDay(Date.parse(`${g.date}T00:00:00Z`))}</td>
                  <td className="white">{g.firm}</td>
                  <td className={g.action === 'upgrade' ? 'up' : g.action === 'downgrade' ? 'dn' : 'muted'}>{g.action || '--'}</td>
                  <td>{g.from && g.from !== g.to ? `${g.from} → ${g.to}` : g.to}</td>
                </tr>
              ))}
            </tbody>
          </table><ResearchSource part={grades} /></>
        )}
      </Section> : null}
      <Section title="Estimates, by fiscal year" right={estimateUnit(s, estimates)}>
        <EstimatesTable part={estimates} />
      </Section>
      <MoreResearch sec={s} />
      <TipRanksResearch key={s.id} def={s} />
      <ResearchCoverage symbol={symbol} parts={[
        ['Price targets', consensus], ['Ratings', ratings], ['Target-history averages', summary], ['Rating actions', grades], ['Annual estimates', estimates],
      ]} />
      <div className="note">
        Targets, ratings and estimates are provider consensus and analyst opinions, not forecasts calculated by this app. Each dataset keeps its own source, fiscal/per-share basis and retrieval time. Yahoo fallback has no equivalent to FMP&apos;s period-average target history, so that dataset remains unavailable when FMP denies it. Finnhub supplies recommendation counts, not price targets. Research is cached for hours; opening this screen does not poll it continuously.
      </div>
    </div>
  );
}

/**
 * ANR's analyst table: each firm once with its analyst, its latest rating in its own words (coloured by meaning, an
 * upgrade marked), its latest target and the date, newest first. The provider's per-analyst return, BARR and rank are
 * its own measures and have no free source.
 */
/** Columns of the terminal's firms table that rank analysts by its own measure; no source gives them. */
const RANKING_TITLE = "The provider's own measure of how the analyst's calls did; no source the app reads gives it";

/**
 * The firms table under the summary (TE04 07:13): "Showing n of m sources", each firm's latest call with its analyst,
 * the recommendation in its tone, the target and the date, newest first; the ranking columns are labelled blanks.
 */
function FirmRatings({ rows, sec }: { rows: AnalystAction[]; sec: SecurityDef }) {
  const panel = usePanelId();
  const firms = latestByFirm(rows);
  const rated = firms.filter((f) => f.rating).length;
  return (
    <section className="sect anr-firms-box">
      <div className="sect-h anr-firms-h">
        <span className="white">Showing {rated} of {firms.length} sources</span>
        <button type="button" className="des-link" onClick={() => execute(panel, `${sec.id} COMPANYNEWS`)} title="The company's news (CN)">
          Recent News on Analyst Activity <span className="des-fn">| CN »</span>
        </button>
        <span className="right muted">MarketBeat, each firm&apos;s latest action</span>
      </div>
      <table className="tbl anr-firms">
        <thead>
          <tr>
            <th className="num">#</th>
            <th>Firm</th>
            <th>Analyst</th>
            <th>Recommendation</th>
            <th className="num">Tgt Px</th>
            <th className="amber">Date↓</th>
            <th className="num" title={RANKING_TITLE}>1 Yr Rtn</th>
            <th className="num" title={RANKING_TITLE}>BARR</th>
            <th className="num" title={RANKING_TITLE}>Rank</th>
          </tr>
        </thead>
        <tbody>
          {firms.map((f, i) => (
            <tr key={f.firm} className={f.rating ? undefined : 'muted'}>
              <td className="num anr-n">{i + 1})</td>
              <td className="amber ellipsis">{f.firm}</td>
              <td className="white ellipsis">{f.analyst}</td>
              <td className={ratingTone(f.rating)} title={f.rating ? `${f.firm}'s own words${f.upgraded ? ', an upgrade' : f.downgraded ? ', a downgrade' : ''}` : 'No rating among its actions'}>
                {f.upgraded ? <span className="up">⬆ </span> : f.downgraded ? <span className="dn">⬇ </span> : null}
                {f.rating || '--'}
              </td>
              <td className="num white">{Number.isFinite(f.target) ? fmtNum(f.target, 2) : ''}</td>
              <td className="white">{fmtDay(Date.parse(`${f.date}T00:00:00Z`))}</td>
              <td className="num muted" title={RANKING_TITLE}>--</td>
              <td className="num muted" title={RANKING_TITLE}>--</td>
              <td className="num muted" title={RANKING_TITLE}>--</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const POSITION_CLASS: Record<Position, string> = { BUY: 'up', HOLD: 'amber', SELL: 'dn', '': 'muted' };

/**
 * Analysts' rating actions as research services list them: analyst and firm, the price target before and after (green
 * raised, red lowered), the rating as buy, hold or sell, the upside to the new target from the last price, the action.
 */
function RatingActions({ rows, last }: { rows: AnalystAction[]; last: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 15);
  const money = (v: number) => `$${fmtNum(v, v >= 100 || Number.isInteger(v) ? 0 : 2)}`;
  return (
    <>
      <table className="tbl anr-actions">
        <thead>
          <tr>
            <th>Date</th>
            <th>Analyst</th>
            <th>Firm</th>
            <th className="num">Price target</th>
            <th>Position</th>
            <th className="num" title="To the new price target from the last price">Upside / downside</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const pos = position(r.rating);
            const up = Number.isFinite(r.to) && last > 0 ? (r.to / last - 1) * 100 : NaN;
            const moved = Number.isFinite(r.from) && Number.isFinite(r.to) && r.from !== r.to;
            const act = actionLabel(r);
            return (
              <tr key={`${r.date}:${r.firm}:${i}`}>
                <td>{fmtDay(Date.parse(`${r.date}T00:00:00Z`))}</td>
                <td className="white">{r.analyst}</td>
                <td>{r.firm}</td>
                <td className="num">
                  {moved ? (
                    <>
                      <span className="muted">{money(r.from)}</span> → <span className={r.to > r.from ? 'up' : 'dn'}>{money(r.to)}</span>
                    </>
                  ) : Number.isFinite(r.to) ? (
                    <span className="white">{money(r.to)}</span>
                  ) : null}
                </td>
                <td className={POSITION_CLASS[pos]} title={r.rating}>
                  {pos || r.rating}
                </td>
                <td className={`num ${up >= 0 ? 'up' : up < 0 ? 'dn' : ''}`}>{Number.isFinite(up) ? `${fmtNum(Math.abs(up), 2)}% ${up >= 0 ? 'upside' : 'downside'}` : ''}</td>
                <td className={/^Upgraded|^Raised/.test(act) ? 'up' : /^Downgraded|^Lowered/.test(act) ? 'dn' : ''} title={r.action}>
                  {act}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="note">
        As MarketBeat&apos;s forecast page lists them (rating services that are not analysts&apos; research left out). Position is the firm&apos;s rating read as buy, hold or sell; hover it for the firm&apos;s own words. Upside is to the
        new target from the last price.{' '}
        {rows.length > 15 ? (
          <button type="button" className="act" onClick={() => setAll(!all)}>
            {all ? 'Latest 15' : `All ${rows.length}`}
          </button>
        ) : null}
      </div>
    </>
  );
}

/**
 * The company research the app has on other screens, each from its own source, and what it has no source for: company
 * guidance and operating KPIs are not available (no provider the app uses publishes them in a reliable form).
 */
export const MORE_RESEARCH: { label: string; code?: string; source: string }[] = [
  { label: 'Insider trades', code: 'INSIDERS', source: "the insiders' SEC Form 4 filings" },
  { label: 'Short interest', code: 'SHORTINTEREST', source: "FINRA's settlements" },
  { label: 'Institutional and fund holders', code: 'HOLDERS', source: 'Yahoo Finance and Nasdaq, with SEC 13F filings on HOLDINGS' },
  { label: 'Earnings dates and events', code: 'EVENTS', source: 'Nasdaq, Yahoo Finance and the SEC filings' },
  { label: 'Company announcements and news', code: 'COMPANYNEWS', source: 'Finnhub, Alpaca, Massive and Marketaux, with the 8-K filings on FILINGS' },
  { label: 'Company guidance', source: 'not available: no source the app uses publishes it reliably; read the company\'s results releases on FILINGS' },
  { label: 'Company operating KPIs', source: 'not available: no source the app uses publishes them reliably' },
];

function MoreResearch({ sec }: { sec: SecurityDef }) {
  const panel = usePanelId();
  return (
    <Section title="More company research" right="on other screens">
      <table className="tbl" data-testid="more-research"><tbody>
        {MORE_RESEARCH.map((r) => (
          <tr key={r.label}>
            <td className="white">{r.label}</td>
            <td className="muted">{r.source}</td>
            <td>{r.code ? <button type="button" className="act" onClick={() => execute(panel, `${sec.id} ${r.code}`)}>{r.code}</button> : null}</td>
          </tr>
        ))}
      </tbody></table>
    </Section>
  );
}

const hasResearch = (part: AnalystPart | undefined) => part?.state === 'ok' && (Array.isArray(part.data) ? part.data.length > 0 : !!part.data);

function ResearchCoverage({ parts, symbol }: { parts: [string, AnalystPart | undefined][]; symbol: string }) {
  const available = parts.filter(([, part]) => hasResearch(part)).length;
  const loading = parts.some(([, part]) => !part || part.state === 'loading');
  return <div className="pad-s" data-testid="research-coverage">
    <span className="amber">Research coverage</span> · {available}/{parts.length} datasets loaded{loading ? ' · checking remaining sources…' : ''}
    <details open={!loading && available === 0}>
      <summary style={{ cursor: 'pointer' }}>Research source availability</summary>
      <table className="tbl"><thead><tr><th>Dataset</th><th>Source</th><th>Status</th><th>Details</th></tr></thead><tbody>
        {parts.map(([label, part]) => <tr key={label}><td>{label}</td><td>{part?.source ?? '--'}</td><td>{hasResearch(part) ? part?.stale ? 'STALE' : 'Available' : !part || part.state === 'loading' ? 'Loading' : 'Unavailable'}</td><td className="muted">{availabilityNote(part, symbol)}</td></tr>)}
      </tbody></table>
    </details>
  </div>;
}

function recommendationPeriod(period: string | undefined): string {
  if (period === '0m') return 'Current snapshot';
  const relative = /^-(\d+)m$/.exec(period ?? '');
  if (relative) return `${relative[1]} month(s) before snapshot`;
  return period && /^\d{4}-\d{2}-\d{2}$/.test(period) ? fmtDay(Date.parse(`${period}T00:00:00Z`)) : period ?? '--';
}

function ResearchSource({ part }: { part: AnalystPart | undefined }) {
  if (part?.state !== 'ok' || !part.data) return null;
  const rating = part.data as RatingTally;
  return <div className="note">Source: {part.source ?? 'FMP'}{rating.period ? ` · recommendation period ${fmtIso(rating.period, true)}` : ''}{part.currency ? ` · ${part.currency}` : ''}{part.at ? ` · received ${fmtDay(part.at)} ${fmtTime(part.at, false)}` : ''}{part.stale ? ' · STALE' : ''}{part.message ? ` · ${part.message}` : ''}</div>;
}

/** The targets' range as a line, with the median, the consensus and the last price marked on it. */
function TargetRange({ c, last }: { c: TargetConsensus; last: number }) {
  if (!Number.isFinite(c.low) || !Number.isFinite(c.high) || c.low > c.high) return null;
  const lo = Math.min(c.low, Number.isFinite(last) ? last : c.low);
  const hi = Math.max(c.high, Number.isFinite(last) ? last : c.high);
  const x = (v: number) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50);
  const mark = (v: number, color: string, label: string) =>
    Number.isFinite(v) ? <div title={`${label} ${fmtNum(v, 2)}`} style={{ position: 'absolute', left: `calc(${x(v)}% - 1px)`, top: 0, bottom: 0, width: 3, background: color }} /> : null;
  return (
    <div className="pad-s">
      <div style={{ position: 'relative', height: 14, margin: '6px 0' }}>
        <div style={{ position: 'absolute', left: `${x(c.low)}%`, width: `${x(c.high) - x(c.low)}%`, top: 6, height: 2, background: 'var(--muted)' }} />
        {mark(c.median, '#45d3e6', 'Median')}
        {mark(c.mean, 'var(--amber)', 'Consensus')}
        {mark(last, '#fff', 'Last price')}
      </div>
      <div className="note" style={{ padding: 0 }}>
        Line: lowest to highest target. Marks: <span className="amber">consensus</span>, <span style={{ color: '#45d3e6' }}>median</span>, <span className="white">last price</span>.
      </div>
    </div>
  );
}

/**
 * ANR's left-hand summary as the terminal shows it above the chart: the rating score and the shares of buys, holds and
 * sells, the average target against the last price, and the past year's return. Each line is worked out from the
 * figures the sections below show with their sources; nothing is added.
 */
/**
 * ANR's summary as TE04 07:13 lays it out: the company in cyan, Consensus Rating and the buys, holds and sells with
 * their shares and counts, then the target, the price, the currency, the return to the target and the year's return;
 * the chart beside it.
 */
function AnrSnapshot({ sec, c, r, recs }: { sec: SecurityDef; c: TargetConsensus | null; r: RatingTally | null; recs: MonthCounts[] }) {
  const rs = r ? ratingSummary(r) : null;
  const last = engine.quote(sec.id)?.last ?? NaN;
  const potential = c && Number.isFinite(c.mean) && last > 0 ? (c.mean / last - 1) * 100 : NaN;
  const share = (pct: number, count: number, tone: string) =>
    Number.isFinite(pct) ? (
      <span className="anr-share">
        <span className={tone}>{fmtNum(pct, 1)}%</span>
        <span className="anr-count">{count}</span>
      </span>
    ) : (
      '--'
    );
  return (
    <div className="anr-snap">
      <div className="anr-sum">
        <div className="anr-name">{sec.name}</div>
        <KV
          items={[
            [<span key="s" title="Average of the ratings counted on ANR's 1 to 5 scale: buys 5, holds 3, sells 1">Consensus Rating</span>, rs ? fmtNum(rs.score, 2) : '--'],
            ['Buys', rs ? share(rs.buyPct, rs.buys, 'up') : '--'],
            ['Holds', rs ? share(rs.holdPct, rs.holds, 'white') : '--'],
            ['Sells', rs ? share(rs.sellPct, rs.sells, 'dn') : '--'],
          ]}
        />
        <KV
          items={[
            [<span key="t" title="The average of the analysts' 12-month price targets">12M Tgt Px</span>, c ? fmtNum(c.mean, 2) : '--'],
            ['Last Price', <LivePx key="p" id={sec.id} />],
            ['Pricing Currency', sec.ccy],
            [<span key="r" title="12M Tgt Px over the last price, less one">Return Potential</span>, <Chg key="r" v={potential} pct dec={1} />],
            [<span key="l" title="The price change over the last 12 months">LTM Return</span>, <Chg key="l" v={periodChange(sec.id, '1Y')} pct dec={1} />],
          ]}
        />
      </div>
      <TargetChart sec={sec} c={c} recs={recs} />
    </div>
  );
}

/** A year of closes with the consensus target and the range of targets, as ANR's chart beside its summary. */
/** ANR's chart ranges; 2Y is the one its captures show. */
const CHART_RANGES: { id: string; days: number }[] = [
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
  { id: '2Y', days: 730 },
  { id: '5Y', days: 1826 },
  { id: 'Max', days: Infinity },
];

/** The ratings' colours as the chart draws them (TE04 07:13): buys green, holds tan, sells red. */
export const RATING_COLOURS = { buy: '#01831e', hold: '#b9ae65', sell: '#9e142e' };

/** A month's counts of ratings, as Finnhub and the bundled sources give them. */
type MonthCounts = Pick<RecommendationMonth, 'strongBuy' | 'buy' | 'hold' | 'sell' | 'strongSell'> & { period?: string };

/**
 * Each month's ratings as stacked shares of 100 (buys, holds, sells), from the providers' monthly counts: the bars of
 * ANR's chart.
 */
export function ratingShares(recs: MonthCounts[]): { t: number; buy: number; hold: number; sell: number }[] {
  return recs
    .filter((m): m is MonthCounts & { period: string } => !!m.period)
    .map((m) => {
      const buy = (m.strongBuy || 0) + (m.buy || 0);
      const hold = m.hold || 0;
      const sell = (m.sell || 0) + (m.strongSell || 0);
      const total = buy + hold + sell;
      return { t: Date.parse(`${m.period.slice(0, 10)}T00:00:00Z`), buy: total ? (buy / total) * 100 : NaN, hold: total ? (hold / total) * 100 : NaN, sell: total ? (sell / total) * 100 : NaN };
    })
    .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.buy))
    .sort((a, b) => a.t - b.t);
}

function TargetChart({ sec, c, recs }: { sec: SecurityDef; c: TargetConsensus | null; recs: MonthCounts[] }) {
  useColourScheme();
  const colours = palette();
  const [range, setRange] = useState('2Y');
  const days = CHART_RANGES.find((r) => r.id === range)?.days ?? 730;
  const daily = engine.daily(sec.id);
  const from = Number.isFinite(days) ? engine.today * DAY_MS - days * DAY_MS : -Infinity;
  const points: { x: number; y: number; label: string }[] = [];
  for (let i = 0; i < daily.length; i++) if (daily.t[i] >= from) points.push({ x: daily.t[i], y: sec.ccy === 'GBp' ? daily.c[i] / 100 : daily.c[i], label: fmtDay(daily.t[i]) });
  // The range buttons stay while the price history is still on its way, or missing.
  const noHistory = points.length < 2;
  // Price white, the consensus target yellow, as the terminal draws them; the ratings' shares in bars on the left scale.
  const shares = ratingShares(recs).filter((m) => m.t >= from);
  const bars = (key: 'buy' | 'hold' | 'sell', label: string) => ({ label, color: RATING_COLOURS[key], kind: 'bar' as const, stack: 'ratings', axis: 'left' as const, points: shares.map((m) => ({ x: m.t, y: m[key] })) });
  const refLines = c
    ? [
        ...(Number.isFinite(c.mean) ? [{ y: c.mean, color: '#eadb1c', label: `12M Tgt Px ${fmtNum(c.mean, 2)}` }] : []),
        ...(Number.isFinite(c.high) ? [{ y: c.high, color: colours.up, label: `High ${fmtNum(c.high, 2)}` }] : []),
        ...(Number.isFinite(c.low) ? [{ y: c.low, color: colours.dn, label: `Low ${fmtNum(c.low, 2)}` }] : []),
      ]
    : [];
  return (
    <div className="anr-chart">
      <div className="row anr-chart-top" style={{ gap: 3, marginBottom: 3 }} role="group" aria-label="Chart range">
        <span className="amber">As of</span>
        <span className="anr-asof">{fmtDay(engine.today * DAY_MS)}</span>
        {CHART_RANGES.map((r) => (
          <button key={r.id} type="button" className={`chip-btn${r.id === range ? ' on' : ''}`} aria-pressed={r.id === range} onClick={() => setRange(r.id)}>
            {r.id}
          </button>
        ))}
      </div>
      {noHistory ? (
        <div className="muted pad-s">No price history for this range yet.</div>
      ) : (
      <XYChart
        height={190}
        series={[...(shares.length ? [bars('buy', 'Buy %'), bars('hold', 'Hold %'), bars('sell', 'Sell %')] : []), { label: 'Price', color: '#e8e8e8', points }]}
        refLines={refLines}
        xFormat={(v) => fmtDay(v)}
        yFormat={(v) => fmtNum(v, 0)}
        y2Format={shares.length ? (v) => fmtNum(v, 0) : undefined}
      />
      )}
    </div>
  );
}

function Tally({ r }: { r: RatingTally }) {
  const rows: [string, number, string][] = [
    ['Strong buy', r.strongBuy, 'var(--up)'],
    ['Buy', r.buy, 'var(--up)'],
    ['Hold', r.hold, 'var(--amber)'],
    ['Sell', r.sell, 'var(--dn)'],
    ['Strong sell', r.strongSell, 'var(--dn)'],
  ];
  const total = rows.reduce((a, [, n]) => a + (Number.isFinite(n) ? n : 0), 0);
  const max = Math.max(...rows.map(([, n]) => (Number.isFinite(n) ? n : 0)), 1);
  return (
    <table className="tbl">
      <tbody>
        {rows.map(([label, n, color]) => (
          <tr key={label}>
            <td className="amber" style={{ width: 90 }}>
              {label}
            </td>
            <td className="num" style={{ width: 40 }}>
              {Number.isFinite(n) ? n : '--'}
            </td>
            <td className="num muted" style={{ width: 52 }}>
              {total > 0 && Number.isFinite(n) ? `${fmtNum((n / total) * 100, 0)}%` : ''}
            </td>
            <td>
              <HBar value={Number.isFinite(n) ? n : 0} max={max} color={color} />
            </td>
          </tr>
        ))}
        <tr>
          <td className="muted">Ratings counted</td>
          <td className="num">{total}</td>
          <td colSpan={2} />
        </tr>
      </tbody>
    </table>
  );
}

/** FMP does not say which currency its estimates are in; for a company that reports and trades in dollars it is plain. */
export function estimateUnit(s: SecurityDef, part?: AnalystPart): string {
  if (part?.source === 'Yahoo Finance') return 'Currencies shown per row · provider fiscal/per-share basis';
  return reportCcy(s) === 'USD' && s.ccy === 'USD' ? 'USD, averages with the range' : 'averages with the range; FMP does not state the currency';
}

/** FMP's annual estimates from the current fiscal year on: revenue and EPS with their ranges and analyst counts. */
export function EstimatesTable({ part, rows = 5 }: { part: AnalystPart<Estimate[]> | undefined; rows?: number }) {
  if (!part || part.state === 'loading') return <div className="empty">Loading annual estimates…</div>;
  const list = (part.data ?? []).filter((e) => Date.parse(`${e.date}T00:00:00Z`) > Date.now() - 365 * 86_400_000).slice(0, rows);
  if (!list.length) return <div className="note">No annual estimates from FMP, Yahoo Finance, Nasdaq or Alpha Vantage for this company: not available here.</div>;
  // A source with EPS estimates only (Nasdaq) shows no revenue columns.
  const hasRev = list.some((e) => Number.isFinite(e.revenueAvg));
  return (
    <><table className="tbl">
      <thead>
        <tr>
          <th>Fiscal year end</th>
          {hasRev ? <th className="num">Revenue</th> : null}
          {hasRev ? <th className="num hide-m">Range</th> : null}
          <th className="num">EPS</th>
          <th className="num hide-m">Range</th>
          <th className="num">Analysts (EPS)</th>
        </tr>
      </thead>
      <tbody>
        {list.map((e) => (
          <tr key={e.date}>
            <td className="amber">{fmtDay(Date.parse(`${e.date}T00:00:00Z`))}</td>
            {hasRev ? <td className="num white">{fmtBig(e.revenueAvg)}{part.source === 'Yahoo Finance' ? ` ${e.currency ?? '(currency not supplied)'}` : ''}</td> : null}
            {hasRev ? (
              <td className="num hide-m muted">
                {Number.isFinite(e.revenueLow) && Number.isFinite(e.revenueHigh) ? `${fmtBig(e.revenueLow)} - ${fmtBig(e.revenueHigh)}` : ''}
              </td>
            ) : null}
            <td className="num white">{fmtNum(e.epsAvg, 2)}{part.source === 'Yahoo Finance' ? ` ${e.epsCurrency ?? '(currency not supplied)'}` : ''}</td>
            <td className="num hide-m muted">
              {Number.isFinite(e.epsLow) && Number.isFinite(e.epsHigh) ? `${fmtNum(e.epsLow, 2)} - ${fmtNum(e.epsHigh, 2)}` : ''}
            </td>
            <td className="num">{Number.isFinite(e.analystsEps) ? e.analystsEps : '--'}</td>
          </tr>
        ))}
      </tbody>
    </table><ResearchSource part={part} /></>
  );
}
