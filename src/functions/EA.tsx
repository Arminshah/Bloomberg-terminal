import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { DataTable, type Column } from '../components/DataTable';
import { KV, Section } from '../components/cells';
import { fmtIso, fmtNum, fmtPct } from '../core/format';
import { DAY_MS } from '../data/calendar';
import { engine } from '../data/market';
import { isoDay, tickerKey, useMarketCalendar, type CalendarReport } from '../data/live/earnings-calendar';
import { BOARD_INDICES, membersAvailable, useIndexMembers, type Member } from '../data/live/index-members';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { IndexPicker, openMember } from './IndexBoards';

/**
 * EA, an index's earnings season: which members have reported the calendar quarter's results, how many beat, met or
 * missed the analysts' EPS forecast and by how much, their revenue against expectations, and their earnings growth on
 * the year, overall and by sector, with the members still to report. Reports come from Nasdaq's earnings calendar
 * (expected and reported EPS, the year-ago EPS on the same basis), with revenue from Finnhub's and FMP's calendars when
 * their keys are set; members from the index lists the app reads (S&P 500, Nasdaq-100, Dow). Nothing is generated.
 */

export interface Season {
  /** The calendar quarter whose results are reported, "Q3 2026". */
  label: string;
  /** Report days: from the day after the quarter ends to the end of the next quarter. */
  from: string;
  to: string;
}

/** The season of the calendar quarter that ended last before `today`, or `back` quarters before it. */
export function seasonOf(today: string, back = 0): Season {
  const d = new Date(`${today}T00:00:00Z`);
  const idx = d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3) - 1 - back;
  const y = Math.floor(idx / 4);
  const q = idx - y * 4;
  const end = Date.UTC(y, q * 3 + 3, 0);
  const next = Date.UTC(y, q * 3 + 6, 0);
  return { label: `Q${q + 1} ${y}`, from: isoDay(end + DAY_MS), to: isoDay(next) };
}

export type Verdict = 'beat' | 'inline' | 'miss';

export interface SeasonLine {
  member: Member;
  report?: CalendarReport;
  reported: boolean;
  epsEst: number;
  epsAct: number;
  /** Reported against expected, in percent of the estimate's size. */
  surprise: number;
  verdict?: Verdict;
  revEst: number;
  revAct: number;
  revSurprise: number;
  epsYearAgo: number;
  /** EPS against the same quarter a year before, in percent; NaN to or from a loss. */
  growth: number;
  /** Shares outstanding, from the market value and the price: weights the index's earnings. */
  shares: number;
}

const ok = (n: number | undefined): n is number => n != null && Number.isFinite(n);
const pctOf = (a: number, e: number) => (ok(a) && ok(e) && e !== 0 ? ((a - e) / Math.abs(e)) * 100 : NaN);

/** Beat, in line or missed, on EPS rounded to the cent as forecasts are published. */
export function verdict(act: number, est: number): Verdict | undefined {
  if (!ok(act) || !ok(est)) return undefined;
  const a = Math.round(act * 100);
  const e = Math.round(est * 100);
  return a > e ? 'beat' : a === e ? 'inline' : 'miss';
}

/** Each member with its report in the season (the first one there), reported or still to come. */
export function seasonLines(reports: CalendarReport[], members: Member[], season: Season): SeasonLine[] {
  const by = new Map<string, CalendarReport>();
  for (const r of [...reports].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.date < season.from || r.date > season.to) continue;
    const k = tickerKey(r.symbol);
    if (!by.has(k)) by.set(k, r);
  }
  return members.map((m) => {
    const r = by.get(tickerKey(m.symbol));
    const epsEst = r?.eps.est ?? NaN;
    const epsAct = r?.eps.actual ?? NaN;
    const yearAgo = r?.epsYearAgo ?? NaN;
    return {
      member: m,
      report: r,
      reported: ok(epsAct) || ok(r?.rev.actual),
      epsEst,
      epsAct,
      surprise: pctOf(epsAct, epsEst),
      verdict: verdict(epsAct, epsEst),
      revEst: r?.rev.est ?? NaN,
      revAct: r?.rev.actual ?? NaN,
      revSurprise: pctOf(r?.rev.actual ?? NaN, r?.rev.est ?? NaN),
      epsYearAgo: yearAgo,
      growth: ok(epsAct) && ok(yearAgo) && epsAct > 0 && yearAgo > 0 ? (epsAct / yearAgo - 1) * 100 : NaN,
      shares: ok(m.cap) && m.last > 0 ? m.cap / m.last : NaN,
    };
  });
}

