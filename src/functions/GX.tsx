import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { KV } from '../components/cells';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { COMPARE_COLORS } from '../components/chart/PriceChart';
import { fmtBig, fmtNum, fmtPct } from '../core/format';
import { engine } from '../data/market';
import { BOARD_INDICES, memberReturn, membersAvailable, useIndexMembers, type IndexKey, type Member } from '../data/live/index-members';
import { useMarketShorts } from '../data/live/short-market';
import { correlation } from '../finance/stats';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { IndexPicker, openMember } from './IndexBoards';

/**
 * GX, an index's members plotted on two fields against each other: market value, price returns over seven periods,
 * index weight, dollars traded in the latest session, and short interest from FINRA's latest settlement (as a share
 * of the shares outstanding, and days to cover), with the least-squares line and the correlation. Members from the
 * index lists the app reads (S&P 500, Nasdaq-100, Dow), prices and closes from Yahoo, market values from Nasdaq.
 */

export interface GxField {
  key: string;
  label: string;
  /** The value as plotted; market value on a log scale. */
  of: (m: Member, ctx: GxContext) => number;
  fmt: (v: number) => string;
  /** Needs the members' daily closes, or FINRA's settlement. */
  needs?: 'history' | 'shorts';
}

export interface GxContext {
  index: IndexKey;
  shortPct: (m: Member) => number;
  daysToCover: (m: Member) => number;
}

const ret = (period: Parameters<typeof memberReturn>[2]): GxField => ({
  key: period,
  label: `${period} return %`,
  of: (m, c) => memberReturn(c.index, m, period),
  fmt: (v) => fmtPct(v, 1),
  ...(period === '1D' ? {} : { needs: 'history' as const }),
});

export const FIELDS: GxField[] = [
  { key: 'cap', label: 'Market value (log)', of: (m) => (m.cap > 0 ? Math.log10(m.cap) : NaN), fmt: (v) => fmtBig(10 ** v, 1) },
  ret('1D'), ret('1W'), ret('1M'), ret('3M'), ret('6M'), ret('YTD'), ret('1Y'),
  { key: 'weight', label: 'Index weight %', of: (m) => m.weight * 100, fmt: (v) => fmtNum(v, 2) },
  { key: 'traded', label: 'Traded today (log $)', of: (m) => (m.last > 0 && m.volume > 0 ? Math.log10(m.last * m.volume) : NaN), fmt: (v) => fmtBig(10 ** v, 1) },
  { key: 'si', label: 'Short interest % of shares', of: (m, c) => c.shortPct(m), fmt: (v) => fmtNum(v, 2), needs: 'shorts' },
  { key: 'dtc', label: 'Days to cover', of: (m, c) => c.daysToCover(m), fmt: (v) => fmtNum(v, 2), needs: 'shorts' },
];

export interface GxPoint {
  member: Member;
  x: number;
  y: number;
}

