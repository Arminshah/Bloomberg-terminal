import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { NotConnected } from '../components/NotConnected';
import { HBar, KV, LivePx, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtPct, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { analystData, analystsAvailable, analystSymbol, retryAnalysts, useAnalysts, type AnalystPart, type Estimate, type RatingAction, type RatingTally, type TargetConsensus, type TargetSummary } from '../data/live/analysts';
import { EquiblesResearch } from '../components/EquiblesResearch';
import { TipRanksResearch } from '../components/TipRanksResearch';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { reportCcy } from '../data/fundamentals';
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
        <FnHeader code="ANALYSTS" title="Analyst Research" sec={s} sub="Price targets, ratings and estimates" />
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
      title="Analyst Research"
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
      {loading(grades) || grades?.data?.length ? <Section title="Recent rating actions">
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
  return <div className="note">Source: {part.source ?? 'FMP'}{rating.period ? ` · recommendation period ${rating.period}` : ''}{part.currency ? ` · ${part.currency}` : ''}{part.at ? ` · received ${fmtDay(part.at)} ${fmtTime(part.at, false)}` : ''}{part.stale ? ' · STALE' : ''}{part.message ? ` · ${part.message}` : ''}</div>;
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
  return (
    <><table className="tbl">
      <thead>
        <tr>
          <th>Fiscal year end</th>
          <th className="num">Revenue</th>
          <th className="num hide-m">Range</th>
          <th className="num">EPS</th>
          <th className="num hide-m">Range</th>
          <th className="num">Analysts (EPS)</th>
        </tr>
      </thead>
      <tbody>
        {list.map((e) => (
          <tr key={e.date}>
            <td className="amber">{fmtDay(Date.parse(`${e.date}T00:00:00Z`))}</td>
            <td className="num white">{fmtBig(e.revenueAvg)}{part.source === 'Yahoo Finance' ? ` ${e.currency ?? '(currency not supplied)'}` : ''}</td>
            <td className="num hide-m muted">
              {fmtBig(e.revenueLow)} - {fmtBig(e.revenueHigh)}
            </td>
            <td className="num white">{fmtNum(e.epsAvg, 2)}{part.source === 'Yahoo Finance' ? ` ${e.epsCurrency ?? '(currency not supplied)'}` : ''}</td>
            <td className="num hide-m muted">
              {fmtNum(e.epsLow, 2)} - {fmtNum(e.epsHigh, 2)}
            </td>
            <td className="num">{Number.isFinite(e.analystsEps) ? e.analystsEps : '--'}</td>
          </tr>
        ))}
      </tbody>
    </table><ResearchSource part={part} /></>
  );
}
