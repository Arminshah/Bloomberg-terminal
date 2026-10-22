import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { DataTable } from '../components/DataTable';
import { Chg, LivePx, SecLink, openSecurity } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { fmtBig, fmtNum } from '../core/format';
import { engine, useTick } from '../data/market';
import { localBeta, marketCapUsd, periodChange } from '../data/analytics';
import { keyStats } from '../data/fundamentals';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';
import { desktopData } from '../data/live/yahoo';
import { SimBadge } from '../components/Source';

interface Criteria {
  region: string;
  sector: string;
  capMin: string;
  capMax: string;
  peMax: string;
  dyMin: string;
  ytdMin: string;
  betaMax: string;
  roeMin: string;
}

const EMPTY: Criteria = { region: 'All', sector: 'All', capMin: '', capMax: '', peMax: '', dyMin: '', ytdMin: '', betaMax: '', roeMin: '' };

const PRESETS: { name: string; c: Partial<Criteria> }[] = [
  { name: 'Mega caps', c: { capMin: '500' } },
  { name: 'Value', c: { peMax: '16', dyMin: '2' } },
  { name: 'Dividend', c: { dyMin: '3' } },
  { name: 'Momentum', c: { ytdMin: '25' } },
  { name: 'Low beta', c: { betaMax: '0.7' } },
  { name: 'Quality', c: { roeMin: '25' } },
];