export function gxPoints(members: Member[], fx: GxField, fy: GxField, ctx: GxContext): GxPoint[] {
  return members.map((member) => ({ member, x: fx.of(member, ctx), y: fy.of(member, ctx) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** The least-squares line through the points, with the correlation and R². */
export function fitLine(points: { x: number; y: number }[]): { n: number; slope: number; intercept: number; r: number; r2: number } {
  const n = points.length;
  if (n < 3) return { n, slope: NaN, intercept: NaN, r: NaN, r2: NaN };
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  const sxy = points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const slope = sxx > 0 ? sxy / sxx : NaN;
  const r = correlation(points.map((p) => p.x), points.map((p) => p.y));
  return { n, slope, intercept: my - slope * mx, r, r2: r * r };
}

function indexOf({ sec, route }: FnProps): SecurityDef {
  return sec?.cls === 'index' ? sec : engine.get(route.args ? `${route.args.trim().toUpperCase()} Index` : 'SPX Index') ?? engine.get('SPX Index')!;
}

export function GX(props: FnProps) {
  const ix = indexOf(props);
  if (!membersAvailable() || !BOARD_INDICES[ix.id]) {
    return (
      <div>
        <FnHeader code="CROSSSECTION" title="Graphical Cross Sectional" sec={ix} />
        <div className="chart-tools">
          <IndexPicker ix={ix} fn="CROSSSECTION" />
        </div>
        <div className="empty">
          {membersAvailable()
            ? `The cross section is available for the S&P 500 (SPX), the Nasdaq-100 (NDX) and the Dow (INDU): the full membership of ${ix.id} has no free source.`
            : 'The cross section needs the desktop app, which reads every member of the index. The browser demo has none, and none is generated.'}
        </div>
      </div>
    );
  }
  return <CrossSection ix={ix} />;
}

function CrossSection({ ix }: { ix: SecurityDef }) {
  const panel = usePanelId();
  const [xKey, setX] = useState('cap');
  const [yKey, setY] = useState('YTD');
  const [sector, setSector] = useState('');
  const fx = FIELDS.find((f) => f.key === xKey) ?? FIELDS[0];
  const fy = FIELDS.find((f) => f.key === yKey) ?? FIELDS[1];
  const history = fx.needs === 'history' || fy.needs === 'history';
  const short = fx.needs === 'shorts' || fy.needs === 'shorts';
  const board = useIndexMembers(ix.id, { history });
  const shorts = useMarketShorts(0, short);
  const byTicker = new Map(short ? shorts.lines.map((l) => [l.symbol, l]) : []);
  const ctx: GxContext = {
    index: board!.index.key,
    shortPct: (m) => {
      const l = byTicker.get(m.symbol);
      const out = shorts.outstanding(m.symbol);
      return l && out > 0 ? (l.shares / out) * 100 : NaN;
    },
    daysToCover: (m) => byTicker.get(m.symbol)?.daysToCover ?? NaN,
  };
  const members = board?.members ?? [];
  const points = gxPoints(members, fx, fy, ctx);
  const fit = fitLine(points);
  const sectors = [...new Set(members.map((m) => m.sector).filter(Boolean))].sort();
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const series: XYSeries[] = [
    { label: sector ? 'Other members' : 'Members', color: sector ? '#777777' : COMPARE_COLORS[0], kind: 'scatter', points: points.filter((p) => !sector || p.member.sector !== sector).map((p) => ({ x: p.x, y: p.y, label: p.member.symbol })) },
    ...(sector ? [{ label: sector, color: COMPARE_COLORS[3], kind: 'scatter' as const, points: points.filter((p) => p.member.sector === sector).map((p) => ({ x: p.x, y: p.y, label: p.member.symbol })) }] : []),
    ...(Number.isFinite(fit.slope) ? [{ label: 'Least squares', color: '#e8e8e8', dash: [4, 3], points: [{ x: x0, y: fit.intercept + fit.slope * x0 }, { x: x1, y: fit.intercept + fit.slope * x1 }] }] : []),
  ];
  const columns: Column<GxPoint>[] = [
    { key: 'sym', label: 'Ticker', render: (p) => <span className="amber">{p.member.symbol}</span>, sort: (p) => p.member.symbol },
    { key: 'name', label: 'Name', render: (p) => p.member.name, sort: (p) => p.member.name, hideM: true },
    { key: 'sector', label: 'Sector', render: (p) => p.member.sector, sort: (p) => p.member.sector, hideN: true },
    { key: 'x', label: fx.label, num: true, render: (p) => fx.fmt(p.x), sort: (p) => p.x },
    { key: 'y', label: fy.label, num: true, render: (p) => fy.fmt(p.y), sort: (p) => p.y, cls: () => 'white' },
    { key: 'res', label: 'Off the line', num: true, render: (p) => (Number.isFinite(fit.slope) ? fmtNum(p.y - (fit.intercept + fit.slope * p.x), 2) : ''), sort: (p) => p.y - (fit.intercept + fit.slope * p.x), title: 'Y less the least-squares line at X', hideM: true },
  ];
  const csv = () => [['Ticker', 'Name', 'Sector', fx.label, fy.label], ...points.map((p) => [p.member.symbol, p.member.name, p.member.sector, p.x, p.y])];
  const pick = (value: string, set: (v: string) => void, label: string) => (
    <label className="fld">
      {label}
      <select className="sel-inp" aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
        {FIELDS.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
    </label>
  );
  const waiting = !members.length
    ? board?.state === 'error' ? board.message ?? 'The index list did not load.' : 'Loading the index members…'
    : points.length < 3
      ? history ? 'Loading the members’ daily closes…' : short ? (shorts.state === 'error' ? shorts.message ?? 'FINRA did not answer.' : 'Reading FINRA’s latest settlement…') : 'Loading the members’ prices…'
      : '';
  return (
    <div>
      <FnHeader
        code="CROSSSECTION"
        title="Graphical Cross Sectional"
        sec={ix}
        sub={<><RealBadge /> {board?.index.from ?? ''} · prices from Yahoo, market values from Nasdaq{short ? `, short interest from FINRA${shorts.date ? ` (${shorts.date})` : ''}` : ''}</>}
        actions={exportActions(panel, `${ix.ticker.replace(/\W+/g, '_')}_GX_${fx.key}_${fy.key}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <IndexPicker ix={ix} fn="CROSSSECTION" />
            {pick(xKey, setX, 'X axis')}
            {pick(yKey, setY, 'Y axis')}
            <label className="fld">
              Highlight
              <select className="sel-inp" aria-label="Highlight" value={sector} onChange={(e) => setSector(e.target.value)}>
                <option value="">No sector</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      {waiting ? (
        <div className="empty" role="status">{waiting}</div>
      ) : (
        <>
          <XYChart series={series} xFormat={fx.fmt} yFormat={fy.fmt} xLabel={fx.label} height={300} legend />
          <KV
            items={[
              ['Members plotted', `${fit.n} of ${members.length}`],
              ['Correlation', `${fmtNum(fit.r, 2)} (R² ${fmtNum(fit.r2, 2)})`],
              ['Least-squares line', `${fy.label} = ${fmtNum(fit.intercept, 3)} ${fit.slope < 0 ? '−' : '+'} ${fmtNum(Math.abs(fit.slope), 3)} × ${fx.label}`],
            ]}
          />
          <DataTable columns={columns} rows={points} rowKey={(p) => p.member.symbol} defaultSort={{ key: 'y', dir: -1 }} onRowClick={(p) => openMember(panel, p.member)} numbered={10} />
          <div className="note">
            Market value and dollars traded are plotted on a log scale. Returns are price returns from the members&apos; daily closes; short interest is FINRA&apos;s latest
            settlement over the shares outstanding (Nasdaq&apos;s market value over its price). Members without both figures are left out.
          </div>
        </>
      )}
    </div>
  );
}
