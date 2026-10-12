import { useMemo, useState } from 'react';
import { FnHeader } from '../components/FnHeader';
import { Chg, LivePx, Section } from '../components/cells';
import { DataTable } from '../components/DataTable';
import { fmtNum, fmtTime, WEEKDAYS, zonedParts } from '../core/format';
import { engine, useInterval } from '../data/market';
import { DAY_MS } from '../data/calendar';
import { centralBanks, COUNTRY_NAMES, ecoEvents, type EcoEvent } from '../data/eco';
import { periodChange } from '../data/analytics';
import type { FnProps } from '../terminal/types';
import { RealBadge, SimBadge } from '../components/Source';
import { desktopData } from '../data/live/yahoo';

const COUNTRIES = ['US', 'EZ', 'DE', 'GB', 'JP', 'CN', 'CA', 'AU'];

/** Monday of the current week; on weekends, the coming week. */
function weekStart(ms: number): number {
  const d = new Date(ms);
  const wd = d.getUTCDay();
  if (wd === 6 || wd === 0) return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (wd === 6 ? 2 : 1));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (wd - 1));
}

function fmtVal(e: EcoEvent, v: number | null): string {
  if (v == null) return '';
  return `${fmtNum(v, e.dec)}${e.unit === '%' ? '%' : e.unit}`;
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function ECO(_: FnProps) {
  useInterval(1000);
  const now = engine.now();
  const [week, setWeek] = useState(2);
  const [ctry, setCtry] = useState<string[]>(COUNTRIES);
  const [minRel, setMinRel] = useState(1);
  const start = weekStart(now) + (week - 2) * 7 * DAY_MS;
  const all = useMemo(() => ecoEvents(start, start + 7 * DAY_MS, now), [start, Math.floor(now / 30_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = all.filter((e) => ctry.includes(e.country) && e.relevance >= minRel);
  const next = ecoEvents(now, now + 14 * DAY_MS, now).find((e) => e.relevance >= 3 && e.time > now);
  let lastDay = '';
  return (
    <div>
      <FnHeader
        code="ECO"
        title="Economic Calendar"
        sub={
          <>
            Times in your display time zone ·{' '}
            {all.some((e) => e.real) ? (
              <>
                <RealBadge /> Fed, ECB, BoE and BoC decisions · <SimBadge /> other releases, marked SIM
              </>
            ) : (
              <>
                <SimBadge /> release dates, consensus and actuals
              </>
            )}
          </>
        }
        tabs={[
          { n: 1, label: 'Last week' },
          { n: 2, label: 'This week' },
          { n: 3, label: 'Next week' },
        ]}
        tab={week}
        onTab={setWeek}
      />
      <div className="chart-tools">
        {COUNTRIES.map((c) => (
          <button key={c} type="button" className={`chip-btn${ctry.includes(c) ? ' on' : ''}`} style={ctry.includes(c) ? { background: 'var(--amber)' } : undefined} onClick={() => setCtry(ctry.includes(c) ? ctry.filter((x) => x !== c) : [...ctry, c])}>
            {c}
          </button>
        ))}
        <span className="seg" role="group" aria-label="Relevance">
          {[1, 2, 3].map((r) => (
            <button key={r} type="button" className={minRel === r ? 'on' : ''} onClick={() => setMinRel(r)}>
              {'●'.repeat(r)}+
            </button>
          ))}
        </span>
        {next && (
          <span>
            <span className="amber">Next key release</span> {next.country} {next.name} in <span className="white b">{countdown(next.time - now)}</span>
          </span>
        )}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Time</th>
            <th>Ctry</th>
            <th>Event</th>
            <th>Period</th>
            <th className="num">Survey</th>
            <th className="num">Actual</th>
            <th className="num">Prior</th>
            <th className="num hide-m">Revised</th>
            <th className="hide-m">Relevance</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr>
              <td colSpan={9} className="empty">
                No events for the selected filters.
              </td>
            </tr>
          )}
          {events.map((e, i) => {
            const p = zonedParts(e.time);
            const dayKey = `${p.y}-${p.mo}-${p.d}`;
            const head = dayKey !== lastDay;
            lastDay = dayKey;
            const diff = e.actual != null && e.survey != null ? e.actual - e.survey : 0;
            const released = e.actual != null;
            const soon = !released && e.time - now < 3600_000 && e.time > now;
            return [
              head ? (
                <tr key={`h${i}`} className="group">
                  <td colSpan={9}>
                    {WEEKDAYS[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]} {String(p.mo).padStart(2, '0')}/{String(p.d).padStart(2, '0')}/{String(p.y).slice(2)}
                  </td>
                </tr>
              ) : null,
              <tr key={e.id} style={!released && e.time < now + 7 * DAY_MS ? undefined : { opacity: 0.92 }}>
                <td className={soon ? 'yellow b' : 'muted'}>{fmtTime(e.time, false)}</td>
                <td className="amber">{e.country}</td>
                <td className={e.relevance >= 3 ? 'white b' : ''}>
                  {e.name}
                  {e.real || !all.some((x) => x.real) ? null : <span className="muted"> SIM</span>}
                </td>
                <td className="muted">{e.period}</td>
                <td className="num">{fmtVal(e, e.survey)}</td>
                <td className={`num b ${diff > 0 ? 'up' : diff < 0 ? 'dn' : 'white'}`}>{released ? fmtVal(e, e.actual) : soon ? <span className="yellow">{countdown(e.time - now)}</span> : ''}</td>
                <td className="num">{fmtVal(e, e.prior)}</td>
                <td className="num hide-m muted">{fmtVal(e, e.revised)}</td>
                <td className="hide-m amber" title={`Relevance ${e.relevance}/3`}>
                  {'●'.repeat(e.relevance)}
                  <span className="faint">{'●'.repeat(3 - e.relevance)}</span>
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

const STATS: Record<string, { gdp: number; cpi: number; un: number; y10?: string; idx?: string; ccy?: string }> = {
  US: { gdp: 1.8, cpi: 3.3, un: 4.4, y10: 'USGG10YR Index', idx: 'SPX Index', ccy: 'DXY Curncy' },
  EZ: { gdp: 0.9, cpi: 2.4, un: 6.3, y10: 'GDBR10 Index', idx: 'SX5E Index', ccy: 'EURUSD Curncy' },
  DE: { gdp: 0.4, cpi: 2.5, un: 3.7, y10: 'GDBR10 Index', idx: 'DAX Index', ccy: 'EURUSD Curncy' },
  FR: { gdp: 0.8, cpi: 1.6, un: 7.6, y10: 'GFRN10 Index', idx: 'CAC Index', ccy: 'EURUSD Curncy' },
  IT: { gdp: 0.6, cpi: 1.7, un: 6.1, y10: 'GBTPGR10 Index', idx: 'FTSEMIB Index', ccy: 'EURUSD Curncy' },
  ES: { gdp: 2.4, cpi: 2.9, un: 10.4, y10: 'GSPG10YR Index', idx: 'IBEX Index', ccy: 'EURUSD Curncy' },
  GB: { gdp: 1.0, cpi: 3.6, un: 5.1, y10: 'GUKG10 Index', idx: 'UKX Index', ccy: 'GBPUSD Curncy' },
  CH: { gdp: 1.0, cpi: 0.4, un: 2.9, y10: 'GSWISS10 Index', idx: 'SMI Index', ccy: 'USDCHF Curncy' },
  JP: { gdp: 0.7, cpi: 2.7, un: 2.5, y10: 'GJGB10 Index', idx: 'NKY Index', ccy: 'USDJPY Curncy' },
  CN: { gdp: 4.7, cpi: 0.6, un: 5.2, y10: 'GCNY10YR Index', idx: 'SHCOMP Index', ccy: 'USDCNH Curncy' },
  IN: { gdp: 6.7, cpi: 3.2, un: 5.1, y10: 'GIND10YR Index', idx: 'SENSEX Index', ccy: 'USDINR Curncy' },
  KR: { gdp: 1.6, cpi: 2.2, un: 2.8, idx: 'KOSPI Index', ccy: 'USDKRW Curncy' },
  AU: { gdp: 1.9, cpi: 3.1, un: 4.4, y10: 'GACGB10 Index', idx: 'AS51 Index', ccy: 'AUDUSD Curncy' },
  CA: { gdp: 1.3, cpi: 2.6, un: 6.8, y10: 'GCAN10YR Index', idx: 'SPTSX Index', ccy: 'USDCAD Curncy' },
  BR: { gdp: 2.0, cpi: 4.9, un: 6.0, y10: 'GEBR10Y Index', idx: 'IBOV Index', ccy: 'USDBRL Curncy' },
  MX: { gdp: 0.8, cpi: 3.9, un: 2.7, y10: 'GMXN10YR Index', idx: 'MEXBOL Index', ccy: 'USDMXN Curncy' },
};

export function ECST(_: FnProps) {
  useInterval(2000);
  const cbs = centralBanks();
  const policy = (c: string) => cbs.find((b) => b.country === (['DE', 'FR', 'IT', 'ES'].includes(c) ? 'EZ' : c))?.rate;
  const rows = Object.entries(STATS).map(([c, s]) => ({ c, ...s, rate: policy(c) }));
  return (
    <div>
      <FnHeader
        code="ECST"
        title="World Economic Statistics"
        sub={
          <>
            <SimBadge /> GDP, inflation and jobless figures are reference settings{desktopData() ? ' · market levels and the Fed, ECB, BoE and BoC rates are real' : ''}
          </>
        }
      />
      <DataTable
        rows={rows}
        rowKey={(r) => r.c}
        columns={[
          { key: 'c', label: 'Country', render: (r) => <span className="amber">{COUNTRY_NAMES[r.c]}</span>, sort: (r) => COUNTRY_NAMES[r.c] },
          { key: 'g', label: 'GDP YoY %', num: true, render: (r) => fmtNum(r.gdp, 1), sort: (r) => r.gdp },
          { key: 'i', label: 'CPI YoY %', num: true, render: (r) => fmtNum(r.cpi, 1), sort: (r) => r.cpi },
          { key: 'u', label: 'Unemp %', num: true, render: (r) => fmtNum(r.un, 1), sort: (r) => r.un },
          { key: 'r', label: 'Policy %', num: true, render: (r) => (r.rate != null ? fmtNum(r.rate, 2) : '--'), sort: (r) => r.rate ?? NaN },
          { key: 'real', label: 'Real rate', num: true, render: (r) => (r.rate != null ? <Chg v={r.rate - r.cpi} dec={2} /> : '--'), sort: (r) => (r.rate ?? NaN) - r.cpi, hideM: true },
          { key: 'y', label: '10Y yld', num: true, render: (r) => (r.y10 ? <LivePx id={r.y10} /> : '--') },
          { key: 'idx', label: 'Equity YTD', num: true, render: (r) => (r.idx ? <Chg v={periodChange(r.idx, 'YTD')} pct dec={1} /> : '--'), sort: (r) => (r.idx ? periodChange(r.idx, 'YTD') : NaN) },
          { key: 'fx', label: 'FX YTD', num: true, render: (r) => (r.ccy ? <Chg v={periodChange(r.ccy, 'YTD')} pct dec={1} /> : '--'), hideM: true },
        ]}
      />
      <Section title="Central banks">
        <DataTable
          rows={cbs}
          rowKey={(b) => b.code}
          columns={[
            { key: 'b', label: 'Bank', render: (b) => b.bank },
            { key: 'r', label: 'Rate', num: true, render: (b) => `${fmtNum(b.rate, 2)}%` },
            { key: 'n', label: 'Next meeting', render: (b) => b.meetings.find((m) => Date.parse(`${m}T23:59:00Z`) > engine.now()) ?? 'n/a' },
          ]}
        />
      </Section>
      <div className="note">FX YTD is the pair as quoted (e.g. USDJPY up = weaker yen).</div>
    </div>
  );
}
