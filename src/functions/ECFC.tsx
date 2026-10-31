import { useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { RealBadge } from '../components/Source';
import { exportActions } from '../components/ExportActions';
import { XYChart } from '../components/chart/XYChart';
import { fmtNum, fmtSigned } from '../core/format';
import { useWeo, weoAvailable, WEO, type WeoValues } from '../data/live/weo';
import { roundLabel, SPF_TOPICS, useEcbSpf, type EcbSpf } from '../data/live/spf';
import { CREDITS } from '../components/Credits';
import { usePanelId } from '../terminal/panel';
import type { FnProps } from '../terminal/types';

/**
 * ECFC, economic forecasts: the IMF's World Economic Outlook for the world, its regions and the largest economies,
 * one indicator at a time (GDP growth, inflation, unemployment, current account, government balance and debt), two
 * years back to five ahead, with any economy's history and projections on a chart. From the current year on the
 * figures are the IMF's projections. The ECB's Survey of Professional Forecasters gives the euro area's consensus beside
 * it: the panel's average for this year, the next two and the longer term, against the round before.
 */

/** The groups the WEO gives figures for, in the order the WEO tables list them. */
export const REGIONS = ['WEOWORLD', 'ADVEC', 'MAE', 'EURO', 'EU', 'OEMDC', 'DA', 'AS5', 'WE', 'MECA'];
export const MAJOR = ['USA', 'CHN', 'DEU', 'JPN', 'IND', 'GBR', 'FRA', 'ITA', 'CAN', 'BRA', 'RUS', 'KOR', 'AUS', 'ESP', 'MEX', 'IDN', 'NLD', 'TUR', 'SAU', 'CHE', 'ARG', 'ZAF'];

/** The years shown: two back, the current one, two ahead and five ahead. */
export function yearsAround(current: number): number[] {
  return [current - 2, current - 1, current, current + 1, current + 2, current + 5];
}

/** The rows of a view: the regions then the major economies, or every economy by name; the codes the IMF gives figures for. */
export function weoRows(values: WeoValues, names: Record<string, string>, view: 'major' | 'all', words: string): string[] {
  const w = words.trim().toLowerCase();
  const has = (c: string) => !!values[c] && Object.keys(values[c]).length > 0;
  const match = (c: string) => !w || c.toLowerCase().includes(w) || (names[c] ?? '').toLowerCase().includes(w);
  if (view === 'major') return [...REGIONS, ...MAJOR].filter((c) => has(c) && match(c));
  return Object.keys(values)
    .filter((c) => has(c) && /^[A-Z]{3}$/.test(c) && !REGIONS.includes(c) && match(c))
    .sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b));
}

