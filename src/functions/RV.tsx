import { useMemo, type ReactNode } from 'react';
import { CapLink } from '../components/CapLink';
import { engine } from '../data/market';
import { usePeers } from '../data/live/peers';
import { FnHeader } from '../components/FnHeader';
import { DataTable, type Column } from '../components/DataTable';
import { Chg, LivePx, SecLink } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtNum } from '../core/format';
import { useTick } from '../data/market';
import { marketCapUsd, periodChange } from '../data/analytics';
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
  ytd: number;
  y1: number;
  /** Not meaningful: P/E on a loss, P/B and ROE on negative equity, EV/EBITDA on negative EBITDA. */
  nm: Set<keyof Row>;
}

const NM_WHY: Record<string, string> = {
  pe: 'Not meaningful: trailing 12-month EPS is a loss',
  pb: 'Not meaningful: shareholders’ equity is negative',
  roe: 'Not meaningful: shareholders’ equity is negative',
  evEbitda: 'Not meaningful: trailing 12-month EBITDA is negative',
};

/** An enterprise value's parts, in words: "Market value 100.00B + net debt 20.00B + preferred stock: none listed + minority interest 3.00B". */
export function evBuildUp(p: { mcap: number; netDebt: number; minority: number; preferred: number }, toUsd: number): string {
  const v = (x: number) => fmtBig(Math.abs(x) * toUsd);
  const debt = !Number.isFinite(p.netDebt) ? '+ net debt: none listed' : p.netDebt < 0 ? `− net cash ${v(p.netDebt)}` : `+ net debt ${v(p.netDebt)}`;
  const part = (label: string, x: number) => (Number.isFinite(x) ? `+ ${label} ${v(x)}` : `+ ${label}: none listed`);
  return [`Market value ${v(p.mcap)}`, debt, part('preferred stock', p.preferred), part('minority interest', p.minority)].join(' ');
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
        // A company that paid nothing in the last 12 months has no yield, not a yield of zero.
        const dy = Number.isFinite(k.divYld) && k.divYld > 0 ? k.divYld : NaN;
        const toUsd = engine.usdValue(k.ccy) * 1e6;
        return { d, mcap: marketCapUsd(d.id), ev: k.ev * toUsd, evWhy: evBuildUp(k.evParts, toUsd), pe: k.pe, pb: k.pb, evEbitda: k.evEbitda, dy, roe: k.roe, margin: k.netMargin, ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y'), nm };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, tick, loaded],
  );
  const num = (key: keyof Row, label: string, dec = 1, pct = false): Column<Row> => ({
    key,
    label,
    num: true,
    sort: (r) => r[key] as number,
    render: (r) => {
      const v = r[key] as number;
      // The exact figure rides on the cell, for a check against the rank row, which ranks exact figures.
      if (Number.isFinite(v)) return <span data-value={v}>{pct ? <Chg v={v} pct dec={dec} /> : fmtNum(v, dec)}</span>;
      if (r.nm.has(key)) return <span className="muted" title={NM_WHY[key as string]}>NM</span>;
      if (key === 'dy') return <span className="muted" title="No dividend paid in the last 12 months">none</span>;
      return '';
    },
  });
  const cols: Column<Row>[] = [
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
    { key: 'px', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
    { key: 'mcap', label: 'Mkt cap USD', num: true, render: (r) => <CapLink id={r.d.id}>{fmtBig(r.mcap)}</CapLink>, sort: (r) => r.mcap },
    { key: 'ev', label: 'EV USD', num: true, hideM: true, title: 'Enterprise value: market value, net debt, preferred stock and minority interest. Hover a value for its parts.', render: (r) => (Number.isFinite(r.ev) ? <span title={r.evWhy}>{fmtBig(r.ev)}</span> : ''), sort: (r) => r.ev },
    num('pe', 'P/E'),
    num('pb', 'P/B', 2),
    num('evEbitda', 'EV/EBITDA'),
    // Only when a company in the group paid a dividend.
    ...(rows.some((r) => Number.isFinite(r.dy)) ? [num('dy', 'Div yld 12M', 2)] : []),
    num('roe', 'ROE %'),
    num('margin', 'Net mgn %'),
    num('ytd', 'YTD %', 1, true),
    num('y1', '1Y %', 1, true),
  ];
  const metrics = ['pe', 'pb', 'evEbitda', ...(rows.some((r) => Number.isFinite(r.dy)) ? ['dy'] : []), 'roe', 'margin', 'ytd', 'y1'] as (keyof Row)[];
  // The loaded security's percentile rank on each figure among itself and its peers (NM and missing left out).
  const ranks = metrics.map((k) => {
    const xs = rows.map((r) => r[k] as number).filter(Number.isFinite);
    const v = rows[0]?.[k] as number;
    return { k, pr: percentRank(xs, v), below: xs.filter((x) => x < v).length, of: xs.length };
  });
  // The median, as the terminal's Median line, is of the loaded security and its peers; the average leaves it out.
  const stat = (f: (xs: number[]) => number, label: ReactNode, withSubject: boolean, testId?: string) => (
    <tr className="group" data-testid={testId}>
      <td colSpan={5}>{label}</td>
      {metrics.map((k) => {
        const xs = (withSubject ? rows : rows.slice(1)).map((r) => r[k] as number).filter(Number.isFinite);
        const v = xs.length ? f(xs) : NaN;
        return (
          <td key={k} className="num">
            {Number.isFinite(v) ? <span data-value={v}>{fmtNum(v, k === 'pb' || k === 'dy' ? 2 : 1)}</span> : ''}
          </td>
        );
      })}
    </tr>
  );
  const rankOf = (k: keyof Row) => {
    const r = ranks.find((x) => x.k === k);
    return r && Number.isFinite(r.pr) ? Math.round(r.pr * 100) : '';
  };
  const csv = () => [
    ['Ticker', 'Name', 'Mkt cap USD', 'EV USD', 'P/E', 'P/B', 'EV/EBITDA', 'Div yld 12M', 'ROE', 'Net margin', 'YTD %', '1Y %'],
    ...rows.map((r) => [r.d.ticker, r.d.name, Math.round(r.mcap), Number.isFinite(r.ev) ? Math.round(r.ev) : '', r.pe, r.pb, r.evEbitda, r.dy, r.roe, r.margin, r.ytd, r.y1].map((v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v))),
    [`${s.ticker} percentile among peers`, '', '', '', rankOf('pe'), rankOf('pb'), rankOf('evEbitda'), rankOf('dy'), rankOf('roe'), rankOf('margin'), rankOf('ytd'), rankOf('y1')],
  ];
  return (
    <div>
      <FnHeader code="PEERS" title="Relative Valuation" sec={s} sub={
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
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        selected={s.id}
        columns={cols}
        summary={
          <>
            {stat(median, <span title="The median of the loaded security and its peers on each figure, NM and missing figures left out; with an even count, the mean of the two middle figures">Median</span>, true, 'rv-median')}
            {stat((xs) => xs.reduce((a, b) => a + b, 0) / xs.length, 'Peer average (excl. subject)', false)}
            <tr className="group" data-testid="rv-rank">
              <td colSpan={5} title="Where the loaded security ranks among itself and its peers on each figure: 0 the lowest, 100 the highest (Excel's PERCENTRANK.INC)">
                {s.ticker} percentile among peers
              </td>
              {ranks.map((r) => (
                <td key={r.k} className="num" title={Number.isFinite(r.pr) ? `${r.below} of the ${r.of - 1} others are lower` : 'No figure for the loaded security, or no peer to compare'}>
                  {Number.isFinite(r.pr) ? fmtNum(r.pr * 100, 0) : ''}
                </td>
              ))}
            </tr>
          </>
        }
      />
      <div className="note">
        {desktopData()
          ? `Peers: for a US-listed stock the companies Finviz lists as its peers, with ·similar the stocks Yahoo Finance links to it both ways; otherwise companies in ${s.name}'s own industry as Yahoo's company profiles name it (Finnhub's sub-industry with FINNHUB_API_KEY, the app's own stocks, Yahoo's similar stocks), largest first. EV is market value plus net debt, preferred stock and minority interest from the latest balance sheet; a part the source does not list adds nothing, and an EV's parts show on hover. Banks have none. NM: not meaningful (P/E on a loss, P/B and ROE on negative equity, EV/EBITDA on negative EBITDA). The median includes the loaded security, as the terminal's Median line does; the average leaves it out; both leave NM and missing figures out. `
          : ''}
        Highlighted row is the loaded security; its percentile ranks it among itself and the peers with a figure, 0 the lowest and 100 the highest (Excel&apos;s PERCENTRANK.INC). Click a ticker to open it; shift-click opens it in the next panel.
      </div>
    </div>
  );
}
