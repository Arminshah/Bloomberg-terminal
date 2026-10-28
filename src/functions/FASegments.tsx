import { Chg, Section } from '../components/cells';
import { fmtIso, fmtNum } from '../core/format';
import { secAvailable } from '../data/live/sec';
import { BREAKDOWN_TITLE, type SegmentState, type SegmentTable } from '../data/live/segments';

/** The lines a table adds up: its top level (a parent's children are inside it). */
const topSum = (t: SegmentTable, end: string) => t.lines.filter((l) => !l.parent && l.values[end] != null).reduce((a, l) => a + l.values[end], 0);

const title = (t: SegmentTable) => `${t.metric === 'revenue' ? 'Revenue' : 'Operating income'} by ${BREAKDOWN_TITLE[t.breakdown]}`;

/** The segment tables as CSV rows: one line per member and fiscal year end. */
export function segmentRows(state: SegmentState | undefined): (string | number)[][] {
  if (state?.state !== 'ok') return [['Table', 'Line', 'Within', 'Fiscal year end', 'Value (millions)', 'Unit', 'XBRL concept', 'Filing']];
  const r = state.report;
  return [
    ['Table', 'Line', 'Within', 'Fiscal year end', 'Value (millions)', 'Unit', 'XBRL concept', 'Filing'],
    ...r.tables.flatMap((t) =>
      t.lines.flatMap((l) =>
        t.periods
          .filter((p) => l.values[p.end] != null)
          .map((p) => [title(t), l.label, l.parent ? t.lines.find((x) => x.member === l.parent)?.label ?? '' : '', p.end, l.values[p.end] / 1e6, t.unit, t.concept, `${r.form} ${r.filed} ${r.url}`]),
      ),
    ),
  ];
}

function Table({ t }: { t: SegmentTable }) {
  const [latest, previous] = t.periods;
  const denom = (end: string) => (t.total[end] != null && t.metric === 'revenue' ? t.total[end] : topSum(t, end));
  const millions = (v: number | undefined) => (v == null ? '' : fmtNum(v / 1e6, Math.abs(v) >= 1e8 ? 0 : 1));
  const sums = t.periods.map((p) => topSum(t, p.end));
  const differs = t.periods.some((p, i) => t.total[p.end] != null && Math.abs(t.total[p.end] - sums[i]) > Math.max(1e6, Math.abs(t.total[p.end]) * 0.001));
  return (
    <Section title={title(t)}>
      <table className="tbl zebra fa-tbl" data-testid={`seg-${t.metric}-${t.breakdown}`}>
        <thead>
          <tr>
            <th>In Millions of {t.unit || 'the filing’s currency'}</th>
            {t.periods.map((p) => (
              <th key={p.end} className="num" title={`${fmtIso(p.start)} to ${fmtIso(p.end)}`}>
                FY {p.end.slice(0, 4)}
              </th>
            ))}
            <th className="num" title={t.metric === 'revenue' ? 'Share of the company’s total revenue in the latest year' : 'Share of the segments’ total in the latest year'}>
              % of Total
            </th>
            <th className="num" title="Change on the year before">
              YoY
            </th>
          </tr>
        </thead>
        <tbody>
          {t.lines.map((l) => {
            const v = l.values[latest.end];
            const prev = previous ? l.values[previous.end] : undefined;
            const yoy = v != null && prev != null && prev > 0 && v >= 0 ? (v / prev - 1) * 100 : NaN;
            return (
              <tr key={l.member}>
                <td className={l.parent ? 'muted' : 'amber'} style={l.parent ? { paddingLeft: 22 } : undefined} title={l.member}>
                  {l.label}
                </td>
                {t.periods.map((p) => (
                  <td key={p.end} className={`num ${l.parent ? 'muted' : 'white'}`}>
                    {millions(l.values[p.end])}
                  </td>
                ))}
                <td className="num">{v != null && denom(latest.end) > 0 ? `${fmtNum((v / denom(latest.end)) * 100, 1)}%` : ''}</td>
                <td className="num">{Number.isFinite(yoy) ? <Chg v={yoy} pct dec={1} /> : v != null && prev != null ? <span className="muted" title="Not meaningful: from zero or a loss">NM</span> : ''}</td>
              </tr>
            );
          })}
          {differs && (
            <tr>
              <td className="muted">Lines above, added</td>
              {sums.map((v, i) => (
                <td key={i} className="num muted">
                  {millions(v)}
                </td>
              ))}
              <td />
              <td />
            </tr>
          )}
          {Object.keys(t.total).length > 0 && (
            <tr>
              <td className="amber b">{t.metric === 'revenue' ? 'Total revenue (reported)' : 'Operating income (reported)'}</td>
              {t.periods.map((p) => (
                <td key={p.end} className="num white b">
                  {millions(t.total[p.end])}
                </td>
              ))}
              <td />
              <td />
            </tr>
          )}
        </tbody>
      </table>
    </Section>
  );
}

/** FINANCIALS' Segments page. */
export function SegmentsView({ state }: { state: SegmentState | undefined }) {
  if (!secAvailable()) return <div className="empty">Segments are read from the company’s annual report (10-K) on SEC EDGAR by the desktop app.</div>;
  if (!state || state.state === 'loading') return <div className="empty">Reading the segment tables of the latest 10-K…</div>;
  if (state.state !== 'ok') return <div className="empty">{state.message}</div>;
  const r = state.report;
  return (
    <div data-testid="fa-segments">
      <div className="note">
        From the company&apos;s {r.form} filed {fmtIso(r.filed)}, as it tags its figures in XBRL ({' '}
        <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">
          the filing on EDGAR
        </a>
        ), with the names it gives its segments. Indented lines are counted within the line above them.
      </div>
      {r.tables.map((t) => (
        <Table key={`${t.metric}-${t.breakdown}`} t={t} />
      ))}
      <div className="note">
        Operating income by segment is as each company measures its segments&apos; profit; the gap to the reported total is corporate costs and items it
        keeps outside its segments. Revenue by geography is where the company says it sold, by its own regions or countries. Fiscal years end on the dates
        shown when hovering a heading.
      </div>
    </div>
  );
}
