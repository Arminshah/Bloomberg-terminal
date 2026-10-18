import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { NotConnected } from '../components/NotConnected';
import { HBar, KV, LivePx, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtPct, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { analystData, analystsAvailable, analystSymbol, retryAnalysts, useAnalysts, type AnalystPart, type Estimate, type RatingAction, type RatingTally, type TargetConsensus, type TargetSummary } from '../data/live/analysts';
import { EquiblesResearch } from '../components/EquiblesResearch';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import type { SecurityDef } from '../data/types';
import { reportCcy } from '../data/fundamentals';

/**
 * Analyst research for a US-listed stock from Financial Modeling Prep (the owner's key): the price target
 * consensus against the live price, how targets moved over the last month, quarter and year, the tally of
 * broker ratings, recent rating actions and annual estimates. Yahoo's analyst data stays off.
 */
export function ANR({ sec }: FnProps) {
  const s = sec!;
  useTick(5);
  const panel = usePanelId();
  const symbol = analystSymbol(s);
  const parts = useAnalysts(s, ['consensus', 'ratings', 'summary', 'grades', 'estimates']);
  const researchGeneration = analystData.use((data) => data.retry);
  if (!analystsAvailable()) {
    return (
      <div>
        <FnHeader code="ANALYSTS" title="Analyst Research" sec={s} sub="Price targets, ratings and estimates" />
        <QuoteStrip sec={s} />
        <NotConnected
          what="This screen shows analyst price targets, the tally of broker ratings, recent rating actions and estimates."
          why="The desktop app reads FMP research, Finnhub recommendation counts and on-request Equibles company research; the browser has no connected research source."
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
          FMP research · Finnhub ratings fallback · Equibles company research{at ? ` · last response ${fmtDay(at)} ${fmtTime(at, false)}` : ''}
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
        <div className="empty">Analyst research here covers US-listed stocks; {s.ticker} is not one.</div>
      </div>
    );
  }
  const q = engine.quote(s.id);
  const last = q?.last ?? NaN;
  const c = consensus?.data ?? null;
  const r = ratings?.data ?? null;
  const sum = summary?.data ?? null;
  const upside = (t: number) => (Number.isFinite(t) && last > 0 ? (t / last - 1) * 100 : NaN);
  const loading = (p: AnalystPart | undefined) => !p || p.state === 'loading';
  const vs = (t: number) => <span className={upside(t) >= 0 ? 'up' : 'dn'}>{fmtPct(upside(t), 1)}</span>;
  return (
    <div>
      {header}
      <QuoteStrip sec={s} />
      <div className="pad-s" style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={() => retryAnalysts()}>Retry analyst research</button>
        <button type="button" className="btn" onClick={() => execute(panel, 'PROVIDERS')}>Open the provider screen</button>
      </div>
      <EquiblesResearch key={`${symbol}:${researchGeneration}`} symbol={symbol} />
      <div className="cols">
        <Section title="Price target" right={s.ccy}>
          {loading(consensus) ? (
            <div className="empty">Loading price targets from FMP…</div>
          ) : !c ? (
            <div className="empty">{consensus?.message ?? `FMP has no price targets for ${symbol}.`}</div>
          ) : (
            <>
              <KV
                items={[
                  ['Last price', <LivePx key="p" id={s.id} />],
                  [
                    'Consensus (average)',
                    <span key="m" className="white b">
                      {fmtNum(c.mean, 2)} {vs(c.mean)}
                    </span>,
                  ],
                  [
                    'Median',
                    <span key="md">
                      {fmtNum(c.median, 2)} {vs(c.median)}
                    </span>,
                  ],
                  [
                    'High',
                    <span key="h">
                      {fmtNum(c.high, 2)} <span className="muted">{fmtPct(upside(c.high), 1)}</span>
                    </span>,
                  ],
                  [
                    'Low',
                    <span key="l">
                      {fmtNum(c.low, 2)} <span className="muted">{fmtPct(upside(c.low), 1)}</span>
                    </span>,
                  ],
                ]}
              />
              <TargetRange c={c} last={last} />
            </>
          )}
          <ResearchSource part={consensus} />
        </Section>
        <Section title="Ratings" right={r?.consensus ? `consensus: ${r.consensus}` : undefined}>
          {loading(ratings) ? <div className="empty">Loading ratings…</div> : !r ? <div className="empty">{ratings?.message ?? `No ratings available for ${symbol}.`}</div> : <Tally r={r} />}
          <ResearchSource part={ratings} />
        </Section>
      </div>
      <Section title="How price targets moved" right="average of the targets published in each period">
        {loading(summary) ? (
          <div className="empty">Loading…</div>
        ) : !sum ? (
            <div className="empty">{summary?.message ?? 'No history of targets from FMP.'}</div>
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
      </Section>
      <Section title="Recent rating actions">
        {loading(grades) ? (
          <div className="empty">Loading…</div>
        ) : !grades?.data?.length ? (
          <div className="empty">{grades?.message ?? 'No rating actions from FMP.'}</div>
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
      </Section>
      <Section title="Estimates, by fiscal year" right={estimateUnit(s)}>
        <EstimatesTable part={estimates} />
      </Section>
      <div className="note">
        Price targets and ratings as Financial Modeling Prep collects them from published analyst notes and news; its consensus is the average of the targets it holds. These are analysts&apos; opinions, not a forecast by this app,
        and not investment advice. Availability depends on symbol and endpoint permissions: a valid key and remaining quota do not unlock premium requests. Finnhub fallback supplies monthly recommendation counts, not price targets. Equibles reports its own analyst-estimate coverage and distinguishes it from company guidance. FMP answers are kept for six hours (estimates for a day), with an app cap of 220 requests/day.
      </div>
    </div>
  );
}

function ResearchSource({ part }: { part: AnalystPart | undefined }) {
  if (part?.state !== 'ok' || !part.data) return null;
  const rating = part.data as RatingTally;
  return <div className="note">Source: {part.source ?? 'FMP'}{rating.period ? ` · recommendation period ${rating.period}` : ''}{part.at ? ` · received ${fmtDay(part.at)} ${fmtTime(part.at, false)}` : ''}{part.stale ? ' · STALE' : ''}{part.message ? ` · ${part.message}` : ''}</div>;
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
export function estimateUnit(s: SecurityDef): string {
  return reportCcy(s) === 'USD' && s.ccy === 'USD' ? 'USD, averages with the range' : 'averages with the range; FMP does not state the currency';
}

/** FMP's annual estimates from the current fiscal year on: revenue and EPS with their ranges and analyst counts. */
export function EstimatesTable({ part, rows = 5 }: { part: AnalystPart<Estimate[]> | undefined; rows?: number }) {
  if (!part || part.state === 'loading') return <div className="empty">Loading estimates from FMP…</div>;
  const list = (part.data ?? []).filter((e) => Date.parse(`${e.date}T00:00:00Z`) > Date.now() - 365 * 86_400_000).slice(0, rows);
  if (!list.length) return <div className="empty">{part.state === 'ok' ? 'No estimates from FMP.' : (part.message ?? 'No estimates from FMP.')}</div>;
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
            <td className="num white">{fmtBig(e.revenueAvg)}</td>
            <td className="num hide-m muted">
              {fmtBig(e.revenueLow)} - {fmtBig(e.revenueHigh)}
            </td>
            <td className="num white">{fmtNum(e.epsAvg, 2)}</td>
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
