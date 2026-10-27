import { useState, type ReactNode } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, HBar, LivePx, SecLink, openSecurity } from '../components/cells';
import { exportActions } from '../components/ExportActions';
import { RowNo } from '../components/Numbered';
import { fmtDay, fmtPct } from '../core/format';
import { horizonStart, periodChange, type Horizon } from '../data/analytics';
import { engine, useHistoryVersion, useTick } from '../data/market';
import { inCurrency, MAP_TILES, ranked, WORLD_CURRENCIES, WORLD_PERIODS } from '../data/world-indices';
import { useNumberedRows, usePanelId } from '../terminal/panel';
import { heatColour } from '../terminal/palette';
import type { FnProps } from '../terminal/types';
import { ccyVsUsd } from './FXMON';
import { INDEX_GROUPS, indexShortName } from './WEI';

/**
 * WEIS, World Equity Index Rankings, and WM, World Equity Markets Map (both named in the provider's 2020 Quick Start,
 * without a description of their screens). WEIS ranks the indices MARKET shows by their price return over a period;
 * WM draws one main index per market on a grid laid out like the world, coloured by that return. Both can show the
 * return in each index's own currency or turned into one currency.
 */

type Ccy = (typeof WORLD_CURRENCIES)[number];
const REGION_NAME: Record<string, string> = { Americas: 'Americas', EMEA: 'Europe, Middle East & Africa', 'Asia/Pacific': 'Asia-Pacific' };

/** A currency's change against the dollar over a period, in percent (0 for the dollar). */
const vsUsd = (code: string, h: Horizon) => (code === 'USD' ? 0 : ccyVsUsd(code === 'GBp' ? 'GBP' : code, h).pct);

/** An index's price return over a period, in its own currency or turned into another. */
export function indexReturn(id: string, h: Horizon, ccy: Ccy): number {
  const d = engine.get(id);
  if (!d) return NaN;
  const local = periodChange(id, h);
  const own = d.ccy === 'GBp' ? 'GBP' : d.ccy;
  if (ccy === 'Local' || own === ccy) return local;
  return inCurrency(local, vsUsd(own, h), vsUsd(ccy, h));
}

/** The period's start in words, for the notes. */
const since = (h: Horizon) => (h === '1D' ? "the previous close" : `the close on or before ${fmtDay(horizonStart(h))}`);

function PeriodControls({ ccy, setCcy, children }: { ccy: Ccy; setCcy: (c: Ccy) => void; children?: ReactNode }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <label className="fld">
        Currency{' '}
        <select className="sel-inp" aria-label="Return currency" value={ccy} onChange={(e) => setCcy(e.target.value as Ccy)}>
          {WORLD_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c === 'Local' ? "Each index's own" : c}
            </option>
          ))}
        </select>
      </label>
      {children}
    </div>
  );
}

export function WEIS(_: FnProps) {
  const panel = usePanelId();
  useTick(3);
  useHistoryVersion();
  const [tab, setTab] = useState(1);
  const [ccy, setCcy] = useState<Ccy>('Local');
  const [region, setRegion] = useState('');
  const p = WORLD_PERIODS[tab - 1];
  const ids = INDEX_GROUPS.filter((g) => !region || g.name === region).flatMap((g) => g.ids.map((id) => ({ id, region: g.name }))).filter((x) => engine.get(x.id) && engine.hasSource(x.id));
  const rows = ranked(ids.map((x) => ({ ...x, r: indexReturn(x.id, p.h, ccy) })), (x) => x.r);
  const max = Math.max(0.01, ...rows.map(({ row }) => Math.abs(row.r)).filter(Number.isFinite));
  const nums = useNumberedRows('weis-rows', rows, 1, ({ row }) => openSecurity(panel, row.id, undefined, 'CHART'), ({ row }) => indexShortName(row.id));
  const csv = () => [['Rank', 'Index', 'Name', 'Region', 'Currency', `${p.label} return % (${ccy === 'Local' ? 'local' : ccy})`], ...rows.map(({ row, rank }) => [rank ?? '', row.id, indexShortName(row.id), REGION_NAME[row.region], ccy === 'Local' ? engine.get(row.id)!.ccy : ccy, row.r])];
  const missing = rows.filter((x) => x.rank === null).map(({ row }) => indexShortName(row.id));
  return (
    <div>
      <FnHeader
        code="INDEXRANKING"
        title="World Equity Index Rankings"
        sub={`Price return over ${p.label}, ${ccy === 'Local' ? "in each index's own currency" : `in ${ccy}`}, highest first`}
        tabs={WORLD_PERIODS.map((x) => ({ n: x.n, label: x.label }))}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, 'world-index-rankings.csv', csv)}
        controls={
          <PeriodControls ccy={ccy} setCcy={setCcy}>
            <label className="fld">
              Region{' '}
              <select className="sel-inp" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">All</option>
                {INDEX_GROUPS.map((g) => (
                  <option key={g.name} value={g.name}>
                    {REGION_NAME[g.name]}
                  </option>
                ))}
              </select>
            </label>
          </PeriodControls>
        }
      />
      <table className="tbl" data-testid="weis-table">
        <thead>
          <tr>
            <th className="num">Rank</th>
            <th>Index</th>
            <th className="hide-m">Name</th>
            <th className="hide-m">Region</th>
            <th className="num">Last</th>
            <th className="num">{p.label} %</th>
            <th style={{ width: '28%' }} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, rank }, i) => (
            <tr key={row.id} className="click" onClick={(e) => openSecurity(panel, row.id, e, 'CHART')}>
              <td className="num amber">{rank ?? '--'}</td>
              <td>
                <RowNo n={nums[i]} />
                <SecLink id={row.id} fn="CHART">
                  {engine.get(row.id)!.ticker}
                </SecLink>
              </td>
              <td className="hide-m">{indexShortName(row.id)}</td>
              <td className="hide-m muted">{REGION_NAME[row.region]}</td>
              <td className="num white">
                <LivePx id={row.id} />
              </td>
              <td className="num">
                <Chg v={row.r} pct />
              </td>
              <td>{Number.isFinite(row.r) && <HBar value={row.r} max={max} signed />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">
        Price returns from {since(p.h)} to the last price, without dividends.{' '}
        {ccy === 'Local' ? "Each in its index's own currency." : `Turned into ${ccy} with each currency's change against the dollar over the same closes.`}
        {missing.length > 0 && ` Not ranked, for want of ${p.h === '1D' ? 'a confirmed previous close' : 'a close at the start of the period'}${ccy !== 'Local' ? ' or a currency rate' : ''}: ${missing.join(', ')}.`}
      </div>
    </div>
  );
}

