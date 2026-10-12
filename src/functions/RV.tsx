import { useMemo } from 'react';
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
  fpe: number;
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
  const group = useMemo(() => [s, ...peers(s, 12)], [s]);
  const { loaded, failed } = useFundamentalsFor(group);
  const rows: Row[] = useMemo(
    () =>
      group.map((d) => {
        const k = keyStats(d);
        return { d, mcap: marketCapUsd(d.id), pe: k.pe, fpe: k.fpe, pb: k.pb, evEbitda: k.evEbitda, dy: k.divYld, roe: k.roe, margin: k.netMargin, ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y') };
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
    { key: 't', label: 'Name', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink>, sort: (r) => r.d.ticker },
    { key: 'n', label: '', render: (r) => <span className="muted ellipsis" style={{ display: 'inline-block', maxWidth: 170 }}>{r.d.name}</span>, hideM: true },
    { key: 'px', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
    { key: 'mcap', label: 'Mkt cap USD', num: true, render: (r) => fmtBig(r.mcap), sort: (r) => r.mcap },
    num('pe', 'P/E'),
    num('fpe', 'P/E FY1'),
    num('pb', 'P/B', 2),
    num('evEbitda', 'EV/EBITDA'),
    num('dy', 'Div yld', 2),
    num('roe', 'ROE %'),
    num('margin', 'Net mgn %'),
    num('ytd', 'YTD %', 1, true),
    num('y1', '1Y %', 1, true),
  ];
  const stat = (f: (xs: number[]) => number, label: string) => (
    <tr className="group">
      <td colSpan={4}>{label}</td>
      {(['pe', 'fpe', 'pb', 'evEbitda', 'dy', 'roe', 'margin', 'ytd', 'y1'] as (keyof Row)[]).map((k) => (
        <td key={k} className="num">
          {fmtNum(f(rows.slice(1).map((r) => r[k] as number).filter(Number.isFinite)), k === 'pb' || k === 'dy' ? 2 : 1)}
        </td>
      ))}
    </tr>
  );
  const csv = () => [['Ticker', 'Name', 'Mkt cap USD', 'P/E', 'P/E FY1', 'P/B', 'EV/EBITDA', 'Div yld', 'ROE', 'Net margin', 'YTD %', '1Y %'], ...rows.map((r) => [r.d.ticker, r.d.name, Math.round(r.mcap), r.pe, r.fpe, r.pb, r.evEbitda, r.dy, r.roe, r.margin, r.ytd, r.y1].map((v) => (typeof v === 'number' ? Number(v.toFixed(3)) : v)))];
  return (
    <div>
      <FnHeader code="RV" title="Relative Valuation" sec={s} sub={
          <>
            Peers: {s.eq!.industry} ·{' '}
            {desktopData() ? (
              loaded + failed < group.length ? (
                `Loading real data, ${loaded} of ${group.length} companies…`
              ) : (
                <>
                  <span className="badge live">REAL</span> Yahoo Finance ratios
                  {failed ? (
                    <>
                      {' '}
                      for {loaded} of {group.length}; <SimBadge /> for the rest
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
      <div className="note">Highlighted row is the loaded security. Click a ticker to open it; shift-click opens it in the next panel.</div>
    </div>
  );
}
