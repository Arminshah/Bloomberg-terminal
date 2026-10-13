import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { sourceLabel } from '../components/Source';
import { useIndexComponents, useYahooQuotes } from '../data/live/yquotes';
import { useFundamentals } from '../data/live/yfund';
import { DataTable } from '../components/DataTable';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { Chg, DayChg, KV, LivePx, SecLink, Section } from '../components/cells';
import { fmtBig, fmtDay, fmtNum, fmtPct, fmtTime } from '../core/format';
import { engine, useTick } from '../data/market';
import { horizonStart, marketCapUsd, type Horizon } from '../data/analytics';
import { dividends, financials, hasRealStatements, majorPrice } from '../data/fundamentals';
import { dividendYield } from '../data/options';
import { resolveSecurity } from '../data/registry';
import { indexAtOrBefore, type Series } from '../data/series';
import type { SecurityDef } from '../data/types';
import { maxDrawdown, percentile, stdev } from '../finance/stats';
import type { FnProps } from '../terminal/types';

const H: { n: number; h: Horizon }[] = [
  { n: 1, h: '1M' },
  { n: 2, h: '3M' },
  { n: 3, h: '6M' },
  { n: 4, h: 'YTD' },
  { n: 5, h: '1Y' },
  { n: 6, h: '2Y' },
  { n: 7, h: '5Y' },
];

const BENCH: Record<string, string> = { Americas: 'SPX Index', EMEA: 'SXXP Index', APAC: 'NKY Index' };

const pctFmt = (v: number) => `${v >= 0 ? '+' : ''}${fmtNum(v, 1)}%`;

// ------------------------------------------------------------------- TRA

interface TrResult {
  t: number[];
  price: number[];
  total: number[];
  divs: { ex: number; amount: number }[];
  days: number;
}

/** Price and total return (dividends reinvested on the ex-date) from `start`. */
function totalReturn(def: SecurityDef, start: number): TrResult {
  const s = engine.daily(def.id);
  const i0 = Math.max(0, indexAtOrBefore(s, start));
  const exList = def.eq ? dividends(def).filter((d) => d.ex > s.t[i0] && d.ex <= engine.now()) : [];
  const q = def.cls === 'index' ? dividendYield(def) : 0;
  const t: number[] = [];
  const price: number[] = [];
  const total: number[] = [];
  let tr = 1;
  for (let i = i0; i < s.length; i++) {
    if (i > i0) {
      let gross = s.c[i] / s.c[i - 1];
      for (const d of exList) if (d.ex > s.t[i - 1] && d.ex <= s.t[i]) gross += d.amount / s.c[i - 1];
      if (q) gross += q / 252;
      tr *= gross;
    }
    t.push(s.t[i]);
    price.push((s.c[i] / s.c[i0] - 1) * 100);
    total.push((tr - 1) * 100);
  }
  return { t, price, total, divs: exList.map((d) => ({ ex: d.ex, amount: d.amount })), days: (s.t[s.length - 1] - s.t[i0]) / 86_400_000 };
}

