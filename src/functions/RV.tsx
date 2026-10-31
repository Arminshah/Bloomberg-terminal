import { useMemo, useState, type ReactNode } from 'react';
import { CapLink } from '../components/CapLink';
import { engine } from '../data/market';
import { usePeers } from '../data/live/peers';
import { FnHeader } from '../components/FnHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Chg, LivePx, SecLink } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtNum } from '../core/format';
import { useTick } from '../data/market';
import { closeAt, horizonStart, marketCapUsd, periodChange } from '../data/analytics';
import { DAY_MS } from '../data/calendar';
import type { Series } from '../data/series';
import { financials, keyStats, peers } from '../data/fundamentals';
import { median, percentRank } from '../finance/stats';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { useFundamentalsFor } from '../data/live/yfund';
import { desktopData } from '../data/live/yahoo';
import { SimBadge } from '../components/Source';

interface Row {
  d: SecurityDef;
  mcap: number;
  /** Enterprise value, USD, and how it is made up. */
  ev: number;
  evWhy: string;
  pe: number;
  pb: number;
  evEbitda: number;
  dy: number;
  roe: number;
  margin: number;
  d1: number;
  m1: number;
  ytd: number;
  y1: number;
  /** The latest fiscal year's revenue and diluted EPS on the year before's, %. */
  revG: number;
  epsG: number;
  gm: number;
  opm: number;
  ebitdaM: number;
  roa: number;
  /** Tax over pretax income, last 12 months, %. */
  tax: number;
  /** Revenue per employee, thousands of US dollars. */
  revEmp: number;
  /** Cash and total debt, latest balance sheet, USD. */
  cash: number;
  debt: number;
  netDebtEbitda: number;
  de: number;
  curRatio: number;
  /** Not meaningful: P/E on a loss, P/B and ROE on negative equity, EV/EBITDA on negative EBITDA. */
  nm: Set<keyof Row>;
}

const NM_WHY: Record<string, string> = {
  pe: 'Not meaningful: trailing 12-month EPS is a loss',
  pb: 'Not meaningful: shareholders’ equity is negative',
  roe: 'Not meaningful: shareholders’ equity is negative',
  evEbitda: 'Not meaningful: trailing 12-month EBITDA is negative',
  tax: 'Not meaningful: pretax income is a loss',
  netDebtEbitda: 'Not meaningful: trailing 12-month EBITDA is negative',
  de: 'Not meaningful: shareholders’ equity is negative',
};

/**
 * RV's pages under the terminal's names: Overview with its columns in its order, Comp Sheets' Equity Valuation,
 * Profitability and Balance Sheet, and Markets. The provider's CDS Spreads, Op Stats, ESG, EPS Preview, Ownership,
 * Credit and Custom sheets need data the free sources do not give for every peer, and are not offered.
 */
const PAGES = [
  { n: 1, label: 'Overview' },
  { n: 2, label: 'Comp Sheets' },
  { n: 3, label: 'Markets' },
];
const SHEETS = [
  { n: 1, label: 'Equity Valuation' },
  { n: 2, label: 'Profitability' },
  { n: 3, label: 'Balance Sheet' },
];

/** An enterprise value's parts, in words: "Market value 100.00B + net debt 20.00B + preferred stock: none listed + minority interest 3.00B". */
export function evBuildUp(p: { mcap: number; netDebt: number; minority: number; preferred: number }, toUsd: number): string {
  const v = (x: number) => fmtBig(Math.abs(x) * toUsd);
  const debt = !Number.isFinite(p.netDebt) ? '+ net debt: none listed' : p.netDebt < 0 ? `− net cash ${v(p.netDebt)}` : `+ net debt ${v(p.netDebt)}`;
  const part = (label: string, x: number) => (Number.isFinite(x) ? `+ ${label} ${v(x)}` : `+ ${label}: none listed`);
  return [`Market value ${v(p.mcap)}`, debt, part('preferred stock', p.preferred), part('minority interest', p.minority)].join(' ');
}

