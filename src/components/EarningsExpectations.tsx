import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { useState } from 'react';
import { epsBasisLabel, epsDisagreement, expectationNote, growth, growthSeries, surprisePct, verifiedEpsSurprise, timingLabel, type Consensus, type Expectation, type QuarterView } from '../data/live/consensus';
import { earningsArchiveHealth, earningsEvidence, selectEarningsVersions, type EarningsHistoryView } from '../data/live/earnings-evidence';
import type { FinPeriod } from '../data/fundamentals';

/**
 * Analysts' expectations against a company's reports (src/data/live/consensus.ts): the latest report as expected
 * and reported figures with the beat or miss and the growth, and a table of the last quarters.
 */

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));

/** "Beat by 1.7%", "Missed by 2.3%", "In line"; empty without both figures. */
export function verdict(e: Pick<Expectation, 'est' | 'actual'>, verifiedEps = false): { text: string; cls: string } {
  const pct = verifiedEps ? verifiedEpsSurprise(e as Expectation) : surprisePct(e);
  if (!ok(pct)) return { text: '', cls: '' };
  if (Math.abs(pct) < 0.05) return { text: 'In line', cls: '' };
  return pct > 0 ? { text: `Beat by ${fmtNum(pct, Math.abs(pct) < 9.95 ? 1 : 0)}%`, cls: 'up' } : { text: `Missed by ${fmtNum(-pct, Math.abs(pct) < 9.95 ? 1 : 0)}%`, cls: 'dn' };
}

const eps = (v: number) => (ok(v) ? fmtNum(v, 2) : '--');
const rev = (v: number) => (ok(v) ? fmtBig(v) : '--');

function Row({ label, e, fmt, disagree, isEps = false }: { label: string; e: Expectation; fmt: (v: number) => string; disagree?: string; isEps?: boolean }) {
  const v = disagree ? { text: 'Sources disagree', cls: 'amber' } : verdict(e, isEps);
  const from = expectationNote(e);
  return (
    <tr title={from || undefined}>
      <td className="amber">
        {label}{isEps ? ` (${epsBasisLabel(e.basis)})` : ''}
        {e.ccy ? <span className="muted"> ({e.ccy})</span> : null}
      </td>
      <td className="num">{fmt(e.est)}</td>
      <td className="num white">{fmt(e.actual)}</td>
      <td className={`num ${v.cls}`} title={disagree ?? from}>{v.text || (ok(e.actual) && ok(e.est) ? 'definition unverified' : ok(e.actual) ? 'no estimate' : ok(e.est) ? 'not reported yet' : '--')}</td>
    </tr>
  );
}

function GrowthLine({ what, pct, span, from }: { what: string; pct: number; span: string; from?: string }) {
  if (!ok(pct)) return null;
  return (
    <div title={from ? `From ${from}` : undefined}>
      {what} <span className={pct >= 0 ? 'up' : 'dn'}>{pct >= 0 ? 'up' : 'down'} {fmtNum(Math.abs(pct), Math.abs(pct) < 9.95 ? 1 : 0)}%</span> {span}
    </div>
  );
}

/** The latest report as the analysts expected it and as reported, like an earnings card, with its growth. */
export function LatestReport({ c, statements }: { c: Consensus; statements: FinPeriod[] }) {
  const q = c.past.find((x) => ok(x.eps.actual) || ok(x.rev.actual)) ?? c.past[0];
  if (!q) return <div className="empty">{c.loading ? 'Loading the analysts’ expectations…' : c.problems[0] ?? 'No source compares this company’s reports with the analysts’ estimates.'}</div>;
  const series = growthSeries(c, statements, { eps: q.eps.actualFrom, rev: q.rev.actualFrom });
  const ge = growth(q.end, series.eps);
  const gr = growth(q.end, series.rev);
  return (
    <div>
      <div className="muted" style={{ marginBottom: 4 }}>
        {q.label}{q.end ? ` (fiscal quarter ended ${day(q.end)})` : ' (period end not provided)'}{q.date ? `, reported ${fmtDay(q.date)} · ${timingLabel(q.timing)}` : ''}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Parameters</th>
            <th className="num">Expected</th>
            <th className="num">Reported</th>
            <th className="num">Beat / miss</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Earnings per share" e={q.eps} fmt={eps} disagree={epsDisagreement(q)} isEps />
          <Row label="Revenue" e={q.rev} fmt={rev} />
        </tbody>
      </table>
      <div className="earn-growth">
        <GrowthLine what="EPS" pct={ge.yoy} span="year over year" from={ge.yoyFrom} />
        <GrowthLine what="Revenue" pct={gr.yoy} span="year over year" from={gr.yoyFrom} />
        <GrowthLine what="EPS" pct={ge.qoq} span="quarter over quarter" from={ge.qoqFrom} />
        <GrowthLine what="Revenue" pct={gr.qoq} span="quarter over quarter" from={gr.qoqFrom} />
      </div>
    </div>
  );
}

