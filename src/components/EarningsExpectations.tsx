import { fmtBig, fmtDay, fmtNum } from '../core/format';
import { growth, growthSeries, surprisePct, timingLabel, type Consensus, type Expectation, type QuarterView } from '../data/live/consensus';
import type { FinPeriod } from '../data/fundamentals';

/**
 * Analysts' expectations against a company's reports (src/data/live/consensus.ts): the latest report as expected
 * and reported figures with the beat or miss and the growth, and a table of the last quarters.
 */

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));

/** "Beat by 1.7%", "Missed by 2.3%", "In line"; empty without both figures. */
export function verdict(e: Pick<Expectation, 'est' | 'actual'>): { text: string; cls: string } {
  const pct = surprisePct(e);
  if (!ok(pct)) return { text: '', cls: '' };
  if (Math.abs(pct) < 0.05) return { text: 'In line', cls: '' };
  return pct > 0 ? { text: `Beat by ${fmtNum(pct, Math.abs(pct) < 9.95 ? 1 : 0)}%`, cls: 'up' } : { text: `Missed by ${fmtNum(-pct, Math.abs(pct) < 9.95 ? 1 : 0)}%`, cls: 'dn' };
}

const eps = (v: number) => (ok(v) ? fmtNum(v, 2) : '--');
const rev = (v: number) => (ok(v) ? fmtBig(v) : '--');

function Row({ label, e, fmt }: { label: string; e: Expectation; fmt: (v: number) => string }) {
  const v = verdict(e);
  const from = [e.estFrom && `expected: ${e.estFrom}`, e.actualFrom && `reported: ${e.actualFrom}`].filter(Boolean).join('; ');
  return (
    <tr title={from || undefined}>
      <td className="amber">
        {label}
        {e.ccy ? <span className="muted"> ({e.ccy})</span> : null}
      </td>
      <td className="num">{fmt(e.est)}</td>
      <td className="num white">{fmt(e.actual)}</td>
      <td className={`num ${v.cls}`}>{v.text || (ok(e.actual) ? 'no estimate' : ok(e.est) ? 'not reported yet' : '--')}</td>
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
          <Row label="Earnings per share" e={q.eps} fmt={eps} />
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
            const ve = verdict(q.eps);
            const vr = verdict(q.rev);
            return (
              <tr key={`${q.label}:${q.end}`} title={[q.eps.estFrom && `EPS: ${q.eps.estFrom}`, q.rev.estFrom && `revenue: ${q.rev.estFrom}`].filter(Boolean).join('; ') || undefined}>
                <td className="amber">{q.label}</td>
                <td className="hide-m">{q.date ? fmtDay(q.date) : `ended ${day(q.end)}`}</td>
                <td className="hide-m muted">{timingLabel(q.timing)}</td>
                <td className="num" title={q.eps.estFrom}>{eps(q.eps.est)}</td>
                <td className="num white">{eps(q.eps.actual)}</td>
                <td className={`num ${ve.cls}`}>{ve.text || '--'}</td>
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
        <details className="note">
          <summary>Other provider EPS comparisons (reporting bases can differ)</summary>
          {c.past.filter((q) => q.alternativeEps).map((q) => (
            <div key={`${q.label}:${q.end}`}>
              {q.label}: {q.eps.estFrom} expected {eps(q.eps.est)}, reported {eps(q.eps.actual)}; {q.alternativeEps!.estFrom} expected {eps(q.alternativeEps!.est)}, reported {eps(q.alternativeEps!.actual)}. Each comparison keeps its own source and basis.
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