export interface SeasonStats {
  members: number;
  reported: number;
  /** Members whose EPS is compared with a forecast. */
  compared: number;
  beat: number;
  inline: number;
  missed: number;
  medianSurprise: number;
  /** The reported members' earnings (EPS times shares) against their expected earnings, in percent. */
  aggSurprise: number;
  revCompared: number;
  revBeat: number;
  medianRevSurprise: number;
  /** The reported members' earnings against the same members' a year before, in percent, and how many count. */
  aggGrowth: number;
  growthCount: number;
  toReport: number;
  /** Members still to report with a date in the season, and those without one. */
  dated: number;
}

function median(xs: number[]): number {
  const v = xs.filter(ok).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function seasonStats(lines: SeasonLine[]): SeasonStats {
  const rep = lines.filter((l) => l.reported);
  const cmp = rep.filter((l) => l.verdict);
  const rev = rep.filter((l) => ok(l.revSurprise));
  const weighted = cmp.filter((l) => ok(l.shares));
  const sumA = weighted.reduce((a, l) => a + l.epsAct * l.shares, 0);
  const sumE = weighted.reduce((a, l) => a + l.epsEst * l.shares, 0);
  const grown = rep.filter((l) => ok(l.epsAct) && ok(l.epsYearAgo) && ok(l.shares));
  const nowE = grown.reduce((a, l) => a + l.epsAct * l.shares, 0);
  const agoE = grown.reduce((a, l) => a + l.epsYearAgo * l.shares, 0);
  const coming = lines.filter((l) => !l.reported);
  return {
    members: lines.length,
    reported: rep.length,
    compared: cmp.length,
    beat: cmp.filter((l) => l.verdict === 'beat').length,
    inline: cmp.filter((l) => l.verdict === 'inline').length,
    missed: cmp.filter((l) => l.verdict === 'miss').length,
    medianSurprise: median(cmp.map((l) => l.surprise)),
    aggSurprise: weighted.length && sumE !== 0 ? ((sumA - sumE) / Math.abs(sumE)) * 100 : NaN,
    revCompared: rev.length,
    revBeat: rev.filter((l) => l.revAct > l.revEst).length,
    medianRevSurprise: median(rev.map((l) => l.revSurprise)),
    aggGrowth: grown.length && agoE > 0 ? (nowE / agoE - 1) * 100 : NaN,
    growthCount: grown.length,
    toReport: coming.length,
    dated: coming.filter((l) => l.report).length,
  };
}

/** The season's figures by sector, largest number of members first. */
export function bySector(lines: SeasonLine[]): { sector: string; stats: SeasonStats }[] {
  const groups = new Map<string, SeasonLine[]>();
  for (const l of lines) {
    const k = l.member.sector || 'Not classified';
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return [...groups].map(([sector, ls]) => ({ sector, stats: seasonStats(ls) })).sort((a, b) => b.stats.members - a.stats.members || a.sector.localeCompare(b.sector));
}

const share = (n: number, of: number) => (of > 0 ? `${fmtNum((n / of) * 100, 0)}%` : '');
const pct = (v: number) => (ok(v) ? fmtPct(v, 1) : '');
const dir = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
const VERDICT: Record<Verdict, string> = { beat: 'Beat', inline: 'In line', miss: 'Missed' };

function indexOf({ sec, route }: FnProps): SecurityDef {
  return sec?.cls === 'index' ? sec : engine.get(route.args ? `${route.args.trim().toUpperCase()} Index` : 'SPX Index') ?? engine.get('SPX Index')!;
}

export function EA(props: FnProps) {
  const ix = indexOf(props);
  if (!membersAvailable() || !BOARD_INDICES[ix.id]) {
    return (
      <div>
        <FnHeader code="EARNINGSSEASON" title="Earnings Season Results" sec={ix} />
        <div className="chart-tools">
          <IndexPicker ix={ix} fn="EARNINGSSEASON" />
        </div>
        <div className="empty">
          {membersAvailable()
            ? `An earnings season is available for the S&P 500 (SPX), the Nasdaq-100 (NDX) and the Dow (INDU): the full membership of ${ix.id} has no free source.`
            : 'An earnings season needs the desktop app, which reads every member and the earnings calendar. The browser demo has none, and none is generated.'}
        </div>
      </div>
    );
  }
  return <SeasonBoard ix={ix} />;
}

function SeasonBoard({ ix }: { ix: SecurityDef }) {
  const panel = usePanelId();
  const [back, setBack] = useState(0);
  const [tab, setTab] = useState(1);
  const today = isoDay(Date.now());
  const season = seasonOf(today, back);
  // The season's days up to two weeks ahead: the reports to come beyond that have no forecast yet.
  const ahead = isoDay(Date.now() + 14 * DAY_MS);
  const to = season.to < ahead ? season.to : ahead;
  const board = useIndexMembers(ix.id);
  const cal = useMarketCalendar(season.from, to, true);
  const members = board?.members;
  const lines = useMemo(() => (members ? seasonLines(cal.reports, members, season) : []), [cal.reports, members, season.from, season.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = seasonStats(lines);
  const reported = lines.filter((l) => l.reported);
  const coming = lines.filter((l) => !l.reported).sort((a, b) => (a.report?.date ?? '9').localeCompare(b.report?.date ?? '9') || a.member.symbol.localeCompare(b.member.symbol));
  const sectors = bySector(lines);
  const read = cal.days - cal.loading;
  const columns: Column<SeasonLine>[] = [
    { key: 'date', label: 'Reported', render: (l) => fmtIso(l.report?.date), sort: (l) => l.report?.date ?? '' },
    { key: 'sym', label: 'Ticker', render: (l) => <span className="amber">{l.member.symbol}</span>, sort: (l) => l.member.symbol },
    { key: 'name', label: 'Name', render: (l) => l.member.name, sort: (l) => l.member.name, hideM: true },
    { key: 'sector', label: 'Sector', render: (l) => l.member.sector, sort: (l) => l.member.sector, hideN: true },
    { key: 'est', label: 'EPS est.', num: true, render: (l) => (ok(l.epsEst) ? fmtNum(l.epsEst, 2) : ''), sort: (l) => l.epsEst },
    { key: 'act', label: 'EPS', num: true, render: (l) => (ok(l.epsAct) ? fmtNum(l.epsAct, 2) : ''), sort: (l) => l.epsAct, cls: () => 'white' },
    { key: 'v', label: '', render: (l) => (l.verdict ? VERDICT[l.verdict] : ''), sort: (l) => l.verdict ?? '', cls: (l) => (l.verdict === 'beat' ? 'up' : l.verdict === 'miss' ? 'dn' : '') },
    { key: 'surp', label: 'Surprise', num: true, render: (l) => pct(l.surprise), sort: (l) => l.surprise, cls: (l) => dir(l.surprise) },
    { key: 'rsurp', label: 'Rev. surprise', num: true, render: (l) => pct(l.revSurprise), sort: (l) => l.revSurprise, cls: (l) => dir(l.revSurprise), hideM: true },
    { key: 'g', label: 'EPS YoY', num: true, render: (l) => (ok(l.growth) ? pct(l.growth) : ok(l.epsAct) && ok(l.epsYearAgo) ? 'NM' : ''), sort: (l) => l.growth, cls: (l) => dir(l.growth) },
  ];
  const comingColumns: Column<SeasonLine>[] = [
    { key: 'date', label: 'Reports', render: (l) => (l.report ? `${fmtIso(l.report.date)}${l.report.timing !== '--' ? ` ${l.report.timing}` : ''}` : 'Not in the calendar yet'), sort: (l) => l.report?.date ?? '9' },
    { key: 'sym', label: 'Ticker', render: (l) => <span className="amber">{l.member.symbol}</span>, sort: (l) => l.member.symbol },
    { key: 'name', label: 'Name', render: (l) => l.member.name, sort: (l) => l.member.name, hideM: true },
    { key: 'sector', label: 'Sector', render: (l) => l.member.sector, sort: (l) => l.member.sector, hideN: true },
    { key: 'est', label: 'EPS est.', num: true, render: (l) => (ok(l.epsEst) ? fmtNum(l.epsEst, 2) : ''), sort: (l) => l.epsEst },
    { key: 'ago', label: 'Year ago', num: true, render: (l) => (ok(l.report?.epsYearAgo) ? fmtNum(l.report!.epsYearAgo, 2) : ''), sort: (l) => l.report?.epsYearAgo ?? NaN, hideM: true },
  ];
  const csv = () => [
    ['Ticker', 'Name', 'Sector', 'Report date', 'EPS est', 'EPS', 'Verdict', 'Surprise %', 'Revenue est', 'Revenue', 'Revenue surprise %', 'EPS year ago', 'EPS YoY %'],
    ...lines.map((l) => [l.member.symbol, l.member.name, l.member.sector, l.report?.date ?? '', l.epsEst, l.epsAct, l.verdict ?? '', l.surprise, l.revEst, l.revAct, l.revSurprise, l.epsYearAgo, l.growth]),
  ];
  const status = !members?.length
    ? board?.state === 'error'
      ? board.message ?? 'The index list did not load.'
      : 'Loading the index members…'
    : cal.loading
      ? `Reading Nasdaq's earnings calendar: ${read} of ${cal.days} days`
      : cal.calendarProblems[0] ?? '';
  return (
    <div>
      <FnHeader
        code="EARNINGSSEASON"
        title="Earnings Season Results"
        sec={ix}
        sub={<><RealBadge /> Nasdaq earnings calendar{cal.revenueFrom.length ? `, revenue from ${cal.revenueFrom.join(' and ')}` : ''} · {board?.index.from ?? ''}</>}
        tabs={[
          { n: 1, label: `Reported (${st.reported})` },
          { n: 2, label: 'Sectors' },
          { n: 3, label: `To report (${st.toReport})` },
        ]}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `${ix.ticker.replace(/\W+/g, '_')}_EA_${season.label.replace(' ', '_')}.csv`, csv)}
        controls={
          <div className="chart-tools">
            <IndexPicker ix={ix} fn="EARNINGSSEASON" />
            <label className="fld">
              Season
              <select className="sel-inp" aria-label="Season" value={back} onChange={(e) => setBack(Number(e.target.value))}>
                {[0, 1, 2, 3].map((b) => (
                  <option key={b} value={b}>
                    {seasonOf(today, b).label}{b === 0 ? ' (this season)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <span className="muted">
              Reports {fmtIso(season.from)} to {fmtIso(season.to)}
            </span>
            {status && <span className="muted" role="status">{status}</span>}
          </div>
        }
      />
      {members?.length ? (
        <>
          <Section title={`${season.label} season, ${ix.id}`}>
            <KV
              items={[
                ['Members reported', `${st.reported} of ${st.members} (${share(st.reported, st.members)})`],
                ['EPS against the forecast', st.compared ? `${st.beat} beat (${share(st.beat, st.compared)}) · ${st.inline} in line · ${st.missed} missed (${share(st.missed, st.compared)})` : ''],
                ['Median EPS surprise', pct(st.medianSurprise)],
                ['Earnings against expected (EPS × shares)', pct(st.aggSurprise)],
                ['Revenue against the forecast', st.revCompared ? `${st.revBeat} of ${st.revCompared} above (${share(st.revBeat, st.revCompared)}) · median ${pct(st.medianRevSurprise)}` : cal.revenueFrom.length ? '' : 'Needs a Finnhub or FMP key (PROVIDERS)'],
                ['Earnings growth on the year (EPS × shares)', ok(st.aggGrowth) ? `${pct(st.aggGrowth)} (${st.growthCount} members with the year-ago quarter)` : ''],
                ['Still to report', `${st.toReport} (${st.dated} dated by ${fmtIso(to)})`],
              ]}
            />
          </Section>
          {tab === 1 && (
            <DataTable
              columns={columns}
              rows={reported}
              rowKey={(l) => l.member.symbol}
              defaultSort={{ key: 'date', dir: -1 }}
              onRowClick={(l) => openMember(panel, l.member, 'EARNINGS')}
              numbered={10}
              empty="No member has reported this season yet."
            />
          )}
          {tab === 2 && (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="num">Members</th>
                  <th className="num">Reported</th>
                  <th className="num">Beat</th>
                  <th className="num">Missed</th>
                  <th className="num">Median surprise</th>
                  <th className="num hide-m">Earnings vs expected</th>
                  <th className="num">Growth on the year</th>
                </tr>
              </thead>
              <tbody>
                {sectors.map(({ sector, stats: x }) => (
                  <tr key={sector}>
                    <td className="amber">{sector}</td>
                    <td className="num">{x.members}</td>
                    <td className="num">{x.reported}</td>
                    <td className="num up">{x.compared ? share(x.beat, x.compared) : ''}</td>
                    <td className="num dn">{x.compared ? share(x.missed, x.compared) : ''}</td>
                    <td className={`num ${dir(x.medianSurprise)}`}>{pct(x.medianSurprise)}</td>
                    <td className={`num hide-m ${dir(x.aggSurprise)}`}>{pct(x.aggSurprise)}</td>
                    <td className={`num ${dir(x.aggGrowth)}`}>{pct(x.aggGrowth)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === 3 && (
            <DataTable
              columns={comingColumns}
              rows={coming}
              rowKey={(l) => l.member.symbol}
              onRowClick={(l) => openMember(panel, l.member, 'EARNINGS')}
              numbered={10}
              empty="Every member has reported."
            />
          )}
          <div className="note">
            A member counts in the season when it reports between {fmtIso(season.from)} and {fmtIso(season.to)}. Beat, in line and missed compare EPS
            with Nasdaq&apos;s forecast to the cent. Earnings add up each member&apos;s EPS times its shares (market value over price), so a large company
            counts for more. Growth compares the year-ago quarter on the same basis; to or from a loss it is not meaningful (NM).
          </div>
        </>
      ) : (
        <div className="empty">{status}</div>
      )}
    </div>
  );
}
