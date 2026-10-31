// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { XYChart } from '../components/chart/XYChart';
import { exportActions } from '../components/ExportActions';
import { fmtDay, fmtNum } from '../core/format';
import { engine, useHistoryVersion } from '../data/market';
import { betaTo } from '../data/analytics';
import { defaultBenchmark, lookbackStart, pairedReturns, periodCloses, type BetaFrequency } from '../finance/beta';
import { betaStats, histogram } from '../finance/beta-stats';
import { resolveSecurity } from '../data/registry';
import type { FnProps } from '../terminal/types';
import { usePanelId } from '../terminal/panel';

type RangeKey = '6M' | 'YTD' | '1Y' | '2Y' | '5Y' | 'Max';
const RANGES: { key: RangeKey; months?: number }[] = [
  { key: '6M', months: 6 },
  { key: 'YTD' },
  { key: '1Y', months: 12 },
  { key: '2Y', months: 24 },
  { key: '5Y', months: 60 },
  { key: 'Max' },
];
const FREQS: { freq: BetaFrequency; short: string; long: string }[] = [
  { freq: 'D', short: 'Dly', long: 'Daily' },
  { freq: 'W', short: 'Wkly', long: 'Weekly' },
  { freq: 'M', short: 'Mthly', long: 'Monthly' },
];
const PERIOD_NOTE: Record<BetaFrequency, string> = {
  D: 'trading days both lines have a close on',
  W: 'weeks ending Friday (the week’s last session when Friday is a holiday)',
  M: 'calendar months, on each month’s last session',
};

const iso = (t: number) => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : '');

/**
 * BETA, Historical Beta, as the 2022 screen in the reference pack draws it (Babson's "WACC Components" p.5): the
 * Relative Index on the red bar with Actions and Edit; the data, frequency and dates; the range buttons; the security's
 * returns (Y) against the index's (X) as an orange scatter with the red fitted line and its equation, histograms of
 * each on its axis with a normal curve; the Statistics panel (raw and adjusted beta, alpha, R², R, the standard errors,
 * the t-test, the last point's T and P values, the number of points, the last spread and ratio); the two prices below.
 * Two years of weekly returns against the local index by default, as the terminal's BETA. The same screen is
 * REGRESSION (HRA): one security's returns on any other's.
 */
