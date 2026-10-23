import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { actionLabel, position, useAnalystActions, type AnalystAction, type Position } from '../data/live/analyst-actions';
import { QuoteStrip } from '../components/QuoteStrip';
import { NotConnected } from '../components/NotConnected';
import { Chg, HBar, KV, LivePx, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtIso, fmtNum, fmtPct, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { analystData, analystsAvailable, analystSymbol, retryAnalysts, useAnalysts, type AnalystPart, type Estimate, type RatingAction, type RatingTally, type TargetConsensus, type TargetSummary } from '../data/live/analysts';
import { EquiblesResearch } from '../components/EquiblesResearch';
import { TipRanksResearch } from '../components/TipRanksResearch';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { XYChart } from '../components/chart/XYChart';
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
  const researchGeneration = analystData.use((data) => data.retry);
  const fhOn = finnhubAvailable() && !!finnhubSymbol(s) && parts.ratings?.state === 'ok' && !!parts.ratings.data && parts.ratings.source === 'FMP';
  const fh = useFinnhub(fhOn ? s : undefined, ['recommendation']).recommendation as FinnhubPart<RecommendationMonth[]> | undefined;
  const bundledRecs = parts.ratings?.recommendations;
  const recs = bundledRecs?.length ? bundledRecs : fh?.data ?? [];
  const recSource = bundledRecs?.length ? parts.ratings?.source : 'Finnhub';
  const recAt = bundledRecs?.length ? parts.ratings?.at : fh?.at;
  const recStale = bundledRecs?.length ? parts.ratings?.stale : fh?.stale;
  if (!analystsAvailable()) {
    return (
      <div>
        <FnHeader code="ANALYSTS" title="Analyst Recommendations" sec={s} sub="Price targets, ratings and estimates" />
        <QuoteStrip sec={s} />
        <NotConnected
          what="This screen shows analyst price targets, the tally of broker ratings, recent rating actions and estimates."
          why="The desktop app reads FMP, Finnhub and Yahoo research with Equibles company reports; the browser has no connected research source."
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
  const header = (
    <FnHeader
      code="ANALYSTS"
      title="Analyst Recommendations"
      sec={s}
      sub={
        <>
          Source-labelled research · FMP, Finnhub, Yahoo Finance and Equibles{at ? ` · last response ${fmtDay(at)} ${fmtTime(at, false)}` : ''}
          {all.some((p) => p?.stale) ? <span className="badge sim"> STALE</span> : null}
        </>
      }
    />
  );
  if (!symbol) {
    return (
      <div>
        {header}
        <QuoteStrip sec={s} />
        <div className="empty">FMP, Finnhub and Equibles research here covers US-listed stocks; {s.ticker} is not one. TipRanks covers some other markets:</div>
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
    <div>
      {header}
      <QuoteStrip sec={s} />
      <div className="pad-s" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={() => { retryAnalysts(); retryFinnhub(); }}>Retry analyst research</button>
        <button type="button" className="btn" onClick={() => execute(panel, 'PROVIDERS')}>Open the provider screen</button>
      </div>
      <ResearchCoverage parts={[
        ['Price targets', consensus], ['Ratings', ratings], ['Target-history averages', summary], ['Rating actions', grades], ['Annual estimates', estimates],
      ]} />
      <AnrSnapshot sec={s} c={comparableTarget ? c : null} r={r} />
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
      <EquiblesResearch key={`${symbol}:${researchGeneration}`} symbol={symbol} autoLoad={!!estimates && estimates.state !== 'loading' && !estimates.data?.length} />
      <TipRanksResearch key={s.id} def={s} />
      <div className="note">
        Targets, ratings and estimates are provider consensus and analyst opinions, not forecasts calculated by this app. Each dataset keeps its own source, fiscal/per-share basis and retrieval time. Yahoo fallback has no equivalent to FMP&apos;s period-average target history, so that dataset remains unavailable when FMP denies it. Finnhub supplies recommendation counts, not price targets. Equibles reports preserve the provider&apos;s original coverage and accounting qualifications. Research is cached for hours; opening this screen does not poll it continuously.
      </div>
    </div>
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

const hasResearch = (part: AnalystPart | undefined) => part?.state === 'ok' && (Array.isArray(part.data) ? part.data.length > 0 : !!part.data);

function ResearchCoverage({ parts }: { parts: [string, AnalystPart | undefined][] }) {
  const available = parts.filter(([, part]) => hasResearch(part)).length;
  const loading = parts.some(([, part]) => !part || part.state === 'loading');
  return <div className="pad-s" data-testid="research-coverage">
    <span className="amber">Research coverage</span> · {available}/{parts.length} datasets loaded{loading ? ' · checking remaining sources…' : ''}
    <details open={!loading && available === 0}>
      <summary style={{ cursor: 'pointer' }}>Research source availability</summary>
      <table className="tbl"><thead><tr><th>Dataset</th><th>Source</th><th>Status</th><th>Details</th></tr></thead><tbody>
        {parts.map(([label, part]) => <tr key={label}><td>{label}</td><td>{part?.source ?? '--'}</td><td>{hasResearch(part) ? part?.stale ? 'STALE' : 'Available' : !part || part.state === 'loading' ? 'Loading' : 'Unavailable'}</td><td className="muted">{(part?.problems?.length ? part.problems : part?.message ? [part.message] : []).join(' ')}</td></tr>)}
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
function AnrSnapshot({ sec, c, r }: { sec: SecurityDef; c: TargetConsensus | null; r: RatingTally | null }) {
  const rs = r ? ratingSummary(r) : null;
  const last = engine.quote(sec.id)?.last ?? NaN;
  const potential = c && Number.isFinite(c.mean) && last > 0 ? (c.mean / last - 1) * 100 : NaN;
  const share = (pct: number, count: number) => (Number.isFinite(pct) ? `${fmtNum(pct, 1)}%  ${count}` : '--');
  return (
    <div className="anr-snap">
      <KV
        items={[
          [<span key="s" title="Average of the ratings counted: strong buy 5, buy 4, hold 3, sell 2, strong sell 1">Rating score (5 buy, 1 sell)</span>, rs ? fmtNum(rs.score, 2) : '--'],
          [<span key="b" className="up">Buys</span>, rs ? share(rs.buyPct, rs.buys) : '--'],
          [<span key="h">Holds</span>, rs ? share(rs.holdPct, rs.holds) : '--'],
          [<span key="x" className="dn">Sells</span>, rs ? share(rs.sellPct, rs.sells) : '--'],
        ]}
      />
      <KV
        items={[
          ['Average target', c ? fmtNum(c.mean, 2) : '--'],
          ['Last price', <LivePx key="p" id={sec.id} />],
          ['Return potential', <Chg key="r" v={potential} pct dec={1} />],
          ['LTM return', <Chg key="l" v={periodChange(sec.id, '1Y')} pct dec={1} />],
        ]}
      />
      <TargetChart sec={sec} c={c} />
    </div>
  );
}

/** A year of closes with the consensus target and the range of targets, as ANR's chart beside its summary. */
function TargetChart({ sec, c }: { sec: SecurityDef; c: TargetConsensus | null }) {
  const daily = engine.daily(sec.id);
  const from = engine.today * DAY_MS - 365 * DAY_MS;
  const points: { x: number; y: number; label: string }[] = [];
  for (let i = 0; i < daily.length; i++) if (daily.t[i] >= from) points.push({ x: daily.t[i], y: sec.ccy === 'GBp' ? daily.c[i] / 100 : daily.c[i], label: fmtDay(daily.t[i]) });
  if (points.length < 2) return null;
  const refLines = c
    ? [
        ...(Number.isFinite(c.mean) ? [{ y: c.mean, color: '#ff9e1b', label: `12M Tgt Px ${fmtNum(c.mean, 2)}` }] : []),
        ...(Number.isFinite(c.high) ? [{ y: c.high, color: '#2fd36b', label: `High ${fmtNum(c.high, 2)}` }] : []),
        ...(Number.isFinite(c.low) ? [{ y: c.low, color: '#ff4d4f', label: `Low ${fmtNum(c.low, 2)}` }] : []),
      ]
    : [];
  return (
    <div className="anr-chart">
      <XYChart
        height={150}
        series={[{ label: 'Price', color: '#e8e8e8', points }]}
        refLines={refLines}
        xFormat={(v) => fmtDay(v)}
        yFormat={(v) => fmtNum(v, 0)}
      />
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
  if (!list.length) return <div className="note">No structured annual-estimate coverage. Equibles company research may provide a separate report.</div>;
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
