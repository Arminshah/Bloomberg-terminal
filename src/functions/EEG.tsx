import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart, type XYSeries } from '../components/chart/XYChart';
import { COMPARE_COLORS } from '../components/chart/PriceChart';
import { fmtIso, fmtNum, fmtPct } from '../core/format';
import { consensusData, useConsensus, type EstimateTrend } from '../data/live/consensus';
import { desktopData } from '../data/live/yahoo';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * EEG, how the analysts' consensus EPS for the coming quarters and fiscal years moved: Yahoo Finance's consensus now
 * and 7, 30, 60 and 90 days before (its earningsTrend), with the analysts who raised or cut their estimate in the
 * last week and month. Yahoo gives those five readings and nothing between them; the chart joins them with lines.
 */

const PERIOD_NAMES: Record<EstimateTrend['period'], string> = { '0q': 'Current quarter', '+1q': 'Next quarter', '0y': 'Current year', '+1y': 'Next year' };

/** Each reading by its day against today (-90 is 90 days before), oldest first. */
export const READINGS: { day: number; key: keyof EstimateTrend['eps']; label: string }[] = [
  { day: -90, key: 'd90', label: '90 days ago' },
  { day: -60, key: 'd60', label: '60 days ago' },
  { day: -30, key: 'd30', label: '30 days ago' },
  { day: -7, key: 'd7', label: '7 days ago' },
  { day: 0, key: 'now', label: 'Now' },
];

/** The periods a tab shows: quarters (1) or fiscal years (2). */
export function trendsFor(trends: EstimateTrend[], tab: number): EstimateTrend[] {
  return trends.filter((t) => (tab === 1 ? t.period.endsWith('q') : t.period.endsWith('y')));
}

/** The consensus over 90 days: its change and, when the consensus 90 days before was a profit, the change in percent. */
export function trendChange(t: EstimateTrend): { abs: number; pct: number } {
  const abs = t.eps.now - t.eps.d90;
  return { abs, pct: t.eps.d90 > 0 ? (abs / t.eps.d90) * 100 : NaN };
}

export function trendSeries(trends: EstimateTrend[]): XYSeries[] {
  return trends.map((t, i) => ({
    label: `${PERIOD_NAMES[t.period]} (${fmtIso(t.end)})`,
    color: COMPARE_COLORS[i % COMPARE_COLORS.length],
    markers: true,
    points: READINGS.filter((r) => Number.isFinite(t.eps[r.key])).map((r) => ({ x: r.day, y: t.eps[r.key] })),
  }));
}

/** A zero line only when the estimates go from a loss to a profit: otherwise it flattens their moves. */
export function crossesZero(series: XYSeries[]): boolean {
  const ys = series.flatMap((x) => x.points.map((p) => p.y));
  return ys.some((y) => y < 0) && ys.some((y) => y > 0);
}

const count = (n: number) => (Number.isFinite(n) ? String(n) : '');