export function BETA({ sec, route }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const regression = route.fn === 'REGRESSION';
  const [range, setRange] = useState<RangeKey>('2Y');
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const [bench, setBench] = useState(() => {
    const named = route.args ? resolveSecurity(route.args) : undefined;
    return named && named.id !== s.id ? named.id : defaultBenchmark(s, (id) => !!engine.get(id));
  });
  const [freq, setFreq] = useState<BetaFrequency>('W');
  const [text, setText] = useState('');
  const [view, setView] = useState<'stats' | 'transform'>('stats');
  const [showHist, setShowHist] = useState(true);
  const [showPrices, setShowPrices] = useState(true);
  const history = useHistoryVersion();
  const benchDef = engine.get(bench);
  const data = useMemo(() => {
    const b = engine.daily(bench);
    const y = engine.daily(s.id);
    const benchYield = benchDef?.quote === 'yield';
    const secYield = s.quote === 'yield';
    // Both lines end on the earlier of their last bars, so neither has a period the other cannot have yet.
    const end = b.length && y.length ? Math.min(b.t[b.length - 1], y.t[y.length - 1]) : NaN;
    const to = custom.to ? Math.min(Date.parse(`${custom.to}T23:59:59Z`), end) : end;
    const r0 = RANGES.find((r) => r.key === range)!;
    const start = b.length && y.length ? Math.max(b.t[0], y.t[0]) : NaN;
    const from = custom.from
      ? Date.parse(`${custom.from}T00:00:00Z`)
      : !Number.isFinite(to)
        ? NaN
        : r0.key === 'YTD'
          ? Date.UTC(new Date(to).getUTCFullYear(), 0, 0)
          : r0.key === 'Max'
            ? start
            : lookbackStart(to, r0.months!);
    const r = Number.isFinite(to) && Number.isFinite(from)
      ? pairedReturns(periodCloses(b, freq, from, to, benchYield), periodCloses(y, freq, from, to, secYield), benchYield, secYield)
      : { dates: [], x: [], y: [] };
    const xs = r.x.map((v) => v * 100);
    const ys = r.y.map((v) => v * 100);
    const prices: { t: number; y: number; x: number }[] = [];
    for (let i = 0; i < y.length; i++) {
      const t = y.t[i];
      if (t < from || t > to) continue;
      let j = -1;
      for (let k = b.length - 1; k >= 0; k--) if (b.t[k] <= t) { j = k; break; }
      if (j >= 0) prices.push({ t, y: y.c[i], x: b.c[j] });
    }
    return { dates: r.dates, xs, ys, from, to, stats: betaStats(xs, ys), prices, lastY: y.length ? y.c[y.length - 1] : NaN, lastX: b.length ? b.c[b.length - 1] : NaN };
    // Recomputed when daily history arrives, which can be after the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bench, s.id, range, freq, custom.from, custom.to, history]);
  const st = data.stats;
  const f = FREQS.find((x) => x.freq === freq)!;
  const b252 = betaTo(s.id, bench, 252);
  const xTicker = benchDef?.ticker ?? bench;
  const csv = () => [['Date', `${xTicker} return %`, `${s.ticker} return %`], ...data.dates.map((t, i) => [iso(t), data.xs[i], data.ys[i]])];
  const exp = exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}-beta.csv`, csv);
  const stats: [string, string, string?][] = [
    ['Raw BETA', fmtNum(st.beta, 3)],
    ['Adjusted BETA', fmtNum(st.adjusted, 3), '0.67 × raw beta + 0.33'],
    ['ALPHA (Intercept)', fmtNum(st.alpha, 3), `Percent per ${f.long.toLowerCase().replace(/ly$/, '').replace('dai', 'day')}`],
    ['R^2 (Correlation^2)', fmtNum(st.r2, 3)],
    ['R (Correlation)', fmtNum(st.r, 3)],
    ['Std Dev of Error', fmtNum(st.sdError, 3), 'Standard deviation of the residuals, percent'],
    ['Std Error of ALPHA', fmtNum(st.seAlpha, 3)],
    ['Std Error of BETA', fmtNum(st.seBeta, 3)],
    ['t-Test', fmtNum(st.tTest, 3), 'Raw beta over its standard error'],
    ['Significance', fmtNum(st.significance, 3), 'Two-tailed p-value of the t-test'],
    ['Last T-Value', fmtNum(st.lastT, 3), "The last point's residual in standard deviations of the errors"],
    ['Last P-Value', fmtNum(st.lastP, 3), 'Share of the t distribution below the Last T-Value'],
    ['Number of Points', String(st.n)],
    ['Last Spread', fmtNum(data.lastX - data.lastY, 2), `${xTicker}'s last price less ${s.ticker}'s, as the 2022 frame gives it`],
    ['Last Ratio', fmtNum(data.lastY / data.lastX, 3), `${s.ticker}'s last price over ${xTicker}'s`],
  ];
  return (
    <div className="beta">
      <FnHeader
        code={regression ? 'REGRESSION' : 'BETA'}
        title={regression ? 'Regression Analysis' : 'Historical Beta'}
        sec={s}
        right={
          <>
            <span className="fnh-lbl">{regression ? 'Independent' : 'Relative Index'}</span>
            <input
              className="fnh-field"
              aria-label={regression ? 'Independent security' : 'Relative index'}
              value={text}
              placeholder={xTicker}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const r = resolveSecurity(text);
                  if (r && r.id !== s.id) setBench(r.id);
                  setText('');
                }
              }}
            />
          </>
        }
        actions={[
          { n: 9901, bare: true, label: 'Actions', onClick: () => {}, menu: exp.map((a) => ({ label: a.label === 'Copy' ? 'Copy the Returns' : 'Download the Returns as CSV', title: a.title, onClick: a.onClick })) },
          {
            n: 9902,
            bare: true,
            label: 'Edit',
            onClick: () => {},
            menu: [
              { label: showHist ? 'Hide the Histograms' : 'Show the Histograms', onClick: () => setShowHist((v) => !v) },
              { label: showPrices ? 'Hide the Price Chart' : 'Show the Price Chart', onClick: () => setShowPrices((v) => !v) },
            ],
          },
        ]}
      />
      <div className="beta-controls">
        <span className="beta-lbl">Data</span><span className="beta-fld">Last Price</span>
        <span className="beta-lbl">Data</span><span className="beta-fld">Last Price</span>
        <select className="sel-inp" aria-label="Frequency" value={freq} onChange={(e) => setFreq(e.target.value as BetaFrequency)}>
          {FREQS.map((x) => <option key={x.freq} value={x.freq}>{x.short}</option>)}
        </select>
        <label className="chk"><input type="checkbox" checked readOnly /> Linear</label>
        <span className="beta-lbl">Reg On</span><span className="beta-fld">Percent</span>
        <input className="sel-inp beta-date" type="date" aria-label="From" value={custom.from ?? iso(data.from)} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value || undefined }))} />
        <span>-</span>
        <input className="sel-inp beta-date" type="date" aria-label="To" value={custom.to ?? iso(data.to)} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value || undefined }))} />
      </div>
      <div className="beta-ranges">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className={`beta-range${range === r.key && !custom.from && !custom.to ? ' on' : ''}`} onClick={() => { setRange(r.key); setCustom({}); }}>{r.key}</button>
        ))}
        <span className="white">{f.long} ▾</span>
        <span className="muted">{st.n} points · {Number.isFinite(data.from) ? `${fmtDay(data.from)} to ${fmtDay(data.to)}` : ''}</span>
      </div>
      <div className="beta-main">
        <div className="beta-plot-col">
          <BetaPlot xs={data.xs} ys={data.ys} beta={st.beta} alpha={st.alpha} xLabel={`${xTicker}-Percent`} yLabel={`${s.ticker}-Percent`} showHist={showHist} />
          {showPrices && data.prices.length > 1 ? (
            <XYChart
              height={130}
              series={[
                { label: `${s.ticker}`, color: '#f4f4f4', points: data.prices.map((p) => ({ x: p.t, y: p.y })), axis: 'left' },
                { label: `${xTicker}`, color: '#ff9e1b', points: data.prices.map((p) => ({ x: p.t, y: p.x })) },
              ]}
              xFormat={(t) => fmtDay(t)}
              yFormat={(v) => fmtNum(v, 0)}
              y2Format={(v) => fmtNum(v, 0)}
            />
          ) : null}
        </div>
        <aside className="beta-stats" aria-label="Statistics">
          <nav className="beta-stats-tabs">
            <button type="button" className={view === 'stats' ? 'on' : ''} onClick={() => setView('stats')}>Statistics</button>
            <button type="button" className={view === 'transform' ? 'on' : ''} onClick={() => setView('transform')}>Transformations</button>
          </nav>
          <div className="cyan">Y = {s.name}</div>
          <div className="cyan">X = {benchDef?.name ?? bench}</div>
          {view === 'stats' ? (
            <table className="tbl beta-stats-tbl" data-testid="beta-stats">
              <thead>
                <tr><th>Linear Beta</th><th className="num">Range 1</th></tr>
              </thead>
              <tbody>
                {stats.map(([label, v, title]) => (
                  <tr key={label} title={title}>
                    <td className="amber">{label}</td>
                    <td className="num white">{v}</td>
                  </tr>
                ))}
                <tr title="One year of daily returns, the app's own second view">
                  <td className="amber">1Y Daily BETA</td>
                  <td className="num white">{fmtNum(b252.beta, 3)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="beta-transform">
              <p>{f.long} simple returns in percent over {PERIOD_NOTE[freq]}, from each period&apos;s last available close; a period counts only when both lines have a close in it. Yields use changes.</p>
              <p>Ordinary least squares of Y on X. Adjusted beta = 0.67 × raw + 0.33 × 1.0. Significance and the P-value use Student&apos;s t distribution with points − 2 degrees of freedom.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Ticks a step of 1, 2 or 5 × 10^k apart covering lo..hi. */
function ticks(lo: number, hi: number, count = 8): number[] {
  if (!(hi > lo)) return [];
  const raw = (hi - lo) / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw)!;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** The scatter with its fitted line, and each axis's histogram with a normal curve, on one scale so they line up. */
function BetaPlot(props: { xs: number[]; ys: number[]; beta: number; alpha: number; xLabel: string; yLabel: string; showHist: boolean }) {
  // Drawn at the container's own pixel width, so its labels stay at the charts' 11px instead of scaling with it.
  const host = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => setW(Math.max(320, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={host} className="beta-plot-host"><BetaSvg {...props} W={W} /></div>;
}

function BetaSvg({ xs, ys, beta, alpha, xLabel, yLabel, showHist, W }: { xs: number[]; ys: number[]; beta: number; alpha: number; xLabel: string; yLabel: string; showHist: boolean; W: number }) {
  const H = 380;
  const left = showHist ? 120 : 48;
  const right = 12;
  const top = 14;
  const bottom = showHist ? 92 : 30;
  const pw = W - left - right;
  const ph = H - top - bottom;
  if (xs.length < 3) return <div className="empty beta-empty">Not enough matched returns for this range: the two lines need at least three periods in common.</div>;
  const pad = (lo: number, hi: number) => {
    const m = Math.max(Math.abs(lo), Math.abs(hi)) * 0.08 || 1;
    return [lo - m, hi + m];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => left + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => top + ph - ((v - y0) / (y1 - y0)) * ph;
  const bins = 24;
  const hx = histogram(xs, x0, x1, bins);
  const hy = histogram(ys, y0, y1, bins);
  const maxH = Math.max(...hx, ...hy, 1);
  const normal = (vals: number[], lo: number, hi: number) => {
    const n = vals.length;
    const m = vals.reduce((a, v) => a + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (n - 1));
    const bw = (hi - lo) / bins;
    return Array.from({ length: 61 }, (_, i) => {
      const v = lo + ((hi - lo) * i) / 60;
      return { v, c: (n * bw * Math.exp(-0.5 * ((v - m) / sd) ** 2)) / (sd * Math.sqrt(2 * Math.PI)) };
    });
  };
  const xTicks = ticks(x0, x1);
  const yTicks = ticks(y0, y1);
  const fitOk = Number.isFinite(beta) && Number.isFinite(alpha);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="beta-plot" role="img" aria-label="Returns scatter with the fitted line">
      <rect x={left} y={top} width={pw} height={ph} fill="#101a22" />
      {xTicks.map((v) => <line key={`gx${v}`} x1={sx(v)} x2={sx(v)} y1={top} y2={top + ph} stroke="#22313c" strokeWidth="1" />)}
      {yTicks.map((v) => <line key={`gy${v}`} y1={sy(v)} y2={sy(v)} x1={left} x2={left + pw} stroke="#22313c" strokeWidth="1" />)}
      {x0 < 0 && x1 > 0 ? <line x1={sx(0)} x2={sx(0)} y1={top} y2={top + ph} stroke="#5c6a75" /> : null}
      {y0 < 0 && y1 > 0 ? <line y1={sy(0)} y2={sy(0)} x1={left} x2={left + pw} stroke="#5c6a75" /> : null}
      {xTicks.map((v) => <text key={`tx${v}`} x={sx(v)} y={top + ph + 12} className="beta-tick" textAnchor="middle">{fmtNum(v, Math.abs(v) < 1 && v !== 0 ? 1 : 0)}</text>)}
      {yTicks.map((v) => <text key={`ty${v}`} x={left - 4} y={sy(v) + 3} className="beta-tick" textAnchor="end">{fmtNum(v, Math.abs(v) < 1 && v !== 0 ? 1 : 0)}</text>)}
      {xs.map((v, i) => <circle key={i} cx={sx(v)} cy={sy(ys[i])} r={i === xs.length - 1 ? 3.6 : 2.4} fill={i === xs.length - 1 ? '#ffffff' : '#f0a020'} />)}
      {fitOk ? <line x1={sx(x0)} y1={sy(alpha + beta * x0)} x2={sx(x1)} y2={sy(alpha + beta * x1)} stroke="#e0201a" strokeWidth="1.6" /> : null}
      {fitOk ? (
        <g>
          <circle cx={left + 12} cy={top + 12} r={4} fill="#e0201a" />
          <text x={left + 22} y={top + 16} className="beta-eq">{`Y = ${fmtNum(beta, 3)} X ${alpha < 0 ? '-' : '+'} ${fmtNum(Math.abs(alpha), 3)}`}</text>
        </g>
      ) : null}
      <text x={left + pw / 2} y={H - 4} className="beta-axis" textAnchor="middle">{xLabel}</text>
      <text x={10} y={top + ph / 2} className="beta-axis" textAnchor="middle" transform={`rotate(-90 10 ${top + ph / 2})`}>{yLabel}</text>
      {showHist ? (
        <g>
          {hx.map((c, i) => {
            const bx = sx(x0 + ((x1 - x0) * i) / bins);
            const w = pw / bins;
            const h = (c / maxH) * 56;
            return <rect key={`hx${i}`} x={bx + 0.5} y={top + ph + 76 - h} width={w - 1} height={h} fill="#c88a10" />;
          })}
          <polyline fill="none" stroke="#e8e8e8" strokeWidth="1" points={normal(xs, x0, x1).map((p) => `${sx(p.v)},${top + ph + 76 - (p.c / maxH) * 56}`).join(' ')} />
          {hy.map((c, i) => {
            const by = sy(y0 + ((y1 - y0) * (i + 1)) / bins);
            const h = ph / bins;
            const w = (c / maxH) * 70;
            return <rect key={`hy${i}`} x={left - 34 - w} y={by + 0.5} width={w} height={h - 1} fill="#c88a10" />;
          })}
          <polyline fill="none" stroke="#e8e8e8" strokeWidth="1" points={normal(ys, y0, y1).map((p) => `${left - 34 - (p.c / maxH) * 70},${sy(p.v)}`).join(' ')} />
        </g>
      ) : null}
    </svg>
  );
}