/** How far the colours run, by period: a 2% day is as strong as a 25% year. */
const SCALE: Record<string, number> = { '1D': 2, '5D': 4, '1M': 6, '3M': 10, YTD: 20, '1Y': 25 };

export function WM(_: FnProps) {
  const panel = usePanelId();
  useTick(3);
  useHistoryVersion();
  const [tab, setTab] = useState(1);
  const [ccy, setCcy] = useState<Ccy>('Local');
  const p = WORLD_PERIODS[tab - 1];
  const scale = SCALE[p.h];
  const tiles = MAP_TILES.filter((t) => engine.get(t.id)).map((t) => ({ ...t, live: engine.hasSource(t.id), r: engine.hasSource(t.id) ? indexReturn(t.id, p.h, ccy) : NaN }));
  const cols = Math.max(...MAP_TILES.map((t) => t.col)) + 1;
  const rows = Math.max(...MAP_TILES.map((t) => t.row)) + 1;
  return (
    <div>
      <FnHeader
        code="WORLDMAP"
        title="World Equity Markets Map"
        sub={`Each market's main index, coloured by its price return over ${p.label}${ccy === 'Local' ? '' : ` in ${ccy}`}`}
        tabs={WORLD_PERIODS.map((x) => ({ n: x.n, label: x.label }))}
        tab={tab}
        onTab={setTab}
        controls={<PeriodControls ccy={ccy} setCcy={setCcy} />}
      />
      <div className="wm-grid" data-testid="wm-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(64px, auto))` }}>
        {tiles.map((t) => (
          <button
            key={t.country}
            type="button"
            className="wm-tile"
            style={{ gridColumn: t.col + 1, gridRow: t.row + 1, background: heatColour(t.r, scale) }}
            title={`${t.name}: ${indexShortName(t.id)} (${t.id}), ${Number.isFinite(t.r) ? fmtPct(t.r, 2) : 'no figure'} over ${p.label}. Opens its chart.`}
            aria-label={`${t.name} ${indexShortName(t.id)} ${Number.isFinite(t.r) ? fmtPct(t.r, 2) : 'no figure'}`}
            onClick={(e) => openSecurity(panel, t.id, e, 'CHART')}
          >
            <span className="wm-cc">{t.country}</span>
            <span className="wm-ix">{indexShortName(t.id)}</span>
            <span className="wm-pct">{Number.isFinite(t.r) ? fmtPct(t.r, 2) : '--'}</span>
          </button>
        ))}
      </div>
      <div className="wm-legend" aria-label="Colour scale">
        {[-1, -0.5, 0, 0.5, 1].map((f) => (
          <span key={f} style={{ background: heatColour(f * scale, scale) }}>
            {fmtPct(f * scale, 0)}
          </span>
        ))}
      </div>
      <div className="note">
        One main index per market (MARKET lists more), its price return from {since(p.h)} without dividends{ccy === 'Local' ? ", in its own currency" : `, turned into ${ccy} with each currency's change against the dollar`}. Colours run to full strength at ±{scale}%. A grey tile has no figure: no source for the index, or no close at the start of the period. The grid is the app&apos;s own layout, roughly as the markets lie.
      </div>
    </div>
  );
}
