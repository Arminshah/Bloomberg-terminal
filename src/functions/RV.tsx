import { useMemo } from 'react';
import { engine } from '../data/market';
import { usePeers } from '../data/live/peers';
import { FnHeader } from '../components/FnHeader';
import { QuoteStrip } from '../components/QuoteStrip';
import { DataTable, type Column } from '../components/DataTable';
import { Chg, LivePx, SecLink } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtNum } from '../core/format';
import { useTick } from '../data/market';
import { marketCapUsd, periodChange } from '../data/analytics';
import { financials, keyStats, peers } from '../data/fundamentals';
import { median } from '../finance/stats';
import type { SecurityDef } from '../data/types';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { useFundamentalsFor } from '../data/live/yfund';
import { desktopData } from '../data/live/yahoo';
import { SimBadge } from '../components/Source';

interface Row {
  d: SecurityDef;
  mcap: number;
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
        return { d, mcap: marketCapUsd(d.id), pe: k.pe, pb: k.pb, evEbitda: k.evEbitda, dy, roe: k.roe, margin: k.netMargin, ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y'), nm };
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
      if (Number.isFinite(v)) return pct ? <Chg v={v} pct dec={dec} /> : fmtNum(v, dec);
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
    { key: 'mcap', label: 'Mkt cap USD', num: true, render: (r) => fmtBig(r.mcap), sort: (r) => r.mcap },
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
  const stat = (f: (xs: number[]) => number, label: string) => (
    <tr className="group">
      <td colSpan={4}>{label}</td>
      {(['pe', 'pb', 'evEbitda', ...(rows.some((r) => Number.isFinite(r.dy)) ? ['dy'] : []), 'roe', 'margin', 'ytd', 'y1'] as (keyof Row)[]).map((k) => {
        const xs = rows.slice(1).map((r) => r[k] as number).filter(Number.isFinite);
        return (
          <td key={k} className="num">
            {xs.length ? fmtNum(f(xs), k === 'pb' || k === 'dy' ? 2 : 1) : ''}
          </td>
        );
      })}
    </tr>
  );
  const csv = () => [['Ticker', 'Name', 'Mkt cap USD', 'P/E', 'P/B', 'EV/EBITDA', 'Div yld 12M', 'ROE', 'Net margin', 'YTD %', '1Y %'], ...rows.map((r) => [r.d.ticker, r.d.name, Math.round(r.mcap), r.pe, r.pb, r.evEbitda, r.dy, r.roe, r.margin, r.ytd, r.y1].map((v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)))];
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
      <QuoteStrip sec={s} />
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        selected={s.id}
        columns={cols}
        summary={
          <>
            {stat((xs) => xs.reduce((a, b) => a + b, 0) / xs.length, 'Peer average (excl. subject)')}
            {stat(median, 'Peer median (excl. subject)')}
          </>
        }
      />
      <div className="note">
        {desktopData()
          ? `Peers: for a US-listed stock the companies Finviz lists as its peers, with ·similar the stocks Yahoo Finance links to it both ways; otherwise companies in ${s.name}'s own industry as Yahoo's company profiles name it (Finnhub's sub-industry with FINNHUB_API_KEY, the app's own stocks, Yahoo's similar stocks), largest first. NM: not meaningful (P/E on a loss, P/B and ROE on negative equity, EV/EBITDA on negative EBITDA). Averages and medians leave the loaded security and NM out. `
          : ''}
        Highlighted row is the loaded security. Click a ticker to open it; shift-click opens it in the next panel.
      </div>
    </div>
  );
}
