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
import { keyStats, peers } from '../data/fundamentals';
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
        return { d, mcap: marketCapUsd(d.id), pe: k.pe, pb: k.pb, evEbitda: k.evEbitda, dy: k.divYld, roe: k.roe, margin: k.netMargin, ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y') };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, tick, loaded],
  );
  const num = (key: keyof Row, label: string, dec = 1, pct = false): Column<Row> => ({
    key,
    label,
    num: true,
    sort: (r) => r[key] as number,
    render: (r) => (pct ? <Chg v={r[key] as number} pct dec={dec} /> : fmtNum(r[key] as number, dec)),
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
            {b === 'similar' ? <span className="muted" title="Another industry: a stock Yahoo Finance links to this one repeatedly, used because few companies share its industry"> ·similar</span> : b === 'sub-industry' ? <span className="muted" title="Finnhub puts it in the same sub-industry"> ·sub-ind</span> : null}
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
    num('dy', 'Div yld 12M', 2),
    num('roe', 'ROE %'),
    num('margin', 'Net mgn %'),
    num('ytd', 'YTD %', 1, true),
    num('y1', '1Y %', 1, true),
  ];
  const stat = (f: (xs: number[]) => number, label: string) => (
    <tr className="group">
      <td colSpan={4}>{label}</td>
      {(['pe', 'pb', 'evEbitda', 'dy', 'roe', 'margin', 'ytd', 'y1'] as (keyof Row)[]).map((k) => (
        <td key={k} className="num">
          {fmtNum(f(rows.slice(1).map((r) => r[k] as number).filter(Number.isFinite)), k === 'pb' || k === 'dy' ? 2 : 1)}
        </td>
      ))}
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
        footer={
          <>
            {stat(median, 'Peer median (excl. subject)')}
            {stat((xs) => xs.reduce((a, b) => a + b, 0) / xs.length, 'Peer average')}
          </>
        }
      />
      <div className="note">
        {desktopData()
          ? `Peers: companies in ${s.name}'s own industry as Yahoo Finance's company profiles name it, from Finnhub's sub-industry (with FINNHUB_API_KEY), the app's own stocks and the stocks Yahoo finds similar, largest first. When fewer than four share the industry, ·similar marks stocks Yahoo links to it repeatedly. `
          : ''}
        Highlighted row is the loaded security. Click a ticker to open it; shift-click opens it in the next panel.
      </div>
    </div>
  );
}
