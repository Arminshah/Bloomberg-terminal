import { FnHeader } from '../components/FnHeader';
import { Section } from '../components/cells';
import { XYChart } from '../components/chart/XYChart';
import { RealBadge } from '../components/Source';
import { fmtDay, fmtNum, fmtTime } from '../core/format';
import { eiaAvailable, gasMonths, parseEiaData, parseStorageReport, useEia, weeklyRows, type EiaPart, type WeeklyRow } from '../data/live/eia';
import { execute } from '../terminal/exec';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * NGAS, natural gas statistics: EIA's weekly storage report as EIA publishes it (stocks by region, the net change and
 * implied flow, the year-ago level and the five-year average, with EIA's own comparisons), two years of the Lower 48's
 * weekly stocks, and the monthly dry gas production and consumption. Desktop app; every figure is EIA's.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => fmtDay(Date.parse(`${iso}T00:00:00Z`));
const signed = (v: number, dec = 0) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmtNum(v, dec)}` : '');
const cls = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const received = (p: EiaPart | undefined) => (p?.at ? ` · received ${fmtDay(p.at)} ${fmtTime(p.at, false)}${p.cached ? ' (kept)' : ''}${p.stale ? ' · STALE: the latest request failed' : ''}` : '');

function Waiting({ part, what }: { part: EiaPart | undefined; what: string }) {
  if (!part || part.state === 'loading') return <div className="empty">Loading {what} from EIA…</div>;
  return <div className="empty amber">{part.message ?? `No ${what} from EIA.`}</div>;
}

/** EIA's weekly storage report, region by region, with its own comparisons. */
export function StorageReportTable({ lower48Only = false }: { lower48Only?: boolean }) {
  const part = useEia('storage-report');
  const report = part?.state === 'ok' && part.text ? parseStorageReport(part.text) : null;
  if (!report) return part?.state === 'ok' ? <div className="empty amber">EIA&apos;s storage report could not be read.</div> : <Waiting part={part} what="the weekly storage report" />;
  const rows = lower48Only ? report.rows.filter((r) => r.name === 'Total Lower 48') : report.rows;
  return (
    <>
      <table className="tbl" data-testid="eia-storage">
        <thead>
          <tr>
            <th>Region (Bcf)</th>
            <th className="num">{day(report.week)}</th>
            <th className="num hide-m">{day(report.weekAgo)}</th>
            <th className="num">Net change</th>
            <th className="num hide-m" title="Net change without reclassifications between base gas and working gas">Implied flow</th>
            <th className="num" title={`EIA's year-ago level, for ${day(report.yearAgo)}`}>Year ago</th>
            <th className="num hide-m">% vs year</th>
            <th className="num" title={`EIA's ${report.fiveYearLabel}`}>5-yr avg</th>
            <th className="num hide-m">% vs 5-yr</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={r.name === 'Salt' || r.name === 'Nonsalt' ? 'muted' : ''}>
              <td className={r.name === 'Total Lower 48' ? 'white' : ''}>{r.name === 'Salt' || r.name === 'Nonsalt' ? `  ${r.name}` : r.name}{r.revised ? ' (revised)' : ''}{r.reclassified ? ' (reclassified)' : ''}</td>
              <td className="num white">{fmtNum(r.now, 0)}</td>
              <td className="num hide-m">{fmtNum(r.weekAgo, 0)}</td>
              <td className={`num ${cls(r.netChange)}`}>{signed(r.netChange)}</td>
              <td className={`num hide-m ${cls(r.impliedFlow)}`}>{signed(r.impliedFlow)}</td>
              <td className="num">{fmtNum(r.yearAgo, 0)}</td>
              <td className={`num hide-m ${cls(r.pctYearAgo)}`}>{signed(r.pctYearAgo, 1)}%</td>
              <td className="num">{fmtNum(r.fiveYear, 0)}</td>
              <td className={`num hide-m ${cls(r.pctFiveYear)}`}>{signed(r.pctFiveYear, 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Working gas in underground storage, billion cubic feet, for the week ending {day(report.week)} (released {day(report.released)}; EIA publishes the next report on Thursday at 10:30 New York time). Year-ago and {report.fiveYearLabel} figures are EIA&apos;s own. Source: EIA, Weekly Natural Gas Storage Report{received(part)}.
      </div>
    </>
  );
}