/** The survey's table: one row per variable, the round's average for each year and the longer term, and its change since the round before. */
export function SpfTable({ spf }: { spf: EcbSpf }) {
  const horizons = [...spf.years, 'LT'];
  const head = (h: string) => (h === 'LT' ? `Longer term${spf.longTermYear ? ` (${spf.longTermYear})` : ''}` : h);
  return (
    <table className="tbl" aria-label="Survey of Professional Forecasters">
      <thead>
        <tr>
          <th>Euro area</th>
          {horizons.map((h) => <th key={h} className="num cyan">{head(h)}</th>)}
          {horizons.map((h) => <th key={`d${h}`} className="num">Chg {h === 'LT' ? 'LT' : h}</th>)}
        </tr>
      </thead>
      <tbody>
        {SPF_TOPICS.map((t) => {
          const row = spf.values[t.id] ?? {};
          return (
            <tr key={t.id}>
              <td>{t.label}, {t.unit}</td>
              {horizons.map((h) => <td key={h} className="num cyan">{row[h] ? fmtNum(row[h].now, 2) : ''}</td>)}
              {horizons.map((h) => {
                const c = row[h];
                // Coloured by the change as shown: one that rounds to 0.00 is neither up nor down.
                const d = c && c.before !== undefined ? Math.round((c.now - c.before) * 100) / 100 : undefined;
                return <td key={`d${h}`} className={`num${d === undefined ? '' : d > 0 ? ' up' : d < 0 ? ' down' : ''}`}>{d === undefined ? '' : fmtSigned(d, 2)}</td>;
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SurveyView() {
  const { state, spf, message } = useEcbSpf(true);
  if (state === 'none') return <div className="empty">The ECB&apos;s survey is read from the ECB Data Portal in the desktop app. The browser demo has none, and none is generated.</div>;
  if (state === 'loading') return <div className="empty">Reading the ECB&apos;s Survey of Professional Forecasters…</div>;
  if (state === 'error' || !spf) return <div className="empty amber" role="status">{message}</div>;
  return (
    <div data-testid="ecb-spf">
      <div className="pad-s">
        <b>ECB Survey of Professional Forecasters, {roundLabel(spf.round)} round</b>: the average of the panel&apos;s point forecasts for the euro area, by
        calendar year.{spf.previous ? ` Chg: the change since the ${roundLabel(spf.previous)} round for the same year.` : ''}
      </div>
      <SpfTable spf={spf} />
      <div className="note">
        The ECB publishes the survey&apos;s results four times a year. The longer term is the year five years ahead in the third and fourth quarters&apos; rounds
        and four years ahead in the first and second. {CREDITS.ecb}
      </div>
    </div>
  );
}

export function ECFC({ route }: FnProps) {
  const panel = usePanelId();
  const [source, setSource] = useState<'imf' | 'ecb-spf'>('imf');
  const [tab, setTab] = useState(1);
  const [view, setView] = useState<'major' | 'all'>('major');
  const [words, setWords] = useState('');
  const [picked, setPicked] = useState((route.args ?? '').trim().toUpperCase() || 'WEOWORLD');
  const ind = WEO[tab - 1] ?? WEO[0];
  const { part, names, edition } = useWeo(ind.id);
  const values = part?.state === 'ok' ? part.data : {};
  const current = new Date().getUTCFullYear();
  const years = yearsAround(current);
  const rows = weoRows(values, names, view, words);
  const name = (c: string) => names[c] ?? c;
  // The IMF has no figure for some groups on some indicators (no world unemployment rate): the first row is drawn.
  const drawn = Object.keys(values[picked] ?? {}).length ? picked : (rows[0] ?? picked);
  const series = values[drawn] ?? {};
  const hist = Object.entries(series).map(([y, v]) => ({ x: Number(y), y: v })).filter((p) => p.x >= 2000).sort((a, b) => a.x - b.x);
  const chart = [
    { label: `${name(drawn)}, reported`, color: '#e8e8e8', points: hist.filter((p) => p.x < current) },
    { label: 'IMF projections', color: '#45d3e6', dash: [4, 3], markers: true, points: hist.filter((p) => p.x >= current - 1) },
  ].filter((s) => s.points.length);
  const csv = () => [['Code', 'Economy', ...years.map(String)], ...rows.map((c) => [c, name(c), ...years.map((y) => values[c]?.[y] ?? '')])];
  const status = !weoAvailable()
    ? 'The World Economic Outlook is read from the IMF in the desktop app. The browser demo has none, and none is generated.'
    : !part || part.state === 'loading'
      ? 'Reading the IMF’s World Economic Outlook…'
      : part.state === 'error'
        ? part.message
        : '';
  const pick = (
    <label className="fld">
      Source
      <select className="sel-inp" aria-label="Forecasts from" value={source} onChange={(e) => setSource(e.target.value as 'imf' | 'ecb-spf')}>
        <option value="imf">IMF World Economic Outlook</option>
        <option value="ecb-spf">ECB Survey of Professional Forecasters (euro area)</option>
      </select>
    </label>
  );
  if (source === 'ecb-spf') {
    return (
      <div>
        <FnHeader code="ECOFORECASTS" title="Economic Forecasts" sub={<><RealBadge /> ECB Survey of Professional Forecasters · euro area</>} controls={<div className="chart-tools">{pick}</div>} />
        <SurveyView />
      </div>
    );
  }
  return (
    <div>
      <FnHeader
        code="ECOFORECASTS"
        title="Economic Forecasts"
        sub={<><RealBadge /> IMF {edition || 'World Economic Outlook'} · {ind.label}, {ind.unit}</>}
        tabs={WEO.map((w, i) => ({ n: i + 1, label: w.short }))}
        tab={tab}
        onTab={setTab}
        actions={exportActions(panel, `ECFC_${ind.id}.csv`, csv)}
        controls={
          <div className="chart-tools">
            {pick}
            <label className="fld">
              Show
              <select className="sel-inp" aria-label="Show" value={view} onChange={(e) => setView(e.target.value as 'major' | 'all')}>
                <option value="major">Regions and major economies</option>
                <option value="all">Every economy</option>
              </select>
            </label>
            <input className="inp" aria-label="Find an economy" placeholder="Economy" value={words} onChange={(e) => setWords(e.target.value)} />
          </div>
        }
      />
      {status ? (
        <div className="empty">{status}</div>
      ) : (
        <>
          {chart.length > 0 && <XYChart series={chart} xFormat={(v) => String(Math.round(v))} yFormat={(v) => fmtNum(v, ind.dec)} refLines={[{ x: current - 0.5, color: '#777', label: 'Projections' }]} height={200} legend />}
          <table className="tbl" aria-label="Forecasts">
            <thead>
              <tr>
                <th>Economy</th>
                {years.map((y) => (
                  <th key={y} className={`num${y >= current ? ' cyan' : ''}`}>{y}{y >= current ? ' P' : ''}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c} className={`click${c === drawn ? ' sel' : ''}`} onClick={() => setPicked(c)}>
                  <td className={REGIONS.includes(c) ? 'amber' : undefined}>{name(c)}</td>
                  {years.map((y) => {
                    const v = values[c]?.[y];
                    return (
                      <td key={y} className={`num${y >= current ? ' cyan' : ''}`}>{v != null ? fmtNum(v, ind.dec) : ''}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <div className="empty">{Object.keys(values).length ? 'No economy matches.' : `The IMF gave no ${ind.label.toLowerCase()} figures.`}</div>}
          <div className="note">
            P marks the IMF&apos;s projections: from the current year on (an economy&apos;s latest years may also be estimates). Regions are the IMF&apos;s
            groups, weighted as the IMF weights them. A row draws its history and projections. {CREDITS.imf}
          </div>
        </>
      )}
    </div>
  );
}