export function EEG({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const [tab, setTab] = useState(1);
  const desktop = desktopData();
  useConsensus(desktop ? s : undefined);
  const entry = consensusData.use((st) => st.by[s.id]);
  const all = entry?.yahoo?.trends ?? [];
  const rows = trendsFor(all, tab);
  const ccy = rows.find((t) => t.ccy)?.ccy;
  const series = trendSeries(rows);
  const csv = () => [
    ['Period', 'Ends', ...READINGS.map((r) => r.label), 'Change 90d', '% change 90d', 'Up 7d', 'Down 7d', 'Up 30d', 'Down 30d', 'Analysts', 'Currency'],
    ...all.map((t) => {
      const c = trendChange(t);
      return [PERIOD_NAMES[t.period], t.end, ...READINGS.map((r) => t.eps[r.key]), c.abs, c.pct, t.up7, t.down7, t.up30, t.down30, t.analysts, t.ccy ?? ''];
    }),
  ];
  const blank = !desktop
    ? 'The consensus history is read from Yahoo Finance in the desktop app. The browser demo has none, and none is generated.'
    : !s.eq
      ? 'Yahoo Finance gives consensus estimates for stocks only.'
      : !entry || entry.state === 'loading'
        ? 'Loading the consensus from Yahoo Finance…'
        : entry.state !== 'ok'
          ? entry.message ?? 'Yahoo Finance did not answer for this security.'
          : !rows.length
            ? `Yahoo Finance gives no consensus history for this security's ${tab === 1 ? 'quarters' : 'fiscal years'}.`
            : null;
  return (
    <div>
      <FnHeader
        code="ESTIMATEGRAPH"
        title="Earnings Estimates Graph"
        sec={s}
        sub={<><RealBadge /> Yahoo Finance: consensus EPS now and 7, 30, 60 and 90 days ago</>}
        tabs={[
          { n: 1, label: 'Quarters' },
          { n: 2, label: 'Fiscal years' },
        ]}
        tab={tab}
        onTab={setTab}
        actions={[
          { n: 96, label: 'Consensus', title: 'Consensus overview (EEO)', onClick: () => execute(panel, `${s.id} ESTIMATES`) },
          { n: 97, label: 'Earnings', title: 'Earnings & Estimates (EE)', onClick: () => execute(panel, `${s.id} EARNINGSSUMMARY`) },
          ...exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_EEG.csv`, csv),
        ]}
      />
      {blank ? (
        <div className="empty">{blank}</div>
      ) : (
        <>
          <XYChart
            series={series}
            xTicks={READINGS.map((r) => ({ v: r.day, label: r.day ? `${-r.day}d ago` : 'Now' }))}
            yFormat={(v) => fmtNum(v, 2)}
            refLines={crossesZero(series) ? [{ y: 0, color: '#555' }] : []}
            height={260}
            legend
          />
          <table className="tbl">
            <thead>
              <tr>
                <th>Period</th>
                <th>Ends</th>
                {READINGS.map((r) => (
                  <th key={r.key} className="num">{r.label}</th>
                ))}
                <th className="num">Change 90d</th>
                <th className="num">%</th>
                <th className="num hide-m" title="Analysts who raised their estimate in the last 7 days">Up 7d</th>
                <th className="num hide-m" title="Analysts who cut their estimate in the last 7 days">Down 7d</th>
                <th className="num" title="Analysts who raised their estimate in the last 30 days">Up 30d</th>
                <th className="num" title="Analysts who cut their estimate in the last 30 days">Down 30d</th>
                <th className="num">Analysts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const c = trendChange(t);
                const dir = c.abs > 0 ? 'up' : c.abs < 0 ? 'dn' : '';
                return (
                  <tr key={t.period}>
                    <td className="amber">{PERIOD_NAMES[t.period]}</td>
                    <td>{fmtIso(t.end)}</td>
                    {READINGS.map((r) => (
                      <td key={r.key} className={`num${r.key === 'now' ? ' white' : ''}`}>{fmtNum(t.eps[r.key], 3)}</td>
                    ))}
                    <td className={`num ${dir}`}>{fmtNum(c.abs, 3)}</td>
                    <td className={`num ${dir}`}>{Number.isFinite(c.pct) ? fmtPct(c.pct, 1) : Number.isFinite(c.abs) ? 'NM' : ''}</td>
                    <td className="num up hide-m">{count(t.up7)}</td>
                    <td className="num dn hide-m">{count(t.down7)}</td>
                    <td className="num up">{count(t.up30)}</td>
                    <td className="num dn">{count(t.down30)}</td>
                    <td className="num">{count(t.analysts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="note">
            EPS in {ccy ?? 'the currency Yahoo Finance gives'}, the analysts&apos; mean as Yahoo Finance gives it on each day. Yahoo gives the five readings in
            the table and nothing between them. Up and down count the analysts who raised or cut their estimate. A percentage change from a loss is not
            meaningful (NM).
          </div>
        </>
      )}
    </div>
  );
}