/** The next quarter's estimates as KV rows: average, range and analysts, and the growth they imply. */
export function nextRows(q: QuarterView | null): [string, string][] {
  if (!q) return [];
  const range = (e: Expectation, fmt: (v: number) => string) =>
    `${fmt(e.est)}${e.ccy ? ` ${e.ccy}` : ''}${ok(e.low) && ok(e.high) ? ` (${fmt(e.low)} to ${fmt(e.high)})` : ''}${ok(e.analysts) ? `, ${e.analysts} analysts` : ''}${e.estFrom ? ` · ${e.estFrom}` : ''}`;
  const up = (est: number, ago: number | undefined) => (ok(est) && ok(ago) && ago > 0 ? `${est >= ago ? '+' : ''}${fmtNum((est / ago - 1) * 100, 1)}% on the year` : '');
  const rows: [string, string][] = [];
  if (ok(q.eps.est)) rows.push(['Expected EPS, quarter', [range(q.eps, eps), up(q.eps.est, q.yearAgoEps)].filter(Boolean).join(' · ')]);
  if (ok(q.rev.est)) rows.push(['Expected revenue, quarter', [range(q.rev, rev), up(q.rev.est, q.yearAgoRev)].filter(Boolean).join(' · ')]);
  return rows;
}

/** Expected against reported for each quarter the sources compare. */
export function ExpectationsTable({ c }: { c: Consensus }) {
  if (!c.past.length) return <div className="empty">{c.loading ? 'Loading…' : c.problems.join(' ') || 'No quarters from the sources.'}</div>;
  const hasRev = c.past.some((q) => ok(q.rev.est) || ok(q.rev.actual));
  return (
    <div>
      <table className="tbl zebra">
        <thead>
          <tr>
            <th>Quarter</th>
            <th className="hide-m">Reported</th>
            <th className="hide-m">Session</th>
            <th className="num">EPS expected</th>
            <th className="num">EPS reported</th>
            <th className="num">EPS surprise</th>
            {hasRev ? (
              <>
                <th className="num">Revenue expected</th>
                <th className="num">Revenue reported</th>
                <th className="num">Revenue surprise</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {c.past.slice(0, 8).map((q) => {
            const disagree = epsDisagreement(q);
            const ve = disagree ? { text: 'Sources disagree', cls: 'amber' } : verdict(q.eps, true);
            const vr = verdict(q.rev);
            return (
              <tr key={`${q.label}:${q.end}`} title={expectationNote(q.eps)}>
                <td className="amber">{q.label} <span className="muted">{epsBasisLabel(q.eps.basis)}{q.eps.stale ? ' · stale' : ''}</span></td>
                <td className="hide-m">{q.date ? fmtDay(q.date) : `ended ${day(q.end)}`}</td>
                <td className="hide-m muted">{timingLabel(q.timing)}</td>
                <td className="num" title={q.eps.estFrom}>{eps(q.eps.est)}</td>
                <td className="num white">{eps(q.eps.actual)}</td>
                <td className={`num ${ve.cls}`} title={disagree ?? expectationNote(q.eps)}>{ve.text || (ok(q.eps.est) && ok(q.eps.actual) ? 'definition unverified' : '--')}</td>
                {hasRev ? (
                  <>
                    <td className="num" title={ok(q.rev.est) ? q.rev.estFrom : ok(q.rev.actual) ? c.revenueHint : undefined}>{rev(q.rev.est)}</td>
                    <td className="num white">{rev(q.rev.actual)}</td>
                    <td className={`num ${vr.cls}`}>{vr.text || '--'}</td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasRev && c.revenueHint ? <div className="note amber">{c.revenueHint}</div> : null}
      {c.past.some((q) => q.alternativeEps) ? (
        <details className="note" open={c.past.some((q) => !!epsDisagreement(q))}>
          <summary>Other provider EPS comparisons (reporting bases can differ)</summary>
          {c.past.filter((q) => q.alternativeEps).map((q) => (
            <div key={`${q.label}:${q.end}`}>
              {q.label}: {q.eps.estFrom} ({epsBasisLabel(q.eps.basis)}) expected {eps(q.eps.est)}, reported {eps(q.eps.actual)}; {q.alternativeEps!.estFrom} ({epsBasisLabel(q.alternativeEps!.basis)}) expected {eps(q.alternativeEps!.est)}, reported {eps(q.alternativeEps!.actual)}. Each comparison keeps its own source and basis.
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

/** Definitions and immutable local versions are visible without implying an unreconstructed original release. */
export function EarningsEvidence({ c, security }: { c: Consensus | null; security: string }) {
  const [view, setView] = useState<EarningsHistoryView>('latest');
  const [asOf, setAsOf] = useState('');
  const records = earningsEvidence.use((s) => s.by[security]) ?? [];
  const archiveState = earningsArchiveHealth.use((s) => s.state);
  const versions = selectEarningsVersions(records, view, asOf ? Date.parse(`${asOf}Z`) : Infinity);
  return <details className="note" data-testid="earnings-evidence">
    <summary>Definitions, source checks and observation versions</summary>
    {(c?.past ?? []).slice(0, 8).map((q) => <div key={`${q.label}:${q.end}`}>
      {q.label}: {expectationNote(q.eps)}. {q.eps.sourceUrl && <a href={q.eps.sourceUrl} target="_blank" rel="noreferrer">Source</a>}
      {q.cutoffAt ? ` Estimate cutoff: ${new Date(q.cutoffAt).toISOString()} (${q.cutoffKind}).` : ' Announcement cutoff unavailable.'}
      {q.alternativeEps && <div>Alternative: expected {eps(q.alternativeEps.est)}, actual {eps(q.alternativeEps.actual)} · {expectationNote(q.alternativeEps)}</div>}
    </div>)}
    <label className="fld">Observation view <select className="sel-inp" value={view} onChange={(e) => setView(e.target.value as EarningsHistoryView)}>
      <option value="latest">Latest observed correction</option><option value="first-observed">First observed locally</option><option value="as-of">Local knowledge as of</option>
    </select></label>
    {view === 'as-of' && <label className="fld">As of (UTC) <input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label>}
    <div>First observed means the first version this installation saved. A historical feed first fetched after a report cannot reconstruct its original reported actual or pre-release consensus.</div>
    <div className={archiveState === 'memory-only' ? 'amber' : 'muted'} data-testid="earnings-archive-status">{archiveState === 'saved' ? 'Observation history saved locally.' : archiveState === 'memory-only' ? 'Local history storage is unavailable or full. These versions remain in this session; export them before closing.' : 'Local history persistence has not yet been confirmed.'} Storage is finite; recorded history is not a complete provider archive.</div>
    {versions.length ? <table className="tbl"><thead><tr><th>Period</th><th>Observation</th><th className="num">Value</th><th>Definition / source</th><th>First seen (UTC)</th><th>Revision</th></tr></thead><tbody>
      {versions.slice(-80).map((o) => <tr key={o.id}><td>{o.fiscalLabel}</td><td>{o.metric} {o.role}</td><td className="num">{fmtNum(o.value, o.metric === 'eps' ? 3 : 0)}</td><td>{epsBasisLabel(o.basis)} {o.currency} · {o.source}</td><td>{o.observedAt ? new Date(o.observedAt).toISOString() : 'unknown'}</td><td title={o.revisionOf ? `Revises ${o.revisionOf}` : undefined}>{o.id}{o.revisionOf ? ' (correction)' : ''}</td></tr>)}
    </tbody></table> : <div>No eligible observation versions are saved for this view.</div>}
  </details>;
}