/** TRA: total return analysis against a benchmark. */
export function TRA({ sec }: FnProps) {
  const s = sec!;
  useTick(10);
  const [tab, setTab] = useState(5);
  const [benchText, setBenchText] = useState('');
  const defBench = s.cls === 'index' ? (s.id === 'SPX Index' ? 'INDU Index' : 'SPX Index') : BENCH[s.region] ?? 'SPX Index';
  const [bench, setBench] = useState(defBench);
  const h = H[tab - 1].h;
  const start = horizonStart(h);
  const a = useMemo(() => totalReturn(s, start), [s, start]);
  const b = useMemo(() => totalReturn(engine.get(bench)!, start), [bench, start]);
  const last = (xs: number[]) => xs[xs.length - 1] ?? NaN;
  const ann = (r: number) => (a.days > 0 ? (Math.pow(1 + r / 100, 365 / a.days) - 1) * 100 : NaN);
  const levels = a.total.map((x) => 1 + x / 100);
  const rets = levels.slice(1).map((v, i) => v / levels[i] - 1);
  const vol = stdev(rets) * Math.sqrt(252) * 100;
  const dd = maxDrawdown(levels) * 100;
  const series: XYSeries[] = [
    { label: `${s.ticker} total return`, color: '#ffb547', points: a.t.map((t, i) => ({ x: t, y: a.total[i] })) },
    { label: `${s.ticker} price return`, color: '#c9d3df', dash: [4, 3], points: a.t.map((t, i) => ({ x: t, y: a.price[i] })) },
    // An index has no dividend history here: its total return adds today's dividend yield day by day, an approximation.
    { label: `${engine.get(bench)!.ticker} total return${engine.get(bench)!.cls === 'index' ? ' (approx.)' : ''}`, color: '#5aa7ff', points: b.t.map((t, i) => ({ x: t, y: b.total[i] })) },
  ];
  const divSum = a.divs.reduce((x, d) => x + d.amount, 0);
  return (
    <div>
      <FnHeader code="TOTALRETURN" title="Total Return Analysis" sec={s} tabs={H.map((x) => ({ n: x.n, label: x.h }))} tab={tab} onTab={setTab} />
      <div className="chart-tools">
        <span className="muted">Benchmark</span>
        <SecLink id={bench}>{bench}</SecLink>
        <input
          className="inp"
          style={{ width: 130 }}
          placeholder="Change benchmark"
          aria-label="Benchmark"
          value={benchText}
          onChange={(e) => setBenchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const r = resolveSecurity(benchText);
            if (r && r.id !== s.id) setBench(r.id);
            setBenchText('');
          }}
        />
      </div>
      <div className="cols">
        <Section title={`Returns · ${h}`}>
          <KV
            items={[
              ['Price return', <Chg key="p" v={last(a.price)} pct />],
              ['Dividends (ex in period)', s.eq ? `${fmtNum(divSum, 4)} ${s.ccy} · ${a.divs.length} payments` : s.cls === 'index' ? `${fmtNum(dividendYield(s) * 100, 2)}% yield accrued` : 'None'],
              ['Total return', <Chg key="t" v={last(a.total)} pct />],
              ['Annualised total return', <Chg key="a" v={ann(last(a.total))} pct />],
              [`Benchmark total return${engine.get(bench)!.cls === 'index' ? ' (approx.: price plus the current dividend yield, daily)' : ''}`, <Chg key="b" v={last(b.total)} pct />],
              ['Excess return', <Chg key="x" v={last(a.total) - last(b.total)} pct />],
              ['Volatility (ann.)', `${fmtNum(vol, 1)}%`],
              ['Max drawdown', `${fmtNum(dd, 1)}%`],
            ]}
          />
        </Section>
        <Section title="Cumulative return">
          <XYChart series={series} height={260} legend xFormat={(v) => fmtDay(v)} yFormat={pctFmt} refLines={[{ y: 0, color: '#444' }]} />
        </Section>
      </div>
      {a.divs.length > 0 && (
        <Section title="Dividends reinvested">
          <table className="tbl">
            <thead>
              <tr>
                <th>Ex-date</th>
                <th className="num">Amount ({s.ccy})</th>
              </tr>
            </thead>
            <tbody>
              {a.divs.map((d) => (
                <tr key={d.ex}>
                  <td>{fmtDay(d.ex)}</td>
                  <td className="num">{fmtNum(d.amount, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- GF

const GF_TABS = [
  { n: 1, label: 'Revenue' },
  { n: 2, label: 'EPS' },
  { n: 3, label: 'Margins' },
  { n: 4, label: 'P/E' },
  { n: 5, label: 'Free cash flow' },
];

/** GF: graph fundamentals over fiscal years and quarters. */
export function GF({ sec }: FnProps) {
  const s = sec!;
  const [tab, setTab] = useState(1);
  const { status: fundStatus } = useFundamentals(s);
  const status = fundStatus === 'ok' && !hasRealStatements(s) ? 'error' : fundStatus;
  const f = financials(s);
  const daily = engine.daily(s.id);
  const pxAt = (t: number) => {
    const i = indexAtOrBefore(daily, t);
    return i >= 0 ? majorPrice(s, daily.c[i]) : NaN;
  };
  const annual = f.annual;
  const quarterly = f.quarterly;
  let series: XYSeries[] = [];
  let fmt = (v: number) => fmtBig(v * 1e6);
  let title = '';
  const ax = annual.map((p, i) => ({ x: i, label: p.label }));
  const qx = quarterly.map((p, i) => ({ x: i, label: p.label }));
  let ticks = ax.map((p) => ({ v: p.x, label: p.label.replace('FY ', 'FY') }));
  switch (tab) {
    case 1:
      title = `Revenue (${s.ccy === 'GBp' ? 'GBP' : s.ccy} mn), quarterly`;
      series = [{ label: 'Revenue', color: '#ffb547', kind: 'bar', points: quarterly.map((p, i) => ({ x: i, y: p.rev })) }];
      ticks = qx.map((p) => ({ v: p.x, label: p.label }));
      break;
    case 2:
      title = 'Diluted EPS, quarterly';
      fmt = (v) => fmtNum(v, 2);
      series = [{ label: 'EPS', color: '#ffb547', kind: 'bar', points: quarterly.map((p, i) => ({ x: i, y: p.eps })) }];
      ticks = qx.map((p) => ({ v: p.x, label: p.label }));
      break;
    case 3:
      title = 'Margins by fiscal year';
      fmt = pctFmt;
      series = [
        { label: 'Gross', color: '#5aa7ff', markers: true, points: annual.map((p, i) => ({ x: i, y: (p.gp / p.rev) * 100 })) },
        { label: 'Operating', color: '#ffb547', markers: true, points: annual.map((p, i) => ({ x: i, y: (p.opInc / p.rev) * 100 })) },
        { label: 'Net', color: '#2fd36b', markers: true, points: annual.map((p, i) => ({ x: i, y: (p.ni / p.rev) * 100 })) },
      ];
      break;
    case 4:
      title = 'Price / earnings at each fiscal year end';
      fmt = (v) => `${fmtNum(v, 1)}x`;
      series = [{ label: 'P/E', color: '#ffb547', markers: true, points: annual.map((p, i) => ({ x: i, y: p.eps > 0 ? pxAt(p.end) / p.eps : NaN })).filter((p) => Number.isFinite(p.y)) }];
      break;
    case 5:
      title = 'Free cash flow by fiscal year (mn)';
      series = [
        { label: 'Operating cash flow', color: '#5aa7ff', kind: 'bar', points: annual.map((p, i) => ({ x: i - 0.18, y: p.cfo })) },
        { label: 'Free cash flow', color: '#ffb547', kind: 'bar', points: annual.map((p, i) => ({ x: i + 0.18, y: p.fcf })) },
      ];
      break;
  }
  return (
    <div>
      <FnHeader code="FUNDCHART" title="Graph Fundamentals" sec={s} sub={sourceLabel(status, "statements generated from the company's reported size; real data needs the desktop app")} tabs={GF_TABS} tab={tab} onTab={setTab} />
      <Section title={title}>
        <XYChart series={series} height={300} legend={series.length > 1} xTicks={ticks} yFormat={fmt} yZero={tab !== 4 && tab !== 3} />
      </Section>
      <table className="tbl">
        <thead>
          <tr>
            <th>Period</th>
            <th className="num">Revenue</th>
            <th className="num">EBITDA</th>
            <th className="num">Net income</th>
            <th className="num">EPS</th>
            <th className="num hide-m">FCF</th>
            <th className="num hide-m">Op margin</th>
            <th className="num">P/E</th>
          </tr>
        </thead>
        <tbody>
          {annual.map((p) => (
            <tr key={p.label}>
              <td className="amber">{p.label}</td>
              <td className="num">{fmtNum(p.rev, 0)}</td>
              <td className="num">{fmtNum(p.ebitda, 0)}</td>
              <td className="num">{fmtNum(p.ni, 0)}</td>
              <td className="num">{fmtNum(p.eps, 2)}</td>
              <td className="num hide-m">{fmtNum(p.fcf, 0)}</td>
              <td className="num hide-m">{fmtNum((p.opInc / p.rev) * 100, 1)}%</td>
              <td className="num">{p.eps > 0 ? fmtNum(pxAt(p.end) / p.eps, 1) : '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------- HVT

const WINDOWS = [10, 20, 30, 60, 90, 120, 180, 260];

/** Rolling realised volatility (annualised %, or bp for yields) over `n` bars ending at each index. */
function rollingVol(s: Series, n: number, yieldMode: boolean, perYear: number): Float64Array {
  const out = new Float64Array(s.length).fill(NaN);
  const r = new Float64Array(s.length);
  for (let i = 1; i < s.length; i++) r[i] = yieldMode ? (s.c[i] - s.c[i - 1]) * 100 : Math.log(s.c[i] / s.c[i - 1]);
  let sum = 0;
  let sq = 0;
  for (let i = 1; i < s.length; i++) {
    sum += r[i];
    sq += r[i] * r[i];
    if (i > n) {
      sum -= r[i - n];
      sq -= r[i - n] * r[i - n];
    }
    if (i >= n) {
      const mean = sum / n;
      const v = Math.max(0, sq / n - mean * mean) * (n / (n - 1));
      out[i] = Math.sqrt(v * perYear) * (yieldMode ? 1 : 100);
    }
  }
  return out;
}

/** HVT: historical volatility table and chart. */
export function HVT({ sec }: FnProps) {
  const s = sec!;
  useTick(10);
  const daily = engine.daily(s.id);
  const y = s.quote === 'yield';
  const perYear = s.cls === 'crypto' ? 365 : 252;
  const vols = useMemo(() => WINDOWS.map((w) => rollingVol(daily, w, y, perYear)), [daily, y, perYear]);
  const n = daily.length;
  const unit = y ? 'bp' : '%';
  const rows = WINDOWS.map((w, k) => {
    const v = vols[k];
    const yr = Array.from(v.subarray(Math.max(0, n - 252), n)).filter(Number.isFinite);
    const cur = v[n - 1];
    return {
      w,
      cur,
      m1: v[Math.max(0, n - 22)],
      m3: v[Math.max(0, n - 64)],
      hi: Math.max(...yr),
      lo: Math.min(...yr),
      pct: yr.length ? (yr.filter((x) => x <= cur).length / yr.length) * 100 : NaN,
    };
  });
  const from = Math.max(0, n - 504);
  const chart: XYSeries[] = [
    { label: '30D', color: '#ffb547', points: [] },
    { label: '90D', color: '#5aa7ff', points: [] },
    { label: '260D', color: '#8f8f8f', points: [] },
  ];
  for (let i = from; i < n; i++) {
    chart[0].points.push({ x: daily.t[i], y: vols[2][i] });
    chart[1].points.push({ x: daily.t[i], y: vols[4][i] });
    chart[2].points.push({ x: daily.t[i], y: vols[7][i] });
  }
  const all30 = Array.from(vols[2].subarray(from, n)).filter(Number.isFinite);
  return (
    <div>
      <FnHeader code="VOLATILITY" title="Historical Volatility" sec={s} sub={y ? 'Absolute volatility of yield changes, bp per year' : 'Close-to-close, annualised'} />
      <div className="cols">
        <Section title="Realised volatility">
          <table className="tbl">
            <thead>
              <tr>
                <th>Window</th>
                <th className="num">Current</th>
                <th className="num">1M ago</th>
                <th className="num">3M ago</th>
                <th className="num">1Y high</th>
                <th className="num">1Y low</th>
                <th className="num">Pctile</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.w}>
                  <td className="amber">{r.w}D</td>
                  <td className="num white b">{fmtNum(r.cur, 2)}</td>
                  <td className="num">{fmtNum(r.m1, 2)}</td>
                  <td className="num">{fmtNum(r.m3, 2)}</td>
                  <td className="num">{fmtNum(r.hi, 2)}</td>
                  <td className="num">{fmtNum(r.lo, 2)}</td>
                  <td className="num">{fmtNum(r.pct, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Realised summary" right="Implied volatility: not connected (needs licensed option quotes)">
          <KV
            items={[
              ['30D realised', `${fmtNum(rows[2].cur, 2)}${unit}`],
              ['2Y median 30D', `${fmtNum(percentile(all30, 0.5), 2)}${unit}`],
              ['2Y 10th / 90th pctile', `${fmtNum(percentile(all30, 0.1), 2)} / ${fmtNum(percentile(all30, 0.9), 2)}`],
            ]}
          />
        </Section>
      </div>
      <Section title="Rolling realised volatility · 2 years">
        <XYChart series={chart} height={260} legend xFormat={(v) => fmtDay(v)} yFormat={(v) => fmtNum(v, 1)} />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ VWAP

/** VWAP: intraday volume-weighted average price with 30-minute buckets. */
export function VWAP({ sec }: FnProps) {
  const s = sec!;
  useTick(2);
  const intra = engine.intraday(s.id);
  const q = engine.quote(s.id)!;
  let pv = 0;
  let vol = 0;
  let twapSum = 0;
  const cum: { x: number; y: number }[] = [];
  const px: { x: number; y: number }[] = [];
  const buckets = new Map<number, { t: number; o: number; h: number; l: number; c: number; v: number; pv: number }>();
  const span = 30 * 60_000;
  for (let i = 0; i < intra.length; i++) {
    const typical = (intra.h[i] + intra.l[i] + intra.c[i]) / 3;
    pv += typical * intra.v[i];
    vol += intra.v[i];
    twapSum += intra.c[i];
    px.push({ x: intra.t[i], y: intra.c[i] });
    if (vol > 0) cum.push({ x: intra.t[i], y: pv / vol });
    const k = Math.floor(intra.t[i] / span) * span;
    const b = buckets.get(k);
    if (!b) buckets.set(k, { t: k, o: intra.o[i], h: intra.h[i], l: intra.l[i], c: intra.c[i], v: intra.v[i], pv: typical * intra.v[i] });
    else {
      b.h = Math.max(b.h, intra.h[i]);
      b.l = Math.min(b.l, intra.l[i]);
      b.c = intra.c[i];
      b.v += intra.v[i];
      b.pv += typical * intra.v[i];
    }
  }
  const vwap = vol > 0 ? pv / vol : NaN;
  const twap = intra.length ? twapSum / intra.length : NaN;
  const rows = [...buckets.values()].reverse();
  let running = 0;
  let runningV = 0;
  const cumByBucket = new Map<number, number>();
  for (const b of [...buckets.values()]) {
    running += b.pv;
    runningV += b.v;
    cumByBucket.set(b.t, runningV > 0 ? running / runningV : NaN);
  }
  return (
    <div>
      <FnHeader code="VWAP" title="Volume Weighted Average Price" sec={s} sub="Today, UTC session" />
      <div className="cols">
        <Section title="Summary">
          <KV
            items={[
              ['Last', <LivePx key="l" id={s.id} />],
              ['VWAP', fmtNum(vwap, s.dec)],
              ['Last vs VWAP', `${fmtNum(((q.last / vwap) - 1) * 10_000, 1)} bp`],
              ['TWAP', fmtNum(twap, s.dec)],
              ['Volume', fmtBig(vol)],
              ['Value traded', fmtBig(vwap * vol)],
              ['High / low', `${fmtNum(q.high, s.dec)} / ${fmtNum(q.low, s.dec)}`],
            ]}
          />
        </Section>
        <Section title="Price and cumulative VWAP">
          <XYChart
            series={[
              { label: 'Last', color: '#ffb547', points: px },
              { label: 'VWAP', color: '#5aa7ff', points: cum },
            ]}
            height={240}
            legend
            xFormat={(v) => fmtTime(v, false)}
            yFormat={(v) => fmtNum(v, s.dec)}
          />
        </Section>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Time</th>
            <th className="num">Open</th>
            <th className="num">High</th>
            <th className="num">Low</th>
            <th className="num">Close</th>
            <th className="num">Volume</th>
            <th className="num">% day</th>
            <th className="num">Bucket VWAP</th>
            <th className="num hide-m">Cum VWAP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.t}>
              <td className="amber">{fmtTime(b.t, false)}</td>
              <td className="num">{fmtNum(b.o, s.dec)}</td>
              <td className="num">{fmtNum(b.h, s.dec)}</td>
              <td className="num">{fmtNum(b.l, s.dec)}</td>
              <td className="num white">{fmtNum(b.c, s.dec)}</td>
              <td className="num">{fmtBig(b.v)}</td>
              <td className="num">{fmtNum(vol > 0 ? (b.v / vol) * 100 : NaN, 1)}</td>
              <td className="num">{fmtNum(b.v > 0 ? b.pv / b.v : NaN, s.dec)}</td>
              <td className="num hide-m">{fmtNum(cumByBucket.get(b.t), s.dec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------- MOV

/** Dow Jones Industrial Average members in the universe (price weighted). */
const DOW = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'JPM', 'GS', 'V', 'UNH', 'HD', 'CAT', 'MCD', 'IBM', 'KO', 'DIS', 'WMT', 'CRM', 'CSCO', 'CVX', 'JNJ', 'MRK', 'PG', 'NKE', 'AXP', 'BA', 'HON', 'MMM', 'AMGN', 'SHW', 'TRV'];

function indexMembers(ix: SecurityDef): SecurityDef[] {
  const eqs = engine.securities.filter((d) => d.cls === 'equity');
  switch (ix.ticker) {
    case 'INDU':
      return eqs.filter((d) => d.country === 'US' && DOW.includes(d.ticker.split(' ')[0]));
    case 'NDX':
    case 'CCMP':
      return eqs.filter((d) => d.country === 'US' && (d.exch ?? '').startsWith('NASDAQ'));
    case 'SPX':
    case 'RTY':
      return eqs.filter((d) => d.country === 'US');
    case 'SX5E':
    case 'SXXP':
      return eqs.filter((d) => d.region === 'EMEA');
    default:
      return eqs.filter((d) => d.country === ix.country);
  }
}

/** MOV: which members moved the index, in index points. */
export function MOV(props: FnProps) {
  const { sec, route } = props;
  const ix = sec?.cls === 'index' ? sec : engine.get(route.args ? `${route.args} Index` : 'SPX Index') ?? engine.get('SPX Index')!;
  if (engine.realOnly && ix.ticker === 'INDU') return <DowMovers ix={ix} />;
  return <IndexMovers {...props} />;
}

interface DowRow {
  ticker: string;
  id?: string;
  last: number;
  prevClose: number;
  chg: number;
  pct: number;
}

/**
 * The Dow on real data: every one of its 30 members, the ones outside the
 * universe quoted directly. Points are each member's price change divided by
 * the Dow divisor, which is the members' previous closes summed and divided
 * by the index's previous close; the sum is checked against the index.
 */
function DowMovers({ ix }: { ix: SecurityDef }) {
  useTick(2);
  const iq = engine.quote(ix.id)!;
  // The membership comes from the source: a fixed list goes out of date when the index changes.
  const members = useIndexComponents('^DJI');
  const list = members ?? [];
  const inUniverse = (t: string) => {
    const id = `${t} US Equity`;
    return engine.get(id) && engine.hasSource(id) ? id : undefined;
  };
  const outside = list.filter((t) => !inUniverse(t));
  const quotes = useYahooQuotes(outside, 30_000);
  const rows: DowRow[] = list.map((t) => {
    const id = inUniverse(t);
    if (id) {
      const q = engine.quote(id)!;
      return { ticker: t, id, last: q.last, prevClose: q.prevClose, chg: q.chg, pct: q.pct };
    }
    const q = quotes.get(t);
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
    return { ticker: t, last: n(q?.regularMarketPrice), prevClose: n(q?.regularMarketPreviousClose), chg: n(q?.regularMarketChange), pct: n(q?.regularMarketChangePercent) };
  });
  const complete = rows.length > 0 && rows.every((r) => Number.isFinite(r.prevClose) && Number.isFinite(r.chg));
  const divisor = rows.reduce((a, r) => a + r.prevClose, 0) / iq.prevClose;
  const pts = (r: DowRow) => (complete ? r.chg / divisor : NaN);
  const explained = rows.reduce((a, r) => a + pts(r), 0);
  const consistent = Math.abs(explained - iq.chg) <= Math.max(2, Math.abs(iq.chg) * 0.02);
  const sorted = [...rows].sort((a, b) => pts(b) - pts(a));
  const table = (list: DowRow[]) => (
    <DataTable
      rows={list}
      rowKey={(r) => r.ticker}
      columns={[
        { key: 't', label: 'Ticker', render: (r) => (r.id ? <SecLink id={r.id}>{r.ticker} US</SecLink> : <span className="amber">{r.ticker} US</span>) },
        { key: 'l', label: 'Last', num: true, render: (r) => (r.id ? <LivePx id={r.id} /> : fmtNum(r.last, 2)) },
        { key: 'c', label: '%Chg', num: true, render: (r) => <Chg v={r.pct} pct /> },
        { key: 'p', label: 'Index pts', num: true, render: (r) => <Chg v={pts(r)} dec={2} /> },
        { key: 'w', label: 'Wt %', num: true, hideM: true, render: (r) => fmtNum((r.prevClose / (divisor * iq.prevClose)) * 100, 2) },
      ]}
    />
  );
  return (
    <div>
      <FnHeader code="CONTRIB" title="Index Movers" sec={ix} sub={`${list.length || 'All'} members as the source lists them · price weighted · points from the Dow divisor`} />
      <div className="qstrip">
        <span className="yellow b">{ix.ticker}</span>
        <LivePx id={ix.id} />
        <DayChg q={iq} dec={2} />
        <DayChg q={iq} pct />
        <span>
          <span className="lbl">Members explain</span>
          {complete ? (
            <>
              <Chg v={explained} dec={2} /> pts
            </>
          ) : (
            'loading members…'
          )}
        </span>
        <span>
          <span className="lbl">Divisor</span>
          {complete ? fmtNum(divisor, 5) : '--'}
        </span>
      </div>
      {!complete ? (
        <div className="empty">{members && !members.length ? 'The source did not return the index membership; it is tried again shortly.' : 'Loading the members and their quotes…'}</div>
      ) : (
        <div className="cols">
          <Section title="Leaders (index points)">{table(sorted.slice(0, 15))}</Section>
          <Section title="Laggards (index points)">{table([...sorted].reverse().slice(0, 15))}</Section>
        </div>
      )}
      <p className="pad-s muted">
        {complete && !consistent
          ? `The members' moves add up to ${fmtNum(explained, 2)} points against the index's ${fmtNum(iq.chg, 2)}: quotes may be at different times, or the membership list here may be out of date.`
          : 'Points = price change ÷ divisor; the divisor is the members’ previous closes summed and divided by the index’s previous close.'}
      </p>
    </div>
  );
}

function IndexMovers({ sec, route }: FnProps) {
  useTick(2);
  const ix = sec?.cls === 'index' ? sec : engine.get(route.args ? `${route.args} Index` : 'SPX Index') ?? engine.get('SPX Index')!;
  const iq = engine.quote(ix.id)!;
  const members = indexMembers(ix);
  const priceWeighted = ix.ticker === 'INDU';
  // On real data a cap-weighted index is ranked by each member's change in market value: the full
  // index weights are not public, and weights within the members covered here would overstate points.
  const byValue = engine.realOnly && !priceWeighted;
  const w = members.map((d) => (priceWeighted ? engine.quote(d.id)!.prevClose : marketCapUsd(d.id)));
  const wSum = w.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0) || 1;
  const rows = members.map((d, i) => {
    const q = engine.quote(d.id)!;
    const weight = w[i] / wSum;
    const cap = marketCapUsd(d.id);
    const valueChg = cap * (q.pct / (100 + q.pct));
    return { d, q, weight, pts: byValue ? valueChg : iq.prevClose * weight * (q.pct / 100) };
  }).filter((r) => Number.isFinite(r.pts));
  const explained = rows.reduce((a, r) => a + r.pts, 0);
  const adv = rows.filter((r) => r.q.pct > 0).length;
  const dec = rows.filter((r) => r.q.pct < 0).length;
  const up = [...rows].sort((a, b) => b.pts - a.pts).slice(0, 12);
  const dn = [...rows].sort((a, b) => a.pts - b.pts).slice(0, 12);
  const table = (list: typeof rows) => (
    <DataTable
      rows={list}
      rowKey={(r) => r.d.id}
      columns={[
        { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink> },
        { key: 'l', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
        { key: 'c', label: '%Chg', num: true, render: (r) => <DayChg q={r.q} pct /> },
        byValue
          ? { key: 'p', label: 'Mkt value chg USD', num: true, render: (r) => <span className={r.pts > 0 ? 'up' : r.pts < 0 ? 'dn' : ''}>{fmtBig(r.pts)}</span> }
          : { key: 'p', label: 'Index pts', num: true, render: (r) => <Chg v={r.pts} dec={2} /> },
        ...(byValue ? [] : [{ key: 'w', label: 'Wt %', num: true, hideM: true, render: (r: (typeof rows)[number]) => fmtNum(r.weight * 100, 2) }]),
      ]}
    />
  );
  return (
    <div>
      <FnHeader
        code="CONTRIB"
        title="Index Movers"
        sec={ix}
        sub={byValue ? `${rows.length} members covered here · ranked by change in market value today` : `${members.length} members in the Armin universe · ${priceWeighted ? 'price weighted' : 'cap weighted'} within the universe`}
      />
      <div className="qstrip">
        <span className="yellow b">{ix.ticker}</span>
        <LivePx id={ix.id} />
        <DayChg q={iq} dec={2} />
        <DayChg q={iq} pct />
        {byValue ? null : (
          <span>
            <span className="lbl">Members explain</span>
            <Chg v={explained} dec={2} /> pts
          </span>
        )}
        <span>
          <span className="lbl">Adv / Dec</span>
          <span className="up">{adv}</span> / <span className="dn">{dec}</span>
        </span>
      </div>
      {members.length === 0 ? (
        <p className="pad muted">No members of {ix.ticker} in the Armin universe. Try SPX, INDU, NDX, UKX, DAX, NKY or HSI.</p>
      ) : (
        <div className="cols">
          <Section title={byValue ? 'Leaders (market value)' : 'Leaders (index points)'}>{table(up)}</Section>
          <Section title={byValue ? 'Laggards (market value)' : 'Laggards (index points)'}>{table(dn)}</Section>
        </div>
      )}
      <p className="pad-s muted">
        {byValue
          ? 'Market value change = market cap now minus market cap at the previous close (USD). The index’s full membership and weights are not public, so contributions in index points are not shown.'
          : priceWeighted
            ? 'Contribution = price change × (previous index close ÷ sum of members’ previous closes), which equals price change ÷ the Dow divisor when every member is covered. “Members explain” should match the index’s own change.'
            : 'Contribution = previous index close × member weight × member % change. Weights are relative to the members covered here, not the official index weights.'}
      </p>
      <div className="pad-s muted">{fmtPct(iq.pct)} index move today.</div>
    </div>
  );
}