/** EIA's weekly petroleum supply estimates: stocks, production and refinery runs, products supplied. */
export function PetroleumWeekly() {
  const part = useEia('petroleum');
  const parsed = part?.state === 'ok' && part.text ? parseEiaData(part.text) : null;
  if (!parsed) return <Waiting part={part} what="the weekly petroleum figures" />;
  if ('error' in parsed) return <div className="empty amber">{parsed.error}</div>;
  const rows = weeklyRows(parsed.series);
  if (!rows.length) return <div className="empty amber">EIA&apos;s answer held none of the weekly petroleum series.</div>;
  const weeks = [...new Set(rows.map((r) => r.week))];
  const fmt = (r: WeeklyRow, v: number) => (r.unit === 'million barrels' ? fmtNum(v, 3) : r.unit === '%' ? fmtNum(v, 1) : fmtNum(v, 0));
  return (
    <>
      <table className="tbl" data-testid="eia-petroleum">
        <thead>
          <tr>
            <th>US weekly petroleum</th>
            <th className="hide-m">Unit</th>
            <th className="num">Week ending</th>
            <th className="num">Latest</th>
            <th className="num">Change</th>
            <th className="num">Year ago</th>
            <th className="num hide-m">vs year ago</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="muted">{r.group} · </span>
                {r.label}
              </td>
              <td className="muted hide-m">{r.unit}</td>
              <td className="num">{day(r.week)}</td>
              <td className="num white">{fmt(r, r.value)}</td>
              <td className={`num ${cls(r.change)}`} title={`Against the week ending ${day(r.priorWeek)}`}>{Number.isFinite(r.change) ? `${r.change > 0 ? '+' : ''}${fmt(r, r.change)}` : ''}</td>
              <td className="num" title={`The week ending ${day(r.yearAgoWeek)}`}>{Number.isFinite(r.yearAgo) ? fmt(r, r.yearAgo) : ''}</td>
              <td className={`num hide-m ${cls(r.value - r.yearAgo)}`}>{Number.isFinite(r.yearAgo) ? `${r.value - r.yearAgo > 0 ? '+' : ''}${fmt(r, r.value - r.yearAgo)}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        EIA&apos;s weekly petroleum supply estimates for the week ending {weeks.map(day).join(' and ')}, as its Open Data API gives them (stocks in million barrels from EIA&apos;s thousands; flows in thousand barrels a day). The year ago is the same week a year earlier (364 days), as EIA&apos;s weekly report compares it. EIA releases the report on Wednesdays at 10:30 New York time; its API can show the new week a few hours later. Products supplied is EIA&apos;s measure of consumption. Source: EIA, Weekly Petroleum Status Report data{received(part)}.
      </div>
    </>
  );
}

function StorageHistory() {
  const part = useEia('storage-history');
  const parsed = part?.state === 'ok' && part.text ? parseEiaData(part.text) : null;
  if (!parsed) return <Waiting part={part} what="the weekly storage history" />;
  if ('error' in parsed) return <div className="empty amber">{parsed.error}</div>;
  const pts = parsed.series.get('NW2_EPG0_SWO_R48_BCF')?.points ?? [];
  if (!pts.length) return <div className="empty amber">EIA&apos;s answer held no Lower 48 storage series.</div>;
  const last = pts[pts.length - 1];
  return (
    <>
      <XYChart
        height={200}
        series={[{ label: 'Lower 48 working gas (Bcf)', color: '#ffb547', points: pts.map((p) => ({ x: Date.parse(`${p.period}T00:00:00Z`), y: p.value })) }]}
        xFormat={(v) => fmtDay(v)}
        yFormat={(v) => fmtNum(v, 0)}
        legend={false}
      />
      <div className="note">
        Weekly, from {day(pts[0].period)} to {day(last.period)} ({fmtNum(last.value, 0)} Bcf). Source: EIA Open Data API, weekly working gas in underground storage{received(part)}.
      </div>
    </>
  );
}

function GasMonthly() {
  const part = useEia('gas-monthly');
  const parsed = part?.state === 'ok' && part.text ? parseEiaData(part.text) : null;
  if (!parsed) return <Waiting part={part} what="the monthly production and consumption" />;
  if ('error' in parsed) return <div className="empty amber">{parsed.error}</div>;
  const months = gasMonths(parsed.series).slice(0, 13);
  if (!months.length) return <div className="empty amber">EIA&apos;s answer held no monthly production or consumption.</div>;
  const label = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  return (
    <>
      <table className="tbl" data-testid="eia-gas-monthly">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Dry production (Bcf)</th>
            <th className="num hide-m">a day</th>
            <th className="num">Consumption (Bcf)</th>
            <th className="num hide-m">a day</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <td>{label(m.month)}</td>
              <td className="num white">{fmtNum(m.production, 1)}</td>
              <td className="num hide-m">{fmtNum(m.productionPerDay, 2)}</td>
              <td className="num white">{fmtNum(m.consumption, 1)}</td>
              <td className="num hide-m">{fmtNum(m.consumptionPerDay, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        US dry natural gas production and total consumption, from EIA&apos;s million cubic feet; a day is the month&apos;s total over its days. EIA publishes a month about two months later, in its Natural Gas Monthly, and revises recent months. Source: EIA Open Data API, natural gas supply and disposition{received(part)}.
      </div>
    </>
  );
}

export function NGAS(_: FnProps) {
  const panel = usePanelId();
  const header = <FnHeader code="NGAS" title="Natural Gas Statistics" sub={eiaAvailable() ? <><RealBadge /> EIA: weekly storage, its history, monthly production and consumption</> : "EIA's figures are read by the desktop app"} />;
  if (!eiaAvailable()) {
    return (
      <div>
        {header}
        <div className="empty">US natural gas storage, production and consumption are the EIA&apos;s, read by the desktop app (the storage history and monthly figures with your EIA_API_KEY on PROVIDERS). The browser demo has none, and none are generated.</div>
      </div>
    );
  }
  return (
    <div>
      {header}
      <Section title="Weekly storage report" right="EIA, billion cubic feet">
        <StorageReportTable />
      </Section>
      <div className="cols">
        <Section title="Lower 48 working gas, weekly">
          <StorageHistory />
        </Section>
        <Section title="Production and consumption, monthly" right="EIA">
          <GasMonthly />
        </Section>
      </div>
      <div className="note">
        <button type="button" className="act" onClick={() => execute(panel, 'NATURALGAS')}>NATURALGAS</button> Henry Hub futures and the gas page ·{' '}
        <button type="button" className="act" onClick={() => execute(panel, 'OILMARKET')}>OILMARKET</button> the oil page with EIA&apos;s weekly petroleum figures
      </div>
    </div>
  );
}
