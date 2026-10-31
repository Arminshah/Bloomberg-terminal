// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { COMPARE_COLORS } from '../components/chart/PriceChart';
import { fmtIso, fmtNum } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { fredAvailable, type Obs } from '../data/live/fred';
import { searchFred, UNITS, useFredChart, type ChartLine, type FredSeriesInfo, type FredUnits } from '../data/live/fred-chart';
import { FRED_NOTICE } from '../data/macroseries';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * ECOW (and ECWB), the economic data chart: up to four FRED series on one chart, each as published or transformed
 * by FRED (change, % change, on a year ago, compounded annual rate), over two years to the whole history, with each
 * one's latest value, the one before and FRED's description; a search finds any series. A second scale on the left
 * takes the lines whose units differ from the first's.
 */

export const MAX_LINES = 4;
const DEFAULT_LINES: ChartLine[] = [
  { id: 'UNRATE', units: 'lin' },
  { id: 'CPIAUCSL', units: 'pc1' },
];

export const RANGES = [
  { n: 1, label: '2Y', years: 2 },
  { n: 2, label: '5Y', years: 5 },
  { n: 3, label: '10Y', years: 10 },
  { n: 4, label: '20Y', years: 20 },
  { n: 5, label: 'Max', years: 0 },
];

/** The lines typed after the function: FRED ids, each with an optional transformation ("CPIAUCSL:PC1"). */
export function linesFromArgs(args: string | undefined): ChartLine[] {
  const out: ChartLine[] = [];
  for (const word of String(args ?? '').trim().split(/\s+/)) {
    const [id, u] = word.toUpperCase().split(':');
    const units = (u ?? 'LIN').toLowerCase() as FredUnits;
    if (/^[A-Z0-9_]{1,30}$/.test(id ?? '') && UNITS.some((x) => x.key === units) && !out.some((l) => l.id === id && l.units === units)) out.push({ id, units });
  }
  return out.slice(0, MAX_LINES);
}

/** The first observation date asked for: FRED's earliest for the whole history. */
export function rangeStart(years: number, now: number): string {
  return years ? new Date(now - years * 365.25 * DAY_MS).toISOString().slice(0, 10) : '1776-07-04';
}

/** What a line shows: the series' units as published, or the transformation. */
export function unitLabel(line: ChartLine, info?: FredSeriesInfo): string {
  return line.units === 'lin' ? info?.units ?? '' : UNITS.find((u) => u.key === line.units)!.label;
}

/** The latest observation and the one before, with the change between them. */
export function latest(obs: Obs | undefined): { date: string; value: number; prevDate: string; prev: number; change: number } | null {
  if (!obs?.length) return null;
  const [date, value] = obs[obs.length - 1];
  const before = obs[obs.length - 2];
  return { date, value, prevDate: before?.[0] ?? '', prev: before?.[1] ?? NaN, change: before ? value - before[1] : NaN };
}

const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** A tick on 1 January of every year, or every few years, between two times: at most ten, each labelled once. */
export function yearTicks(x0: number, x1: number): { v: number; label: string }[] {
  if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return [];
  const y0 = new Date(x0).getUTCFullYear() + 1;
  const y1 = new Date(x1).getUTCFullYear();
  const step = Math.max(1, Math.ceil((y1 - y0 + 1) / 10));
  const out: { v: number; label: string }[] = [];
  for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push({ v: Date.UTC(y, 0, 1), label: String(y) });
  return out;
}