/**
 * RV's "Chg Pct 1M": the last price on the close on or before the same date a calendar month before today (a public RV
 * capture of 17 March 2023 counts from 17 February), not a month before the latest session.
 */
export function monthChange(s: Series, last: number, today: number): number {
  const base = s.length ? closeAt(s, horizonStart('1M', today)) : NaN;
  return Number.isFinite(base) && base > 0 && Number.isFinite(last) ? (last / base - 1) * 100 : NaN;
}

/** One line of RV's comp range: the subject's figure, the low and high among it and its peers, and their median. */
export function compRange(values: number[], subject: number): { low: number; high: number; median: number; subject: number } | null {
  const xs = values.filter(Number.isFinite);
  if (!xs.length) return null;
  return { low: Math.min(...xs), high: Math.max(...xs), median: median(xs), subject };
}

/**
 * RV's comp range panel: for each figure the low and high among the loaded security and its peers, a line between
 * them with a dot at the security and a diamond at the median. The captures' current-year P/E and EV to estimated
 * EBITDA need every peer's estimates, which the free sources do not give, so the reported figures stand in, named so.
 */
function CompRange({ rows, ticker }: { rows: Row[]; ticker: string }) {
  const lines: { label: string; key: keyof Row; pct: boolean }[] = [
    { label: 'P/E', key: 'pe', pct: false },
    { label: 'EV/EBITDA', key: 'evEbitda', pct: false },
    { label: 'Revenue Growth', key: 'revG', pct: true },
    { label: 'EBITDA Margin', key: 'ebitdaM', pct: true },
    { label: 'ROE', key: 'roe', pct: true },
  ];
  const f = (v: number, pct: boolean) => (Number.isFinite(v) ? `${fmtNum(v, 2)}${pct ? '%' : ''}` : '--');
  const W = 140;
  return (
    <table className="tbl rv-range" data-testid="rv-range">
      <thead>
        <tr>
          <th>Metric</th>
          <th className="num">{ticker}</th>
          <th className="num">Low</th>
          <th>Comp Range</th>
          <th className="num">High</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const r = compRange(rows.map((x) => x[l.key] as number), rows[0]?.[l.key] as number);
          const at = (v: number) => (r && r.high > r.low ? 4 + ((v - r.low) / (r.high - r.low)) * (W - 8) : W / 2);
          return (
            <tr key={l.key} data-key={l.key}>
              <td className="amber">{l.label}</td>
              <td className="num cyan">{f(r?.subject ?? NaN, l.pct)}</td>
              <td className="num amber">{f(r?.low ?? NaN, l.pct)}</td>
              <td>
                {r ? (
                  <svg width={W} height={12} aria-label={`${l.label}: low ${f(r.low, l.pct)}, median ${f(r.median, l.pct)}, high ${f(r.high, l.pct)}`}>
                    <line x1={4} x2={W - 4} y1={6} y2={6} stroke="#8f8f8f" strokeWidth={1} />
                    <path d={`M ${at(r.median)} 2 L ${at(r.median) + 4} 6 L ${at(r.median)} 10 L ${at(r.median) - 4} 6 Z`} fill="#ff9e1b" />
                    {Number.isFinite(r.subject) ? <circle cx={at(r.subject)} cy={6} r={3.5} fill="#45d3e6" /> : null}
                  </svg>
                ) : null}
              </td>
              <td className="num amber">{f(r?.high ?? NaN, l.pct)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={5} className="muted">
            <span className="cyan">●</span> {ticker} <span style={{ color: '#ff9e1b' }}>◆</span> Median · low and high include {ticker}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function RV({ sec }: FnProps) {
  const s = sec!;
  const panel = usePanelId();
  const tick = useTick(5);
  // The desktop app finds real peers (Finnhub, Yahoo); the browser build takes the built-in list's industry.
  const found = usePeers(desktopData() ? s : undefined);
  const ids = found?.ids.join(',') ?? '';
  const group = useMemo(
    () => (desktopData() ? [s, ...(found?.ids ?? []).map((id) => engine.get(id)).filter((d): d is SecurityDef => !!d && d.id !== s.id)] : [s, ...peers(s, 12)]),
    [s, ids], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const basis = new Map((found?.group?.picks ?? []).map((p) => [p.symbol.replace('-', '/'), p.basis]));
  const { loaded, failed } = useFundamentalsFor(group);
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState(1);
  const rows: Row[] = useMemo(
    () =>
      group.map((d) => {
        const k = keyStats(d);
        const ltm = financials(d).ltm;
        const nm = new Set<keyof Row>();
        if (!Number.isFinite(k.pe) && Number.isFinite(k.epsLtm) && k.epsLtm <= 0) nm.add('pe');
        if (!Number.isFinite(k.pb) && Number.isFinite(ltm?.equity) && ltm.equity <= 0) nm.add('pb');
        if (!Number.isFinite(k.roe) && Number.isFinite(ltm?.equity) && ltm.equity <= 0) nm.add('roe');
        if (!Number.isFinite(k.evEbitda) && Number.isFinite(ltm?.ebitda) && ltm.ebitda <= 0) nm.add('evEbitda');
        if (Number.isFinite(ltm?.tax) && ltm.pretax <= 0) nm.add('tax');
        if (Number.isFinite(ltm?.debt) && ltm.ebitda <= 0) nm.add('netDebtEbitda');
        if (!Number.isFinite(k.de) && Number.isFinite(ltm?.debt) && ltm.equity <= 0) nm.add('de');
        // A company that paid nothing in the last 12 months has no yield, not a yield of zero.
        const dy = Number.isFinite(k.divYld) && k.divYld > 0 ? k.divYld : NaN;
        const usd = engine.usdValue(k.ccy);
        const toUsd = usd * 1e6;
        const emp = d.eq?.emp ?? NaN;
        return {
          d, mcap: marketCapUsd(d.id), ev: k.ev * toUsd, evWhy: evBuildUp(k.evParts, toUsd), pe: k.pe, pb: k.pb, evEbitda: k.evEbitda, dy, roe: k.roe, margin: k.netMargin,
          d1: periodChange(d.id, '1D'), m1: monthChange(engine.daily(d.id), engine.quote(d.id)?.last ?? NaN, engine.today * DAY_MS), ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y'),
          revG: k.revGrowth, epsG: k.epsGrowth, gm: k.grossMargin, opm: k.opMargin,
          ebitdaM: ltm.rev > 0 ? (ltm.ebitda / ltm.rev) * 100 : NaN, roa: k.roa,
          tax: ltm.pretax > 0 ? (ltm.tax / ltm.pretax) * 100 : NaN,
          revEmp: emp > 0 ? (ltm.rev * toUsd) / emp / 1e3 : NaN,
          cash: ltm.cash * toUsd, debt: ltm.debt * toUsd,
          netDebtEbitda: ltm.ebitda > 0 ? (ltm.debt - (Number.isFinite(ltm.cash) ? ltm.cash : 0)) / ltm.ebitda : NaN,
          de: k.de, curRatio: ltm.curLiab > 0 ? ltm.curAssets / ltm.curLiab : NaN, nm,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, tick, loaded],
  );
  /** A figure column; `pct` adds a % sign, `chg` colours it as a change. Two decimals, as RV writes its figures. */
  const num = (key: keyof Row, label: string, opts: { dec?: number; pct?: boolean; chg?: boolean; title?: string; money?: boolean } = {}): Column<Row> => ({
    key,
    label,
    num: true,
    title: opts.title,
    sort: (r) => r[key] as number,
    render: (r) => {
      const v = r[key] as number;
      const dec = opts.dec ?? 2;
      // The exact figure rides on the cell, for a check against the summary lines, which work on exact figures.
      if (Number.isFinite(v)) return <span data-value={v}>{opts.chg ? <Chg v={v} pct dec={dec} /> : opts.money ? fmtBig(v) : `${fmtNum(v, dec)}${opts.pct ? '%' : ''}`}</span>;
      if (r.nm.has(key)) return <span className="muted" title={NM_WHY[key as string]}>NM</span>;
      if (key === 'dy') return <span className="muted" title="No dividend paid in the last 12 months">none</span>;
      return <span className="muted">--</span>;
    },
  });
  const name: Column<Row>[] = [
    {
      key: 't',
      label: 'Name',
      render: (r) => {
        const b = basis.get(r.d.ticker.split(' ')[0]);
        return (
          <>
            <SecLink id={r.d.id}>{r.d.ticker}</SecLink>
            {b === 'similar' ? <span className="muted" title="A stock Yahoo Finance links to this one both ways (its similar stocks and theirs)"> ·similar</span> : b === 'sub-industry' ? <span className="muted" title="Finnhub puts it in the same sub-industry"> ·sub-ind</span> : null}
          </>
        );
      },
      sort: (r) => r.d.ticker,
    },
    { key: 'n', label: '', render: (r) => <span className="muted ellipsis" style={{ display: 'inline-block', maxWidth: 170 }}>{r.d.name}</span>, hideM: true },
  ];
  const mcap: Column<Row> = { key: 'mcap', label: 'Mkt Cap USD', num: true, render: (r) => <CapLink id={r.d.id}>{fmtBig(r.mcap)}</CapLink>, sort: (r) => r.mcap };
  const last: Column<Row> = { key: 'px', label: 'Last Px', num: true, render: (r) => <LivePx id={r.d.id} /> };
  const ev: Column<Row> = { key: 'ev', label: 'EV USD', num: true, title: 'Enterprise value: market value, net debt, preferred stock and minority interest. Hover a value for its parts.', render: (r) => (Number.isFinite(r.ev) ? <span data-value={r.ev} title={r.evWhy}>{fmtBig(r.ev)}</span> : <span className="muted">--</span>), sort: (r) => r.ev };
  const dyCol = num('dy', 'Dvd 12M Yld', { pct: true });
  // Each page's columns after the name, in RV's order where its captures show one, and the column it sorts on first.
  const layout: { cols: Column<Row>[]; sort: keyof Row } =
    page === 1
      ? { cols: [mcap, last, num('d1', 'Chg Pct 1D', { chg: true }), num('m1', 'Chg Pct 1M', { chg: true }), num('revG', 'Rev - 1 Yr Gr:Y', { pct: true, title: "The latest fiscal year's revenue on the year before's" }), num('epsG', 'EPS - 1 Yr Gr:Y', { pct: true, title: "The latest fiscal year's diluted EPS on the year before's; none from a loss" }), num('pe', 'P/E'), num('roe', 'ROE', { pct: true }), dyCol], sort: 'roe' }
      : page === 3
        ? { cols: [last, num('d1', 'Chg Pct 1D', { chg: true }), num('m1', 'Chg Pct 1M', { chg: true }), num('ytd', 'Chg Pct YTD', { chg: true }), num('y1', 'Chg Pct 1Y', { chg: true })], sort: 'd1' }
        : sheet === 2
          ? { cols: [num('revG', 'Revenue Growth', { pct: true, title: "The latest fiscal year's revenue on the year before's" }), num('gm', 'Gross Margin', { pct: true }), num('opm', 'Op Margin', { pct: true }), num('ebitdaM', 'EBITDA Margin TTM', { pct: true }), num('margin', 'Net Profit Margin TTM', { pct: true }), num('roa', 'Return On Assets', { pct: true }), num('roe', 'Return On Equity', { pct: true }), num('tax', 'Eff Tax Rate', { pct: true }), num('revEmp', 'Revenue/Employee USD', { title: 'Revenue over the last 12 months per employee, in thousands of US dollars' })], sort: 'gm' }
          : sheet === 3
            ? { cols: [num('cash', 'Cash USD', { money: true }), num('debt', 'Total Debt USD', { money: true }), num('netDebtEbitda', 'Net Debt/EBITDA'), num('de', 'Total Debt/Equity', { pct: true }), num('curRatio', 'Current Ratio')], sort: 'de' }
            : { cols: [mcap, ev, num('pe', 'P/E'), num('pb', 'P/B'), num('evEbitda', 'EV/EBITDA'), dyCol], sort: 'pe' };
  const cols: Column<Row>[] = [...name, ...layout.cols];
  // Figures the summary lines work on: every column with a number, except the prices, which are in each line's own currency.
  const metrics = layout.cols.filter((c) => c.key !== 'px').map((c) => (c.key === 'mcap' ? 'mcap' : c.key) as keyof Row);
  // The loaded security's percentile rank on each figure among itself and its peers (NM and missing left out).
  const ranks = new Map(
    metrics.map((k) => {
      const xs = rows.map((r) => r[k] as number).filter(Number.isFinite);
      const v = rows[0]?.[k] as number;
      return [k, { pr: percentRank(xs, v), below: xs.filter((x) => x < v).length, of: xs.length }] as const;
    }),
  );
  // One cell for each column, so a summary figure sits under its column; the name cells hold the line's label.
  const summaryCells = (cell: (k: keyof Row) => ReactNode) =>
    layout.cols.map((c) => (metrics.includes(c.key as keyof Row) ? <td key={c.key} className="num" data-key={c.key}>{cell(c.key as keyof Row)}</td> : <td key={c.key} />));
  // The median, as the terminal's Median line, is of the loaded security and its peers; the average leaves it out.
  const stat = (f: (xs: number[]) => number, label: ReactNode, withSubject: boolean, testId?: string) => (
    <tr className="group" data-testid={testId}>
      <td />
      <td>{label}</td>
      <td className="hide-m" />
      {summaryCells((k) => {
        const xs = (withSubject ? rows : rows.slice(1)).map((r) => r[k] as number).filter(Number.isFinite);
        const v = xs.length ? f(xs) : NaN;
        return Number.isFinite(v) ? <span data-value={v}>{k === 'mcap' || k === 'ev' || k === 'cash' || k === 'debt' ? fmtBig(v) : fmtNum(v, 2)}</span> : '';
      })}
    </tr>
  );
  const rankOf = (k: keyof Row) => {
    const r = ranks.get(k);
    return r && Number.isFinite(r.pr) ? Math.round(r.pr * 100) : '';
  };
  const all: (keyof Row)[] = ['pe', 'pb', 'evEbitda', 'dy', 'roe', 'margin', 'd1', 'm1', 'ytd', 'y1', 'revG', 'epsG', 'gm', 'opm', 'ebitdaM', 'roa', 'tax', 'revEmp', 'netDebtEbitda', 'de', 'curRatio'];
  const csv = () => [
    ['Ticker', 'Name', 'Mkt cap USD', 'EV USD', 'Cash USD', 'Total debt USD', ...all],
    ...rows.map((r) => [r.d.ticker, r.d.name, Math.round(r.mcap), Number.isFinite(r.ev) ? Math.round(r.ev) : '', Number.isFinite(r.cash) ? Math.round(r.cash) : '', Number.isFinite(r.debt) ? Math.round(r.debt) : '', ...all.map((k) => r[k] as number)].map((v) => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toFixed(3)) : '') : v))),
  ];
  return (
    <div>
      <FnHeader code="PEERS" title="Relative Valuation" sec={s} tabs={PAGES} tab={page} onTab={setPage} sub={
          <>
            {desktopData() ? (
              found?.group ? (
                <>
                  {found.group.picks.length} peers in {found.group.industry || found.group.sector} ({found.group.sources.join(', ') || 'no source answered'}){found.state === 'loading' ? ', loading their data' : ''} ·{' '}
                </>
              ) : found?.state === 'error' ? (
                <>No peers: {found.message} · </>
              ) : (
                <>Finding peers… · </>
              )
            ) : (
              <>Peers from the built-in list: {s.eq!.industry}, then {s.eq!.sector} · </>
            )}
            {desktopData() ? (
              loaded + failed < group.length ? (
                `Loading real data, ${loaded} of ${group.length} companies…`
              ) : (
                <>
                  <span className="badge live">REAL</span> Yahoo Finance ratios
                  {failed ? (
                    <>
                      {' '}
                      for {loaded} of {group.length}; no company data from the source for the rest (their P/E and P/B are the quote's)
                    </>
                  ) : null}
                </>
              )
            ) : (
              <>
                <SimBadge /> ratios from generated statements; real data needs the desktop app
              </>
            )}
          </>
        } actions={exportActions(panel, `${s.ticker.replace(/\W+/g, '_')}_RV.csv`, csv)} />
      {page === 1 && <CompRange rows={rows} ticker={s.ticker.split(' ')[0]} />}
      {page === 2 && (
        <div className="row rv-sheets" style={{ gap: 3, padding: '3px 6px' }}>
          {SHEETS.map((t) => (
            <button key={t.n} type="button" className={`chip-btn${t.n === sheet ? ' on' : ''}`} aria-pressed={t.n === sheet} onClick={() => setSheet(t.n)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <DataTable
        // Each page sorts on its own column first, as RV's Overview sorts on ROE.
        key={`${page}:${sheet}`}
        rows={rows}
        rowKey={(r) => r.d.id}
        selected={s.id}
        columns={cols}
        defaultSort={{ key: layout.sort, dir: -1 }}
        // The loaded security stays first as 100), its peers numbered from 101) in the sorted order, as on RV.
        pinFirst
        numbered={101}
        summary={
          <>
            {stat(median, <span title="The median of the loaded security and its peers on each figure, NM and missing figures left out; with an even count, the mean of the two middle figures">Median</span>, true, 'rv-median')}
            {stat((xs) => xs.reduce((a, b) => a + b, 0) / xs.length, 'Peer average (excl. subject)', false)}
            <tr className="group" data-testid="rv-rank">
              <td />
              <td title="Where the loaded security ranks among itself and its peers on each figure: 0 the lowest, 100 the highest (Excel's PERCENTRANK.INC)">{s.ticker} percentile among peers</td>
              <td className="hide-m" />
              {summaryCells((k) => {
                const r = ranks.get(k)!;
                return <span title={Number.isFinite(r.pr) ? `${r.below} of the ${r.of - 1} others are lower` : 'No figure for the loaded security, or no peer to compare'}>{rankOf(k)}</span>;
              })}
            </tr>
          </>
        }
      />
      <div className="note">
        {desktopData()
          ? `Peers: for a US-listed stock the companies Finviz lists as its peers, with ·similar the stocks Yahoo Finance links to it both ways; otherwise companies in ${s.name}'s own industry as Yahoo's company profiles name it (Finnhub's sub-industry with FINNHUB_API_KEY, the app's own stocks, Yahoo's similar stocks), largest first. EV is market value plus net debt, preferred stock and minority interest from the latest balance sheet; a part the source does not list adds nothing, and an EV's parts show on hover. Banks have none. Growth is the latest fiscal year's on the year before's; margins, returns and the tax rate are over the last 12 months; market values, cash and debt are in US dollars at today's rates. NM: not meaningful (P/E on a loss, P/B, ROE and debt to equity on negative equity, EV/EBITDA and net debt to EBITDA on negative EBITDA, the tax rate on a pretax loss). The median includes the loaded security, as the terminal's Median line does; the average leaves it out; both leave NM and missing figures out. `
          : ''}
        The loaded security is pinned as 100); its percentile ranks it among itself and the peers with a figure, 0 the lowest and 100 the highest (Excel&apos;s PERCENTRANK.INC). Click a ticker to open it; shift-click opens it in the next panel.
      </div>
    </div>
  );
}