export function EQS(_: FnProps) {
  const panel = usePanelId();
  const tick = useTick(10);
  const [c, setC] = useState<Criteria>(EMPTY);
  const sectors = useMemo(() => ['All', ...new Set(engine.securities.filter((d) => d.eq).map((d) => d.eq!.sector))].sort(), []);
  const rows = useMemo(() => {
    const n = (s: string) => (s.trim() === '' ? NaN : Number(s));
    return engine.securities
      .filter((d) => d.cls === 'equity')
      .map((d) => {
        const k = keyStats(d);
        // Beta worked out the same way for every row (BETA's default), not one provider's figure for some of them.
        const beta = engine.realOnly ? localBeta(d.id) : d.eq!.beta;
        return { d, k, beta, cap: marketCapUsd(d.id) / 1e9, ytd: periodChange(d.id, 'YTD'), y1: periodChange(d.id, '1Y') };
      })
      .filter(({ d, k, beta, cap, ytd }) => {
        if (c.region !== 'All' && d.region !== c.region) return false;
        if (c.sector !== 'All' && d.eq!.sector !== c.sector) return false;
        if (Number.isFinite(n(c.capMin)) && !(cap >= n(c.capMin))) return false;
        if (Number.isFinite(n(c.capMax)) && !(cap <= n(c.capMax))) return false;
        if (Number.isFinite(n(c.peMax)) && !(k.pe > 0 && k.pe <= n(c.peMax))) return false;
        if (Number.isFinite(n(c.dyMin)) && !(k.divYld >= n(c.dyMin))) return false;
        if (Number.isFinite(n(c.ytdMin)) && !(ytd >= n(c.ytdMin))) return false;
        if (Number.isFinite(n(c.betaMax)) && !(beta <= n(c.betaMax))) return false;
        if (Number.isFinite(n(c.roeMin)) && !(k.roe >= n(c.roeMin))) return false;
        return true;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, tick]);
  const field = (key: keyof Criteria, label: string, ph: string) => (
    <label className="fld" htmlFor={`eqs-${key}-${panel}`}>
      {label}
      <input id={`eqs-${key}-${panel}`} className="inp" style={{ width: 70 }} inputMode="decimal" placeholder={ph} value={c[key]} onChange={(e) => setC({ ...c, [key]: e.target.value })} />
    </label>
  );
  const csv = () => [['Ticker', 'Name', 'Region', 'Sector', 'Mkt cap USD bn', 'P/E', 'Div yld 12M', 'ROE', 'Beta', 'YTD %', '1Y %'], ...rows.map((r) => [r.d.ticker, r.d.name, r.d.region, r.d.eq!.sector, r.cap.toFixed(1), r.k.pe.toFixed(2), r.k.divYld.toFixed(2), r.k.roe.toFixed(1), r.beta.toFixed(2), r.ytd.toFixed(2), r.y1.toFixed(2)])];
  return (
    <div>
      <FnHeader code="SCREEN" title="Equity Screening" sub={
          <>
            {rows.length} matches ·{' '}
            {desktopData() ? (
              <>
                <span className="badge live">REAL</span> prices, market cap, P/E and yield · ROE from trailing EPS over book value per share (the statements once a company is opened) · beta adjusted, two years of weekly returns against the local index, as BETA works it out
              </>
            ) : (
              <>
                <SimBadge /> ratios; real data needs the desktop app
              </>
            )}
          </>
        } actions={exportActions(panel, 'EQS_results.csv', csv)} />
      <div className="chart-tools" style={{ gap: '6px 14px' }}>
        <label className="fld" htmlFor={`eqs-region-${panel}`}>
          Region
          <select id={`eqs-region-${panel}`} className="sel-inp" value={c.region} onChange={(e) => setC({ ...c, region: e.target.value })}>
            {['All', 'Americas', 'EMEA', 'APAC'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="fld" htmlFor={`eqs-sector-${panel}`}>
          Sector
          <select id={`eqs-sector-${panel}`} className="sel-inp" value={c.sector} onChange={(e) => setC({ ...c, sector: e.target.value })}>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {field('capMin', 'Cap ≥ $bn', '0')}
        {field('capMax', 'Cap ≤ $bn', '∞')}
        {field('peMax', 'P/E ≤', '')}
        {field('dyMin', 'Yield ≥ %', '')}
        {field('roeMin', 'ROE ≥ %', '')}
        {field('ytdMin', 'YTD ≥ %', '')}
        {field('betaMax', 'Beta ≤', '')}
        <button type="button" className="btn" onClick={() => setC(EMPTY)}>
          Reset
        </button>
      </div>
      <div className="chart-tools">
        <span className="amber">Preset screens</span>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="chip-btn" onClick={() => setC({ ...EMPTY, ...p.c })}>
            {p.name}
          </button>
        ))}
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.d.id}
        numbered
        onRowClick={(r, e) => openSecurity(panel, r.d.id, e)}
        defaultSort={{ key: 'cap', dir: -1 }}
        empty="No securities match. Loosen a criterion."
        columns={[
          { key: 't', label: 'Ticker', render: (r) => <SecLink id={r.d.id}>{r.d.ticker}</SecLink>, sort: (r) => r.d.ticker },
          { key: 'n', label: 'Name', render: (r) => <span className="ellipsis" style={{ display: 'inline-block', maxWidth: 200 }}>{r.d.name}</span>, sort: (r) => r.d.name, hideM: true },
          { key: 's', label: 'Sector', render: (r) => <span className="muted">{r.d.eq!.sector}</span>, sort: (r) => r.d.eq!.sector, hideM: true },
          { key: 'px', label: 'Last', num: true, render: (r) => <LivePx id={r.d.id} /> },
          { key: 'cap', label: 'Mkt cap', num: true, render: (r) => fmtBig(r.cap * 1e9), sort: (r) => r.cap },
          { key: 'pe', label: 'P/E', num: true, render: (r) => fmtNum(r.k.pe, 1), sort: (r) => r.k.pe },
          { key: 'dy', label: '12M yld %', num: true, render: (r) => fmtNum(r.k.divYld, 2), sort: (r) => r.k.divYld },
          { key: 'roe', label: 'ROE %', num: true, render: (r) => fmtNum(r.k.roe, 1), sort: (r) => r.k.roe, hideM: true },
          { key: 'b', label: 'Beta', num: true, render: (r) => fmtNum(r.beta, 2), sort: (r) => r.beta, hideM: true },
          { key: 'ytd', label: 'YTD %', num: true, render: (r) => <Chg v={r.ytd} pct dec={1} />, sort: (r) => r.ytd },
          { key: 'y1', label: '1Y %', num: true, render: (r) => <Chg v={r.y1} pct dec={1} />, sort: (r) => r.y1 },
        ]}
      />
    </div>
  );
}