export function ECOW({ route }: FnProps) {
  const panel = usePanelId();
  const typed = linesFromArgs(route.args);
  const [lines, setLines] = useState<ChartLine[]>(typed.length ? typed : DEFAULT_LINES);
  const [range, setRange] = useState(3);
  const [words, setWords] = useState('');
  const [asked, setAsked] = useState('');
  const years = RANGES.find((r) => r.n === range)?.years ?? 10;
  const from = rangeStart(years, Date.now());
  const chart = useFredChart(lines, from);
  const search = asked ? chart.searches[asked.trim().toLowerCase()] : undefined;
  const infoOf = (l: ChartLine) => {
    const a = chart.series[l.id];
    return a?.state === 'ok' ? a.data : undefined;
  };
  const firstUnits = lines[0] ? unitLabel(lines[0], infoOf(lines[0])) : '';
  const series: XYSeries[] = lines.map((l, i) => {
    const a = chart.obs(l);
    const label = `${l.id}${l.units === 'lin' ? '' : ` (${UNITS.find((u) => u.key === l.units)!.short})`}`;
    return {
      label,
      color: COMPARE_COLORS[i % COMPARE_COLORS.length],
      points: a?.state === 'ok' ? a.data.map(([d, v]) => ({ x: ms(d), y: v, label: fmtIso(d) })) : [],
      ...(i > 0 && unitLabel(l, infoOf(l)) !== firstUnits ? { axis: 'left' as const } : {}),
    };
  });
  const twoScales = series.some((s) => s.axis === 'left');
  const xs = series.flatMap((x) => x.points.map((p) => p.x));
  const setUnits = (i: number, units: FredUnits) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, units } : l)));
  const remove = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const add = (id: string) => setLines((ls) => (ls.length >= MAX_LINES || ls.some((l) => l.id === id && l.units === 'lin') ? ls : [...ls, { id, units: 'lin' }]));
  const find = () => {
    if (words.trim().length < 2) return;
    setAsked(words);
    void searchFred(words);
  };
  const csv = () => {
    const dates = [...new Set(lines.flatMap((l) => { const a = chart.obs(l); return a?.state === 'ok' ? a.data.map(([d]) => d) : []; }))].sort();
    const byLine = lines.map((l) => { const a = chart.obs(l); return new Map(a?.state === 'ok' ? a.data : []); });
    return [['Date', ...lines.map((l) => `${l.id} ${unitLabel(l, infoOf(l))}`)], ...dates.map((d) => [d, ...byLine.map((m) => m.get(d) ?? '')])];
  };
  const loading = lines.some((l) => !chart.obs(l) || chart.obs(l)!.state === 'loading');
  const problem = lines.map((l) => chart.obs(l)).find((a) => a?.state === 'error') as { message: string } | undefined;
  return (
    <div>
      <FnHeader
        code="ECONCHART"
        title="Economic Data Chart"
        sub={<><RealBadge /> FRED, Federal Reserve Bank of St. Louis: each agency&apos;s figures as FRED republishes them</>}
        tabs={RANGES.map((r) => ({ n: r.n, label: r.label }))}
        tab={range}
        onTab={setRange}
        actions={exportActions(panel, `ECOW_${lines.map((l) => l.id).join('_')}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <input
              className="inp"
              aria-label="Find a FRED series"
              placeholder="Find a FRED series"
              value={words}
              onChange={(e) => setWords(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') find();
              }}
            />
            <button type="button" className="btn" onClick={find}>
              Search
            </button>
            {loading && fredAvailable() && <span className="muted" role="status">Reading FRED…</span>}
          </div>
        }
      />
      {!fredAvailable() ? (
        <div className="empty">FRED is read by the desktop app with your free FRED API key. The browser demo has no economic series, and none are generated.</div>
      ) : (
        <>
          {problem && <div className="note amber" role="status">{problem.message}</div>}
          {lines.length ? (
            <XYChart
              series={series}
              xFormat={(v) => new Date(v).toISOString().slice(0, 7)}
              {...(years && years <= 2 ? {} : { xTicks: yearTicks(Math.min(...xs), Math.max(...xs)) })}
              yFormat={(v) => fmtNum(v, 2)}
              {...(twoScales ? { y2Format: (v: number) => fmtNum(v, 2) } : {})}
              height={300}
              legend
            />
          ) : (
            <div className="empty">Add a series from the search.</div>
          )}
          <table className="tbl" aria-label="Series">
            <thead>
              <tr>
                <th>Series</th>
                <th className="hide-m">Title</th>
                <th>Shown as</th>
                <th className="num">Latest</th>
                <th className="num">Date</th>
                <th className="num">Before</th>
                <th className="num">Change</th>
                <th className="hide-n">Frequency</th>
                <th className="hide-n">Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const meta = infoOf(l);
                const a = chart.obs(l);
                const last = latest(a?.state === 'ok' ? a.data : undefined);
                return (
                  <tr key={`${l.id}|${l.units}|${i}`}>
                    <td>
                      <span style={{ color: COMPARE_COLORS[i % COMPARE_COLORS.length] }}>■ </span>
                      <span className="amber">{l.id}</span>
                      {series[i]?.axis === 'left' ? <span className="muted"> (left scale)</span> : null}
                    </td>
                    <td className="hide-m" title={meta?.copyrighted ? 'The figures are copyrighted by their owner: personal use only.' : undefined}>
                      {meta?.title ?? ''}{meta?.seasonal ? <span className="muted"> · {meta.seasonal}</span> : null}{meta?.copyrighted ? <span className="yellow"> ©</span> : null}
                    </td>
                    <td>
                      <select className="sel-inp" aria-label={`${l.id} shown as`} value={l.units} onChange={(e) => setUnits(i, e.target.value as FredUnits)}>
                        {UNITS.map((u) => (
                          <option key={u.key} value={u.key}>{u.key === 'lin' ? `Level${meta?.units ? ` (${meta.units})` : ''}` : u.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num white">{last ? fmtNum(last.value, 2) : ''}</td>
                    <td className="num">{last ? fmtIso(last.date) : ''}</td>
                    <td className="num">{last && Number.isFinite(last.prev) ? fmtNum(last.prev, 2) : ''}</td>
                    <td className={`num ${last && last.change > 0 ? 'up' : last && last.change < 0 ? 'dn' : ''}`}>{last && Number.isFinite(last.change) ? fmtNum(last.change, 2) : ''}</td>
                    <td className="hide-n">{meta?.frequency ?? ''}</td>
                    <td className="hide-n">{meta?.updated ? fmtIso(meta.updated) : ''}</td>
                    <td>
                      <button type="button" className="btn" aria-label={`Remove ${l.id}`} onClick={() => remove(i)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {asked && (
            <table className="tbl" aria-label="FRED series found">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Title</th>
                  <th className="hide-m">Units</th>
                  <th className="hide-n">Frequency</th>
                  <th className="hide-n">To</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {!search || search.state === 'loading' ? (
                  <tr><td colSpan={6} className="muted">Searching FRED…</td></tr>
                ) : search.state === 'error' ? (
                  <tr><td colSpan={6} className="amber">{search.message}</td></tr>
                ) : !search.data.length ? (
                  <tr><td colSpan={6} className="muted">FRED has no series for these words.</td></tr>
                ) : (
                  search.data.map((f) => (
                    <tr key={f.id}>
                      <td className="amber">{f.id}</td>
                      <td>{f.title}{f.seasonal ? <span className="muted"> · {f.seasonal}</span> : null}</td>
                      <td className="hide-m">{f.units}</td>
                      <td className="hide-n">{f.frequency}</td>
                      <td className="hide-n">{fmtIso(f.end)}</td>
                      <td>
                        <button type="button" className="btn" disabled={lines.length >= MAX_LINES} onClick={() => add(f.id)} title={lines.length >= MAX_LINES ? `At most ${MAX_LINES} series` : `Add ${f.id} to the chart`}>
                          Add
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
          <div className="note">
            Each line is a FRED series as published, or as FRED transforms it. Type series after the function to open them: ECOW UNRATE CPIAUCSL:PC1.
            {' '}{FRED_NOTICE}
          </div>
        </>
      )}
    </div>
  );
}
