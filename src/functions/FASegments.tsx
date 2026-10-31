// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { Fragment, useState } from 'react';
import { Chg, Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { fmtDay, fmtIso, fmtNum } from '../core/format';
import { secAvailable } from '../data/live/sec';
import { BREAKDOWN_TITLE, type Breakdown, type SegmentLine, type SegmentState, type SegmentTable } from '../data/live/segments';

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

/** A figure in millions with one decimal, as FA's grid writes it ("46,710.0"). */
const millions = (v: number | undefined) => (v == null ? '' : fmtNum(v / 1e6, 1));
/** A line's share of its measure's total with two decimals, as the terminal writes it ("95.13%", "122.61%"). */
const share = (v: number | undefined, total: number) => (v != null && Number.isFinite(total) && total > 0 ? `${fmtNum((v / total) * 100, 2)}%` : '');
/** The measure's total: the company's own when it reports one, else its lines added. */
const totalOf = (t: SegmentTable, end: string) => t.total[end] ?? topSum(t, end);
/** Growth on the year before, from a positive base only. */
const growth = (v: number | undefined, prev: number | undefined) => (v != null && prev != null && prev > 0 && v >= 0 ? (v / prev - 1) * 100 : NaN);

/** The lines in reading order with their depth: each line followed by the lines the filing counts within it. */
function ordered(t: SegmentTable): { line: SegmentLine; depth: number }[] {
  const within = new Map<string, SegmentLine[]>();
  for (const l of t.lines) if (l.parent) within.set(l.parent, [...(within.get(l.parent) ?? []), l]);
  const out: { line: SegmentLine; depth: number }[] = [];
  const walk = (l: SegmentLine, depth: number) => {
    out.push({ line: l, depth });
    for (const k of within.get(l.member) ?? []) walk(k, depth + 1);
  };
  for (const l of t.lines) if (!l.parent || !t.lines.some((x) => x.member === l.parent)) walk(l, 0);
  return out;
}

/** The years oldest first with "2025 Y" over "12 Months Ending" and the period's end, as FA's grid heads them. */
function Head({ unit, periods }: { unit: string; periods: SegmentTable['periods'] }) {
  return (
    <thead>
      <tr>
        <th>In Millions of {unit || 'the filing’s currency'}</th>
        {periods.map((p) => (
          <th key={p.end} className="num" title={`${fmtIso(p.start)} to ${fmtIso(p.end)}`}>
            {p.end.slice(0, 4)} Y
          </th>
        ))}
        <th className="num fa-extra" title="Change on the year before">YoY</th>
      </tr>
      <tr className="fa-ending">
        <th>12 Months Ending</th>
        {periods.map((p) => (
          <th key={p.end} className="num">{fmtDay(Date.parse(`${p.end}T00:00:00Z`), true)}</th>
        ))}
        <th className="fa-extra" />
      </tr>
    </thead>
  );
}

const yoyCell = (v: number | undefined, prev: number | undefined) => {
  const g = growth(v, prev);
  return Number.isFinite(g) ? <Chg v={g} pct dec={1} /> : v != null && prev != null ? <span className="muted" title="Not meaningful: from zero or a loss">NM</span> : '';
};

/**
 * One measure grouped by its lines (PT_FA_business_drivers 0:17.0): the measure's row in white with the total, then
 * each line in amber with a grey "% of Total" row under it, the lines within a line indented under it and folded by
 * its arrow. The share is of the company's own total, so segment profit can pass 100% where corporate costs sit
 * outside the segments.
 */
function Table({ t }: { t: SegmentTable }) {
  const years = [...t.periods].reverse();
  const [latest, previous] = t.periods;
  const [shut, setShut] = useState<Set<string>>(() => new Set());
  const sums = years.map((p) => topSum(t, p.end));
  const reported = Object.keys(t.total).length > 0;
  const differs = years.some((p, i) => t.total[p.end] != null && Math.abs(t.total[p.end] - sums[i]) > Math.max(1e6, Math.abs(t.total[p.end]) * 0.001));
  const hidden = (l: SegmentLine): boolean => !!l.parent && (shut.has(l.parent) || hidden(t.lines.find((x) => x.member === l.parent) ?? ({} as SegmentLine)));
  const fold = (member: string) => setShut((x) => {
    const next = new Set(x);
    if (next.has(member)) next.delete(member);
    else next.add(member);
    return next;
  });
  return (
    <table className="tbl fa-tbl seg-tbl" data-testid={`seg-${t.metric}-${t.breakdown}`}>
      <Head unit={t.unit} periods={years} />
      <tbody>
        <tr className="seg-measure">
          <td className="white" title={reported ? 'The company’s own total' : 'The lines added: the filing gives no total'}>▾ {title(t)}</td>
          {years.map((p) => (
            <td key={p.end} className="num amber">{millions(totalOf(t, p.end))}</td>
          ))}
          <td className="num fa-extra">{latest ? yoyCell(totalOf(t, latest.end), previous ? totalOf(t, previous.end) : undefined) : ''}</td>
        </tr>
        {ordered(t).filter(({ line }) => !hidden(line)).map(({ line: l, depth }) => {
          const parent = t.lines.some((x) => x.parent === l.member);
          const pad = 8 + depth * 16;
          return (
            <Fragment key={l.member}>
              <tr className="seg-line">
                <td className="amber" style={{ paddingLeft: pad }} title={l.member}>
                  {parent ? (
                    <button type="button" className="seg-fold" aria-expanded={!shut.has(l.member)} aria-label={`${shut.has(l.member) ? 'Open' : 'Fold'} ${l.label}`} onClick={() => fold(l.member)}>
                      {shut.has(l.member) ? '▸' : '▾'}
                    </button>
                  ) : <span className="seg-fold" />}
                  {l.label}
                </td>
                {years.map((p) => (
                  <td key={p.end} className="num amber">{millions(l.values[p.end])}</td>
                ))}
                <td className="num fa-extra">{latest ? yoyCell(l.values[latest.end], previous ? l.values[previous.end] : undefined) : ''}</td>
              </tr>
              <tr className="seg-share">
                <td className="muted" style={{ paddingLeft: pad + 30 }}>% of Total</td>
                {years.map((p) => (
                  <td key={p.end} className="num muted">{share(l.values[p.end], totalOf(t, p.end))}</td>
                ))}
                <td className="fa-extra" />
              </tr>
            </Fragment>
          );
        })}
        {differs && (
          <tr>
            <td className="muted" title="The company’s total differs from its lines added: corporate items and eliminations sit outside the segments">Lines above, added</td>
            {sums.map((v, i) => (
              <td key={i} className="num muted">{millions(v)}</td>
            ))}
            <td className="fa-extra" />
          </tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * Group By Segment: each line of one breakdown with its measures under it (revenue, then segment profit), each with
 * its share of the measure's total.
 */
function BySegment({ tables }: { tables: SegmentTable[] }) {
  const first = tables[0];
  const years = [...first.periods].reverse();
  const members = new Map<string, string>();
  for (const t of tables) for (const { line } of ordered(t)) if (!members.has(line.member)) members.set(line.member, line.label);
  return (
    <table className="tbl fa-tbl seg-tbl" data-testid={`seg-by-segment-${first.breakdown}`}>
      <Head unit={first.unit} periods={years} />
      <tbody>
        {[...members].map(([member, label]) => (
          <Fragment key={member}>
            <tr className="seg-measure">
              <td className="white" title={member}>▾ {label}</td>
              {years.map((p) => <td key={p.end} />)}
              <td className="fa-extra" />
            </tr>
            {tables.map((t) => {
              const l = t.lines.find((x) => x.member === member);
              if (!l) return null;
              const [latest, previous] = t.periods;
              return (
                <Fragment key={t.metric}>
                  <tr className="seg-line">
                    <td className="amber" style={{ paddingLeft: 24 }}>{t.metric === 'revenue' ? 'Revenue' : 'Operating Income'}</td>
                    {years.map((p) => <td key={p.end} className="num amber">{millions(l.values[p.end])}</td>)}
                    <td className="num fa-extra">{latest ? yoyCell(l.values[latest.end], previous ? l.values[previous.end] : undefined) : ''}</td>
                  </tr>
                  <tr className="seg-share">
                    <td className="muted" style={{ paddingLeft: 40 }}>% of Total</td>
                    {years.map((p) => <td key={p.end} className="num muted">{share(l.values[p.end], totalOf(t, p.end))}</td>)}
                    <td className="fa-extra" />
                  </tr>
                </Fragment>
              );
            })}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

/** The series colours of FA's segment chart, in the order the segments are ticked. */
const SEGMENT_COLOURS = ['#ff9e1b', '#2fd36b', '#ffd23f', '#45d3e6', '#d77bff'];

/**
 * The segment chart's series: the company's top-level reported segments (up to five, largest first in the latest year),
 * one bar per fiscal year in billions, labelled "FY 2025" by the year the fiscal year ends in.
 */
export function segmentSeries(t: SegmentTable): { label: string; color: string; kind: 'bar'; points: { x: number; y: number; label: string }[] }[] {
  const latest = t.periods[0]?.end;
  const top = t.lines.filter((l) => !l.parent && Number.isFinite(l.values[latest ?? ''])).sort((a, b) => (b.values[latest!] ?? 0) - (a.values[latest!] ?? 0)).slice(0, 5);
  const years = [...t.periods].reverse();
  return top.map((l, i) => ({
    label: `Revenue: ${l.label}`,
    color: SEGMENT_COLOURS[i],
    kind: 'bar' as const,
    points: years.filter((p) => Number.isFinite(l.values[p.end])).map((p) => ({ x: Number(p.end.slice(0, 4)), y: l.values[p.end] / 1e9, label: `FY ${p.end.slice(0, 4)}` })),
  }));
}

/** FA's Segments by measure: the reported segments' revenue as grouped bars, one group per fiscal year. */
function SegmentChart({ t }: { t: SegmentTable }) {
  const series = segmentSeries(t);
  if (!series.length) return null;
  return (
    <Section title={`Revenue by ${BREAKDOWN_TITLE[t.breakdown].toLowerCase()}`} right="Billions">
      <XYChart
        height={220}
        series={series}
        xTicks={[...new Set(series.flatMap((x) => x.points.map((q) => q.x)))].map((y) => ({ v: y, label: `FY ${y}` }))}
        yFormat={(v) => `${fmtNum(v, 0)}B`}
        yZero
      />
    </Section>
  );
}

/** Which breakdowns each switch shows: Business is everything but geography, Location is geography. */
const LOCATION: Breakdown[] = ['geography'];
const isShown = (kind: 'business' | 'location', b: Breakdown) => (kind === 'location') === LOCATION.includes(b);

/**
 * FINANCIALS' Segments page as PT_FA_business_drivers 0:17.0 lays it out: "Segments" Business or Location and "Group
 * By" Measure or Segment above the grid; the app's chart and the filing it read stay with it.
 */
export function SegmentsView({ state }: { state: SegmentState | undefined }) {
  const [kind, setKind] = useState<'business' | 'location'>('business');
  const [group, setGroup] = useState<'measure' | 'segment'>('measure');
  if (!secAvailable()) return <div className="empty">Segments are read from the company’s annual report (10-K) on SEC EDGAR by the desktop app.</div>;
  if (!state || state.state === 'loading') return <div className="empty">Reading the segment tables of the latest annual report…</div>;
  if (state.state !== 'ok') return <div className="empty">{state.message}</div>;
  const r = state.report;
  const has = (k: 'business' | 'location') => r.tables.some((t) => isShown(k, t.breakdown));
  const shownKind = has(kind) ? kind : kind === 'business' ? 'location' : 'business';
  const tables = r.tables.filter((t) => isShown(shownKind, t.breakdown));
  const breakdowns = [...new Set(tables.map((t) => t.breakdown))];
  const toggle = <T extends string>(value: T, set: (v: T) => void, options: [T, string, boolean][]) => (
    <span className="seg-tg" role="group">
      {options.map(([v, label, ok]) => (
        <button key={v} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} disabled={!ok} onClick={() => set(v)}>
          {label}
        </button>
      ))}
    </span>
  );
  return (
    <div data-testid="fa-segments">
      <div className="seg-ctl">
        <span className="amber">Segments</span>
        {toggle(shownKind, setKind, [['business', 'Business', has('business')], ['location', 'Location', has('location')]])}
        <span className="amber">Group By</span>
        {toggle(group, setGroup, [['measure', 'Measure', true], ['segment', 'Segment', true]])}
      </div>
      {(() => {
        // The chart draws the shown lines' revenue: business segments, else products, else regions.
        const t = tables.find((x) => x.metric === 'revenue' && x.breakdown === 'segment') ?? tables.find((x) => x.metric === 'revenue');
        return t ? <SegmentChart t={t} /> : null;
      })()}
      {group === 'measure'
        ? tables.map((t) => <Table key={`${t.metric}-${t.breakdown}`} t={t} />)
        : breakdowns.map((b) => <BySegment key={b} tables={tables.filter((t) => t.breakdown === b)} />)}
      <div className="note">
        From the company&apos;s {r.form} filed {fmtIso(r.filed)}, as it tags its figures in XBRL ({' '}
        <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">
          the filing on EDGAR
        </a>
        ), with the names it gives its segments. Indented lines are counted within the line above them; % of Total is of the company&apos;s own total.
      </div>
      <div className="note">
        Operating income by segment is as each company measures its segments&apos; profit; the gap to the reported total is corporate costs and items it
        keeps outside its segments. Revenue by geography is where the company says it sold, by its own regions or countries. Fiscal years end on the dates
        shown when hovering a heading.
      </div>
    </div>
  );
}
